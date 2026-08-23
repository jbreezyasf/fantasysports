-- Big Exec V1 waivers
-- Goal: prevent direct late-season roster dumping while giving lower-ranked
-- franchises first opportunity at dropped players.

alter table public.league_seasons
  add column if not exists waiver_period_hours integer not null default 48
  check (waiver_period_hours between 1 and 168);

create table if not exists public.waiver_holds (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  athlete_id uuid references public.athletes(id),
  real_team_id uuid references public.real_teams(id),
  source_roster_entry_id uuid references public.roster_entries(id),
  source_season_franchise_id uuid references public.season_franchises(id),
  starts_at timestamptz not null default now(),
  clears_at timestamptz not null,
  status text not null default 'open' check (status in ('open','claimed','expired')),
  claimed_by_season_franchise_id uuid references public.season_franchises(id),
  resolved_at timestamptz,
  check (((athlete_id is not null)::int + (real_team_id is not null)::int) = 1)
);

create unique index if not exists waiver_holds_open_athlete_unique
  on public.waiver_holds(league_season_id,athlete_id)
  where status='open' and athlete_id is not null;
create unique index if not exists waiver_holds_open_team_unique
  on public.waiver_holds(league_season_id,real_team_id)
  where status='open' and real_team_id is not null;
create index if not exists waiver_holds_due_idx
  on public.waiver_holds(league_season_id,clears_at)
  where status='open';

create table if not exists public.waiver_claims (
  id uuid primary key default gen_random_uuid(),
  waiver_hold_id uuid not null references public.waiver_holds(id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id) on delete cascade,
  drop_roster_entry_id uuid references public.roster_entries(id),
  status text not null default 'pending' check (status in ('pending','won','lost','failed','withdrawn')),
  priority_rank integer,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  failure_reason text,
  unique(waiver_hold_id,season_franchise_id)
);
create index if not exists waiver_claims_pending_idx
  on public.waiver_claims(waiver_hold_id,created_at)
  where status='pending';

alter table public.waiver_holds enable row level security;
alter table public.waiver_claims enable row level security;

drop policy if exists league_members_read_waiver_holds on public.waiver_holds;
create policy league_members_read_waiver_holds on public.waiver_holds
for select to authenticated
using (
  exists (
    select 1 from public.league_seasons ls
    where ls.id=waiver_holds.league_season_id
      and public.is_league_member(ls.league_id)
  )
);

drop policy if exists claimant_or_commissioner_read_waiver_claims on public.waiver_claims;
create policy claimant_or_commissioner_read_waiver_claims on public.waiver_claims
for select to authenticated
using (
  exists (
    select 1
    from public.season_franchises sf
    join public.franchise_owners fo on fo.franchise_id=sf.franchise_id
    where sf.id=waiver_claims.season_franchise_id
      and fo.user_id=auth.uid()
      and fo.ends_on is null
  )
  or exists (
    select 1
    from public.waiver_holds wh
    join public.league_seasons ls on ls.id=wh.league_season_id
    join public.league_members lm on lm.league_id=ls.league_id
    where wh.id=waiver_claims.waiver_hold_id
      and lm.user_id=auth.uid()
      and lm.role='commissioner'
  )
);

grant select on public.waiver_holds to authenticated;
grant select on public.waiver_claims to authenticated;

create or replace function public.submit_waiver_claim(
  p_waiver_hold_id uuid,
  p_season_franchise_id uuid,
  p_drop_roster_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_hold waiver_holds%rowtype;
  v_claim uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_hold from waiver_holds where id=p_waiver_hold_id for update;
  if v_hold.id is null or v_hold.status<>'open' then raise exception 'This player is no longer on waivers'; end if;

  if not exists (
    select 1 from season_franchises sf
    join franchise_owners fo on fo.franchise_id=sf.franchise_id
    where sf.id=p_season_franchise_id
      and sf.league_season_id=v_hold.league_season_id
      and fo.user_id=v_user
      and fo.ends_on is null
  ) then raise exception 'You do not manage this franchise'; end if;

  if v_hold.source_season_franchise_id=p_season_franchise_id then
    raise exception 'A franchise cannot reclaim its own dropped player during the initial waiver period';
  end if;

  if p_drop_roster_entry_id is not null and not exists (
    select 1 from roster_entries
    where id=p_drop_roster_entry_id
      and season_franchise_id=p_season_franchise_id
      and dropped_at is null
  ) then raise exception 'The selected drop is no longer on your roster'; end if;

  insert into waiver_claims(waiver_hold_id,season_franchise_id,drop_roster_entry_id,status)
  values(p_waiver_hold_id,p_season_franchise_id,p_drop_roster_entry_id,'pending')
  on conflict(waiver_hold_id,season_franchise_id)
  do update set drop_roster_entry_id=excluded.drop_roster_entry_id,status='pending',resolved_at=null,failure_reason=null
  returning id into v_claim;

  return v_claim;
end
$function$;

create or replace function public.withdraw_waiver_claim(p_waiver_claim_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_claim waiver_claims%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_claim from waiver_claims where id=p_waiver_claim_id for update;
  if v_claim.id is null then raise exception 'Waiver claim not found'; end if;
  if v_claim.status<>'pending' then raise exception 'Only pending claims can be withdrawn'; end if;
  if not exists (
    select 1 from season_franchises sf
    join franchise_owners fo on fo.franchise_id=sf.franchise_id
    where sf.id=v_claim.season_franchise_id and fo.user_id=v_user and fo.ends_on is null
  ) then raise exception 'You do not own this waiver claim'; end if;
  update waiver_claims set status='withdrawn',resolved_at=now() where id=v_claim.id;
  return v_claim.id;
end
$function$;

create or replace function public.process_due_waivers(p_league_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hold waiver_holds%rowtype;
  v_claim record;
  v_roster_config jsonb;
  v_roster_limit integer;
  v_active_count integer;
  v_drop_athlete uuid;
  v_drop_team uuid;
  v_period integer;
  v_league uuid;
  v_winner uuid;
  v_processed integer:=0;
  v_claimed integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('waivers:'||p_league_season_id::text,0));

  select roster_config,waiver_period_hours,league_id
    into v_roster_config,v_period,v_league
  from league_seasons where id=p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;

  select coalesce(sum(value::int),0) + coalesce((v_roster_config->>'bench')::int,0)
    into v_roster_limit
  from jsonb_each_text(coalesce(v_roster_config->'starters','{}'::jsonb));

  for v_hold in
    select * from waiver_holds
    where league_season_id=p_league_season_id and status='open' and clears_at<=now()
    order by clears_at,id
    for update skip locked
  loop
    v_processed:=v_processed+1;
    v_winner:=null;

    if exists (
      select 1 from roster_entries re
      join season_franchises sf on sf.id=re.season_franchise_id
      where sf.league_season_id=p_league_season_id
        and re.dropped_at is null
        and ((v_hold.athlete_id is not null and re.athlete_id=v_hold.athlete_id)
          or (v_hold.real_team_id is not null and re.real_team_id=v_hold.real_team_id))
    ) then
      update waiver_claims set status='failed',resolved_at=now(),failure_reason='Asset is no longer available'
      where waiver_hold_id=v_hold.id and status='pending';
      update waiver_holds set status='expired',resolved_at=now() where id=v_hold.id;
      continue;
    end if;

    for v_claim in
      with ranked as (
        select wc.*,
          row_number() over (
            order by
              case when (s.wins+s.losses+s.ties)=0 then 0 else 1 end asc,
              case when (s.wins+s.losses+s.ties)=0 then sf.draft_position end desc nulls last,
              case when (s.wins+s.losses+s.ties)>0
                then (s.wins + 0.5*s.ties)::numeric/(s.wins+s.losses+s.ties)
              end asc nulls last,
              case when (s.wins+s.losses+s.ties)>0 then s.points_for end asc nulls last,
              wc.created_at asc,
              wc.id asc
          ) as calculated_priority
        from waiver_claims wc
        join season_franchises sf on sf.id=wc.season_franchise_id
        join standings s on s.league_season_id=p_league_season_id and s.season_franchise_id=wc.season_franchise_id
        where wc.waiver_hold_id=v_hold.id and wc.status='pending'
      )
      select * from ranked order by calculated_priority
    loop
      update waiver_claims set priority_rank=v_claim.calculated_priority where id=v_claim.id;

      select count(*) into v_active_count from roster_entries
      where season_franchise_id=v_claim.season_franchise_id and dropped_at is null;

      if v_active_count>=v_roster_limit and v_claim.drop_roster_entry_id is null then
        update waiver_claims set status='failed',resolved_at=now(),failure_reason='Roster is full and no drop was selected' where id=v_claim.id;
        continue;
      end if;

      v_drop_athlete:=null; v_drop_team:=null;
      if v_claim.drop_roster_entry_id is not null then
        select athlete_id,real_team_id into v_drop_athlete,v_drop_team
        from roster_entries
        where id=v_claim.drop_roster_entry_id
          and season_franchise_id=v_claim.season_franchise_id
          and dropped_at is null
        for update;
        if not found then
          update waiver_claims set status='failed',resolved_at=now(),failure_reason='Selected drop is no longer on roster' where id=v_claim.id;
          continue;
        end if;
        if exists (
          select 1 from lineups l
          where l.season_franchise_id=v_claim.season_franchise_id
            and l.locked_at is not null
            and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete)
              or (v_drop_team is not null and l.real_team_id=v_drop_team))
        ) then
          update waiver_claims set status='failed',resolved_at=now(),failure_reason='Selected drop is locked in a lineup' where id=v_claim.id;
          continue;
        end if;

        delete from lineups l
        where l.season_franchise_id=v_claim.season_franchise_id
          and l.locked_at is null
          and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete)
            or (v_drop_team is not null and l.real_team_id=v_drop_team));

        update roster_entries set dropped_at=now()
        where id=v_claim.drop_roster_entry_id and dropped_at is null;

        insert into waiver_holds(league_season_id,athlete_id,real_team_id,source_roster_entry_id,source_season_franchise_id,clears_at)
        values(p_league_season_id,v_drop_athlete,v_drop_team,v_claim.drop_roster_entry_id,v_claim.season_franchise_id,now()+make_interval(hours=>v_period));
      end if;

      insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via)
      values(v_claim.season_franchise_id,v_hold.athlete_id,v_hold.real_team_id,'waiver');

      v_winner:=v_claim.season_franchise_id;
      update waiver_claims set status='won',resolved_at=now(),failure_reason=null where id=v_claim.id;
      update waiver_claims set status='lost',resolved_at=now() where waiver_hold_id=v_hold.id and status='pending' and id<>v_claim.id;
      update waiver_holds set status='claimed',claimed_by_season_franchise_id=v_winner,resolved_at=now() where id=v_hold.id;
      insert into league_feed_events(league_id,season_id,event_type,body,payload)
      values(v_league,p_league_season_id,'waiver_claimed','Waiver claim awarded',jsonb_build_object('waiver_hold_id',v_hold.id,'winner_season_franchise_id',v_winner,'athlete_id',v_hold.athlete_id,'real_team_id',v_hold.real_team_id));
      v_claimed:=v_claimed+1;
      exit;
    end loop;

    if v_winner is null then
      update waiver_holds set status='expired',resolved_at=now() where id=v_hold.id and status='open';
    end if;
  end loop;

  return jsonb_build_object('status','ok','processed',v_processed,'claimed',v_claimed);
end
$function$;

create or replace function public.process_all_due_waivers()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ls record;
  v_result jsonb;
  v_leagues integer:=0;
  v_processed integer:=0;
begin
  for v_ls in
    select distinct league_season_id from waiver_holds where status='open' and clears_at<=now()
  loop
    v_result:=process_due_waivers(v_ls.league_season_id);
    v_leagues:=v_leagues+1;
    v_processed:=v_processed+coalesce((v_result->>'processed')::integer,0);
  end loop;
  return jsonb_build_object('status','ok','league_seasons',v_leagues,'processed',v_processed);
end
$function$;

create or replace function public.claim_free_agent(
  p_season_franchise_id uuid,
  p_athlete_id uuid default null::uuid,
  p_real_team_id uuid default null::uuid,
  p_drop_roster_entry_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_league_season_id uuid;
  v_roster_config jsonb;
  v_roster_limit integer;
  v_active_count integer;
  v_new_id uuid;
  v_hold waiver_holds%rowtype;
  v_drop_athlete uuid;
  v_drop_team uuid;
  v_period integer;
begin
  if v_user_id is null then raise exception 'You must be signed in.'; end if;
  if ((p_athlete_id is not null)::int + (p_real_team_id is not null)::int) <> 1 then raise exception 'Choose exactly one player or defense.'; end if;

  select sf.league_season_id,ls.roster_config,ls.waiver_period_hours
    into v_league_season_id,v_roster_config,v_period
  from season_franchises sf
  join franchises f on f.id=sf.franchise_id
  join franchise_owners fo on fo.franchise_id=f.id
  join league_seasons ls on ls.id=sf.league_season_id
  where sf.id=p_season_franchise_id and fo.user_id=v_user_id and fo.ends_on is null
  for update of sf;
  if v_league_season_id is null then raise exception 'You do not manage this franchise.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_league_season_id::text,0));

  select * into v_hold from waiver_holds
  where league_season_id=v_league_season_id and status='open'
    and ((p_athlete_id is not null and athlete_id=p_athlete_id)
      or (p_real_team_id is not null and real_team_id=p_real_team_id))
  limit 1 for update;
  if v_hold.id is not null then
    if v_hold.clears_at>now() or exists(select 1 from waiver_claims where waiver_hold_id=v_hold.id and status='pending') then
      raise exception 'That asset is on waivers and must be claimed through the waiver process.';
    end if;
    update waiver_holds set status='expired',resolved_at=now() where id=v_hold.id;
  end if;

  if exists (
    select 1 from roster_entries re join season_franchises sf on sf.id=re.season_franchise_id
    where sf.league_season_id=v_league_season_id and re.dropped_at is null
      and ((p_athlete_id is not null and re.athlete_id=p_athlete_id)
        or (p_real_team_id is not null and re.real_team_id=p_real_team_id))
  ) then raise exception 'That asset is no longer available.'; end if;

  select count(*) into v_active_count from roster_entries where season_franchise_id=p_season_franchise_id and dropped_at is null;
  select coalesce(sum(value::int),0)+coalesce((v_roster_config->>'bench')::int,0) into v_roster_limit
  from jsonb_each_text(coalesce(v_roster_config->'starters','{}'::jsonb));
  if p_drop_roster_entry_id is null and v_active_count>=v_roster_limit then raise exception 'Your roster is full. Choose a player to drop.'; end if;

  if p_drop_roster_entry_id is not null then
    select athlete_id,real_team_id into v_drop_athlete,v_drop_team from roster_entries
    where id=p_drop_roster_entry_id and season_franchise_id=p_season_franchise_id and dropped_at is null
    for update;
    if not found then raise exception 'The player selected to drop is no longer on your roster.'; end if;
    if exists (
      select 1 from lineups l where l.season_franchise_id=p_season_franchise_id and l.locked_at is not null
        and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete)
          or (v_drop_team is not null and l.real_team_id=v_drop_team))
    ) then raise exception 'That player is locked in a lineup and cannot be dropped.'; end if;

    delete from lineups l where l.season_franchise_id=p_season_franchise_id and l.locked_at is null
      and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete)
        or (v_drop_team is not null and l.real_team_id=v_drop_team));
    update roster_entries set dropped_at=now() where id=p_drop_roster_entry_id and dropped_at is null;

    insert into waiver_holds(league_season_id,athlete_id,real_team_id,source_roster_entry_id,source_season_franchise_id,clears_at)
    values(v_league_season_id,v_drop_athlete,v_drop_team,p_drop_roster_entry_id,p_season_franchise_id,now()+make_interval(hours=>v_period));
  end if;

  insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via)
  values(p_season_franchise_id,p_athlete_id,p_real_team_id,'free_agent') returning id into v_new_id;
  return v_new_id;
end
$function$;

revoke execute on function public.submit_waiver_claim(uuid,uuid,uuid) from public,anon;
grant execute on function public.submit_waiver_claim(uuid,uuid,uuid) to authenticated;
revoke execute on function public.withdraw_waiver_claim(uuid) from public,anon;
grant execute on function public.withdraw_waiver_claim(uuid) to authenticated;
revoke execute on function public.claim_free_agent(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.claim_free_agent(uuid,uuid,uuid,uuid) to authenticated;
revoke execute on function public.process_due_waivers(uuid) from public,anon,authenticated;
revoke execute on function public.process_all_due_waivers() from public,anon,authenticated;
grant execute on function public.process_due_waivers(uuid) to service_role;
grant execute on function public.process_all_due_waivers() to service_role;

create extension if not exists pg_cron;

do $block$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='big-exec-process-waivers' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end
$block$;

select cron.schedule(
  'big-exec-process-waivers',
  '*/15 * * * *',
  $cron$select public.process_all_due_waivers();$cron$
);
