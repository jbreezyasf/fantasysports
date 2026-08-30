-- Big Exec Roster Integrity Mode
-- Prevent post-trade-deadline roster dumping while preserving legitimate
-- free-agent/waiver management for franchises that are still competing.

alter table public.league_seasons
  add column if not exists roster_integrity_mode text not null default 'automatic'
    check (roster_integrity_mode in ('automatic','commissioner_review','open')),
  add column if not exists roster_integrity_bulk_drop_limit integer not null default 3
    check (roster_integrity_bulk_drop_limit between 1 and 10),
  add column if not exists roster_integrity_bulk_window_hours integer not null default 24
    check (roster_integrity_bulk_window_hours between 1 and 168),
  add column if not exists roster_integrity_protect_core_assets boolean not null default true,
  add column if not exists roster_integrity_lock_eliminated boolean not null default true;

alter table public.season_franchises
  add column if not exists roster_locked_at timestamptz,
  add column if not exists roster_lock_reason text;

create table if not exists public.roster_integrity_reviews (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id) on delete cascade,
  roster_entry_id uuid not null references public.roster_entries(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  reason_code text not null,
  reason_detail text not null,
  manager_note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  decision_note text
);

create unique index if not exists roster_integrity_reviews_one_pending
  on public.roster_integrity_reviews(roster_entry_id)
  where status='pending';
create index if not exists roster_integrity_reviews_league_status_idx
  on public.roster_integrity_reviews(league_season_id,status,requested_at desc);

create table if not exists public.roster_integrity_overrides (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id) on delete cascade,
  roster_entry_id uuid not null references public.roster_entries(id) on delete cascade,
  review_id uuid references public.roster_integrity_reviews(id) on delete set null,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  consumed_at timestamptz,
  note text
);
create index if not exists roster_integrity_overrides_active_idx
  on public.roster_integrity_overrides(roster_entry_id,expires_at)
  where consumed_at is null;

create table if not exists public.roster_integrity_audit (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  season_franchise_id uuid references public.season_franchises(id) on delete cascade,
  roster_entry_id uuid references public.roster_entries(id) on delete set null,
  actor_id uuid references auth.users(id),
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists roster_integrity_audit_league_idx
  on public.roster_integrity_audit(league_season_id,created_at desc);

alter table public.roster_integrity_reviews enable row level security;
alter table public.roster_integrity_overrides enable row level security;
alter table public.roster_integrity_audit enable row level security;

drop policy if exists roster_integrity_reviews_visible on public.roster_integrity_reviews;
create policy roster_integrity_reviews_visible on public.roster_integrity_reviews
for select to authenticated
using (
  requested_by=auth.uid()
  or exists (
    select 1 from public.league_seasons ls
    join public.league_members lm on lm.league_id=ls.league_id
    where ls.id=roster_integrity_reviews.league_season_id
      and lm.user_id=auth.uid() and lm.role='commissioner'
  )
);

drop policy if exists roster_integrity_overrides_visible on public.roster_integrity_overrides;
create policy roster_integrity_overrides_visible on public.roster_integrity_overrides
for select to authenticated
using (
  exists (
    select 1 from public.season_franchises sf
    join public.franchise_owners fo on fo.franchise_id=sf.franchise_id
    where sf.id=roster_integrity_overrides.season_franchise_id
      and fo.user_id=auth.uid() and fo.ends_on is null
  )
  or exists (
    select 1 from public.league_seasons ls
    join public.league_members lm on lm.league_id=ls.league_id
    where ls.id=roster_integrity_overrides.league_season_id
      and lm.user_id=auth.uid() and lm.role='commissioner'
  )
);

drop policy if exists roster_integrity_audit_commissioner on public.roster_integrity_audit;
create policy roster_integrity_audit_commissioner on public.roster_integrity_audit
for select to authenticated
using (
  exists (
    select 1 from public.league_seasons ls
    join public.league_members lm on lm.league_id=ls.league_id
    where ls.id=roster_integrity_audit.league_season_id
      and lm.user_id=auth.uid() and lm.role='commissioner'
  )
);

grant select on public.roster_integrity_reviews to authenticated;
grant select on public.roster_integrity_overrides to authenticated;
grant select on public.roster_integrity_audit to authenticated;

-- Determine whether an asset is a core/high-value player using current
-- season-to-date Big Exec fantasy scoring. Protection activates only when
-- the current league season actually has score data for that asset.
create or replace function public.roster_integrity_asset_is_protected(p_roster_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_league_season_id uuid;
  v_athlete_id uuid;
  v_real_team_id uuid;
  v_position text;
  v_rank integer;
  v_threshold integer;
begin
  select sf.league_season_id,re.athlete_id,re.real_team_id
    into v_league_season_id,v_athlete_id,v_real_team_id
  from roster_entries re
  join season_franchises sf on sf.id=re.season_franchise_id
  where re.id=p_roster_entry_id and re.dropped_at is null;

  if v_league_season_id is null then return false; end if;

  if v_athlete_id is not null then
    select position into v_position from athletes where id=v_athlete_id;
    v_threshold:=case v_position
      when 'QB' then 12
      when 'RB' then 30
      when 'WR' then 40
      when 'TE' then 15
      when 'K' then 12
      else 0
    end;
    if v_threshold=0 then return false; end if;

    with totals as (
      select fps.athlete_id,sum(fps.points) total_points
      from fantasy_player_scores fps
      join athletes a on a.id=fps.athlete_id
      where fps.league_season_id=v_league_season_id and a.position=v_position
      group by fps.athlete_id
    ), ranked as (
      select athlete_id,row_number() over(order by total_points desc,athlete_id) rank_no
      from totals
    )
    select rank_no into v_rank from ranked where athlete_id=v_athlete_id;

    return coalesce(v_rank<=v_threshold,false);
  end if;

  if v_real_team_id is not null then
    with totals as (
      select fts.real_team_id,sum(fts.points) total_points
      from fantasy_team_scores fts
      where fts.league_season_id=v_league_season_id
      group by fts.real_team_id
    ), ranked as (
      select real_team_id,row_number() over(order by total_points desc,real_team_id) rank_no
      from totals
    )
    select rank_no into v_rank from ranked where real_team_id=v_real_team_id;
    return coalesce(v_rank<=12,false);
  end if;

  return false;
end
$function$;

create or replace function public.evaluate_roster_integrity_drop(
  p_roster_entry_id uuid,
  p_context text default 'direct'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_entry roster_entries%rowtype;
  v_sf season_franchises%rowtype;
  v_ls league_seasons%rowtype;
  v_recent_drops integer:=0;
  v_override uuid;
  v_protected boolean:=false;
  v_message text;
begin
  select * into v_entry from roster_entries where id=p_roster_entry_id;
  if v_entry.id is null or v_entry.dropped_at is not null then
    return jsonb_build_object('allowed',false,'reason_code','missing_asset','message','Roster asset is no longer active.');
  end if;

  select * into v_sf from season_franchises where id=v_entry.season_franchise_id;
  select * into v_ls from league_seasons where id=v_sf.league_season_id;
  if v_ls.id is null then
    return jsonb_build_object('allowed',false,'reason_code','missing_season','message','League season not found.');
  end if;

  if v_ls.trade_deadline_at is null or now()<v_ls.trade_deadline_at or v_ls.roster_integrity_mode='open' then
    return jsonb_build_object('allowed',true,'reason_code','not_active','mode',v_ls.roster_integrity_mode);
  end if;

  select id into v_override
  from roster_integrity_overrides
  where roster_entry_id=p_roster_entry_id
    and consumed_at is null and expires_at>now()
  order by approved_at desc limit 1;
  if v_override is not null then
    return jsonb_build_object('allowed',true,'reason_code','commissioner_override','override_id',v_override,'mode',v_ls.roster_integrity_mode);
  end if;

  if v_ls.roster_integrity_lock_eliminated and v_sf.roster_locked_at is not null then
    v_message:='This franchise roster is locked for the remainder of the season.';
    return jsonb_build_object('allowed',false,'reason_code','franchise_locked','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode);
  end if;

  if v_ls.roster_integrity_protect_core_assets then
    v_protected:=roster_integrity_asset_is_protected(p_roster_entry_id);
    if v_protected then
      v_message:='This core roster asset is protected after the trade deadline. Commissioner approval is required to release it.';
      return jsonb_build_object('allowed',false,'reason_code','protected_asset','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode);
    end if;
  end if;

  select count(*) into v_recent_drops
  from roster_entries
  where season_franchise_id=v_entry.season_franchise_id
    and dropped_at is not null
    and dropped_at>=now()-make_interval(hours=>v_ls.roster_integrity_bulk_window_hours);

  if v_recent_drops>=v_ls.roster_integrity_bulk_drop_limit then
    v_message:=format('Roster Integrity blocked this move because the franchise already made %s drops in the last %s hours. Commissioner approval is required.',v_recent_drops,v_ls.roster_integrity_bulk_window_hours);
    return jsonb_build_object('allowed',false,'reason_code','bulk_drop_limit','message',v_message,'requires_review',true,'recent_drops',v_recent_drops,'mode',v_ls.roster_integrity_mode);
  end if;

  -- Standalone releases are never necessary for a normal add/drop transaction.
  -- After the trade deadline they are blocked unless the league is in Open mode
  -- or a commissioner grants a one-time override.
  if coalesce(p_context,'direct')='direct' then
    v_message:='Standalone player releases are protected after the trade deadline. Use Free Agency/Waivers for a replacement move or request commissioner approval.';
    return jsonb_build_object('allowed',false,'reason_code','standalone_drop','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode);
  end if;

  return jsonb_build_object('allowed',true,'reason_code','normal_replacement','mode',v_ls.roster_integrity_mode,'recent_drops',v_recent_drops);
end
$function$;

create or replace function public.consume_roster_integrity_override(p_roster_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  select id into v_id from roster_integrity_overrides
  where roster_entry_id=p_roster_entry_id and consumed_at is null and expires_at>now()
  order by approved_at desc limit 1 for update;
  if v_id is not null then
    update roster_integrity_overrides set consumed_at=now() where id=v_id;
  end if;
  return v_id;
end
$function$;

-- Trigger closes the direct-update escape hatch. Internal replacement functions
-- set a transaction-local prechecked context only after evaluating the same rules.
create or replace function public.enforce_roster_integrity_drop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_context text:=nullif(current_setting('big_exec.roster_drop_context',true),'');
  v_decision jsonb;
  v_override uuid;
begin
  if old.dropped_at is not null or new.dropped_at is null then return new; end if;

  if v_context in ('free_agent_swap_prechecked','waiver_award_prechecked','commissioner_override_prechecked') then
    return new;
  end if;

  v_decision:=evaluate_roster_integrity_drop(old.id,coalesce(v_context,'direct'));
  if not coalesce((v_decision->>'allowed')::boolean,false) then
    raise exception '%',coalesce(v_decision->>'message','Roster Integrity blocked this drop.');
  end if;

  if v_decision->>'override_id' is not null then
    v_override:=consume_roster_integrity_override(old.id);
  end if;
  return new;
end
$function$;

drop trigger if exists roster_entries_roster_integrity on public.roster_entries;
create trigger roster_entries_roster_integrity
before update of dropped_at on public.roster_entries
for each row execute function public.enforce_roster_integrity_drop();

create or replace function public.request_roster_integrity_review(
  p_roster_entry_id uuid,
  p_manager_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_sf uuid;
  v_ls uuid;
  v_decision jsonb;
  v_review uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select re.season_franchise_id,sf.league_season_id into v_sf,v_ls
  from roster_entries re
  join season_franchises sf on sf.id=re.season_franchise_id
  join franchise_owners fo on fo.franchise_id=sf.franchise_id
  where re.id=p_roster_entry_id and re.dropped_at is null
    and fo.user_id=v_user and fo.ends_on is null;
  if v_sf is null then raise exception 'You do not manage this roster asset'; end if;

  v_decision:=evaluate_roster_integrity_drop(p_roster_entry_id,'direct');
  if coalesce((v_decision->>'allowed')::boolean,false) then
    raise exception 'This roster asset does not currently require commissioner review';
  end if;

  insert into roster_integrity_reviews(
    league_season_id,season_franchise_id,roster_entry_id,requested_by,
    reason_code,reason_detail,manager_note,status
  ) values(
    v_ls,v_sf,p_roster_entry_id,v_user,
    coalesce(v_decision->>'reason_code','roster_integrity'),
    coalesce(v_decision->>'message','Commissioner review requested.'),
    nullif(trim(coalesce(p_manager_note,'')),''),'pending'
  )
  on conflict (roster_entry_id) where status='pending'
  do update set manager_note=excluded.manager_note,requested_at=now(),reason_code=excluded.reason_code,reason_detail=excluded.reason_detail
  returning id into v_review;

  insert into roster_integrity_audit(league_season_id,season_franchise_id,roster_entry_id,actor_id,event_type,detail)
  values(v_ls,v_sf,p_roster_entry_id,v_user,'review_requested',jsonb_build_object('review_id',v_review,'reason_code',v_decision->>'reason_code'));

  return v_review;
end
$function$;

create or replace function public.resolve_roster_integrity_review(
  p_review_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_review roster_integrity_reviews%rowtype;
  v_league uuid;
  v_override uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_review from roster_integrity_reviews where id=p_review_id for update;
  if v_review.id is null then raise exception 'Review request not found'; end if;
  if v_review.status<>'pending' then raise exception 'This review has already been resolved'; end if;
  select league_id into v_league from league_seasons where id=v_review.league_season_id;
  if not exists(select 1 from league_members where league_id=v_league and user_id=v_user and role='commissioner') then
    raise exception 'Commissioner permission required';
  end if;

  update roster_integrity_reviews
  set status=case when p_approve then 'approved' else 'rejected' end,
      resolved_by=v_user,resolved_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'')
  where id=v_review.id;

  if p_approve then
    insert into roster_integrity_overrides(
      league_season_id,season_franchise_id,roster_entry_id,review_id,approved_by,note
    ) values(
      v_review.league_season_id,v_review.season_franchise_id,v_review.roster_entry_id,v_review.id,v_user,nullif(trim(coalesce(p_note,'')),'')
    ) returning id into v_override;
  end if;

  insert into roster_integrity_audit(league_season_id,season_franchise_id,roster_entry_id,actor_id,event_type,detail)
  values(v_review.league_season_id,v_review.season_franchise_id,v_review.roster_entry_id,v_user,
    case when p_approve then 'review_approved' else 'review_rejected' end,
    jsonb_build_object('review_id',v_review.id,'override_id',v_override,'note',nullif(trim(coalesce(p_note,'')),'')));

  return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'override_id',v_override);
end
$function$;

create or replace function public.update_roster_integrity_settings(
  p_league_season_id uuid,
  p_mode text,
  p_bulk_drop_limit integer,
  p_bulk_window_hours integer,
  p_protect_core_assets boolean,
  p_lock_eliminated boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_league uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('automatic','commissioner_review','open') then raise exception 'Invalid Roster Integrity mode'; end if;
  if p_bulk_drop_limit not between 1 and 10 then raise exception 'Bulk drop limit must be between 1 and 10'; end if;
  if p_bulk_window_hours not between 1 and 168 then raise exception 'Bulk window must be between 1 and 168 hours'; end if;
  select league_id into v_league from league_seasons where id=p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;
  if not exists(select 1 from league_members where league_id=v_league and user_id=v_user and role='commissioner') then
    raise exception 'Commissioner permission required';
  end if;

  update league_seasons
  set roster_integrity_mode=p_mode,
      roster_integrity_bulk_drop_limit=p_bulk_drop_limit,
      roster_integrity_bulk_window_hours=p_bulk_window_hours,
      roster_integrity_protect_core_assets=p_protect_core_assets,
      roster_integrity_lock_eliminated=p_lock_eliminated
  where id=p_league_season_id;

  insert into roster_integrity_audit(league_season_id,actor_id,event_type,detail)
  values(p_league_season_id,v_user,'settings_changed',jsonb_build_object(
    'mode',p_mode,'bulk_drop_limit',p_bulk_drop_limit,'bulk_window_hours',p_bulk_window_hours,
    'protect_core_assets',p_protect_core_assets,'lock_eliminated',p_lock_eliminated
  ));
  return jsonb_build_object('status','ok','mode',p_mode);
end
$function$;

create or replace function public.set_franchise_roster_lock(
  p_season_franchise_id uuid,
  p_locked boolean,
  p_reason text default 'Eliminated from Championship and Redemption competition'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_ls uuid;
  v_league uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select sf.league_season_id,ls.league_id into v_ls,v_league
  from season_franchises sf join league_seasons ls on ls.id=sf.league_season_id
  where sf.id=p_season_franchise_id;
  if v_ls is null then raise exception 'Franchise season not found'; end if;
  if not exists(select 1 from league_members where league_id=v_league and user_id=v_user and role='commissioner') then
    raise exception 'Commissioner permission required';
  end if;

  update season_franchises
  set roster_locked_at=case when p_locked then now() else null end,
      roster_lock_reason=case when p_locked then coalesce(nullif(trim(p_reason),''),'Season competition complete') else null end
  where id=p_season_franchise_id;

  insert into roster_integrity_audit(league_season_id,season_franchise_id,actor_id,event_type,detail)
  values(v_ls,p_season_franchise_id,v_user,case when p_locked then 'franchise_locked' else 'franchise_unlocked' end,
    jsonb_build_object('reason',case when p_locked then p_reason else null end));
  return jsonb_build_object('status','ok','locked',p_locked);
end
$function$;

-- Recreate free-agent acquisition with Roster Integrity precheck for the drop
-- side of an add/drop transaction.
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
  v_user_id uuid:=auth.uid(); v_league_season_id uuid; v_roster_config jsonb; v_roster_limit integer; v_active_count integer; v_new_id uuid;
  v_hold waiver_holds%rowtype; v_drop_athlete uuid; v_drop_team uuid; v_period integer;
  v_integrity jsonb; v_override uuid;
begin
  if v_user_id is null then raise exception 'You must be signed in.'; end if;
  if ((p_athlete_id is not null)::int + (p_real_team_id is not null)::int)<>1 then raise exception 'Choose exactly one player or defense.'; end if;
  select sf.league_season_id,ls.roster_config,ls.waiver_period_hours into v_league_season_id,v_roster_config,v_period
  from season_franchises sf join franchises f on f.id=sf.franchise_id join franchise_owners fo on fo.franchise_id=f.id join league_seasons ls on ls.id=sf.league_season_id
  where sf.id=p_season_franchise_id and fo.user_id=v_user_id and fo.ends_on is null for update of sf;
  if v_league_season_id is null then raise exception 'You do not manage this franchise.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_league_season_id::text,0));
  select * into v_hold from waiver_holds where league_season_id=v_league_season_id and status='open' and ((p_athlete_id is not null and athlete_id=p_athlete_id) or (p_real_team_id is not null and real_team_id=p_real_team_id)) limit 1 for update;
  if v_hold.id is not null then
    if v_hold.clears_at>now() or exists(select 1 from waiver_claims where waiver_hold_id=v_hold.id and status='pending') then raise exception 'That asset is on waivers and must be claimed through the waiver process.'; end if;
    update waiver_holds set status='expired',resolved_at=now() where id=v_hold.id;
  end if;
  if exists (select 1 from roster_entries re join season_franchises sf on sf.id=re.season_franchise_id where sf.league_season_id=v_league_season_id and re.dropped_at is null and ((p_athlete_id is not null and re.athlete_id=p_athlete_id) or (p_real_team_id is not null and re.real_team_id=p_real_team_id))) then raise exception 'That asset is no longer available.'; end if;
  select count(*) into v_active_count from roster_entries where season_franchise_id=p_season_franchise_id and dropped_at is null;
  select coalesce(sum(value::int),0)+coalesce((v_roster_config->>'bench')::int,0) into v_roster_limit from jsonb_each_text(coalesce(v_roster_config->'starters','{}'::jsonb));
  if p_drop_roster_entry_id is null and v_active_count>=v_roster_limit then raise exception 'Your roster is full. Choose a player to drop.'; end if;
  if p_drop_roster_entry_id is not null then
    select athlete_id,real_team_id into v_drop_athlete,v_drop_team from roster_entries where id=p_drop_roster_entry_id and season_franchise_id=p_season_franchise_id and dropped_at is null for update;
    if not found then raise exception 'The player selected to drop is no longer on your roster.'; end if;
    if exists (select 1 from lineups l where l.season_franchise_id=p_season_franchise_id and l.locked_at is not null and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete) or (v_drop_team is not null and l.real_team_id=v_drop_team))) then raise exception 'That player is locked in a lineup and cannot be dropped.'; end if;

    v_integrity:=evaluate_roster_integrity_drop(p_drop_roster_entry_id,'free_agent_swap');
    if not coalesce((v_integrity->>'allowed')::boolean,false) then
      raise exception '%',coalesce(v_integrity->>'message','Roster Integrity blocked this drop.');
    end if;
    if v_integrity->>'override_id' is not null then v_override:=consume_roster_integrity_override(p_drop_roster_entry_id); end if;

    delete from lineups l where l.season_franchise_id=p_season_franchise_id and l.locked_at is null and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete) or (v_drop_team is not null and l.real_team_id=v_drop_team));
    perform set_config('big_exec.roster_drop_context','free_agent_swap_prechecked',true);
    update roster_entries set dropped_at=now() where id=p_drop_roster_entry_id and dropped_at is null;
    perform set_config('big_exec.roster_drop_context','',true);
    insert into waiver_holds(league_season_id,athlete_id,real_team_id,source_roster_entry_id,source_season_franchise_id,clears_at) values(v_league_season_id,v_drop_athlete,v_drop_team,p_drop_roster_entry_id,p_season_franchise_id,now()+make_interval(hours=>v_period));
  end if;
  insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via) values(p_season_franchise_id,p_athlete_id,p_real_team_id,'free_agent') returning id into v_new_id;
  return v_new_id;
end
$function$;

-- Waiver processing treats a protected/bulk/locked selected drop as a failed
-- claim and continues to the next eligible claim instead of aborting the whole job.
create or replace function public.process_due_waivers(p_league_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hold waiver_holds%rowtype; v_claim record; v_roster_config jsonb; v_roster_limit integer; v_active_count integer;
  v_drop_athlete uuid; v_drop_team uuid; v_period integer; v_league uuid; v_winner uuid; v_processed integer:=0; v_claimed integer:=0;
  v_integrity jsonb; v_override uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('waivers:'||p_league_season_id::text,0));
  select roster_config,waiver_period_hours,league_id into v_roster_config,v_period,v_league from league_seasons where id=p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;
  select coalesce(sum(value::int),0)+coalesce((v_roster_config->>'bench')::int,0) into v_roster_limit from jsonb_each_text(coalesce(v_roster_config->'starters','{}'::jsonb));
  for v_hold in select * from waiver_holds where league_season_id=p_league_season_id and status='open' and clears_at<=now() order by clears_at,id for update skip locked loop
    v_processed:=v_processed+1; v_winner:=null;
    if exists (select 1 from roster_entries re join season_franchises sf on sf.id=re.season_franchise_id where sf.league_season_id=p_league_season_id and re.dropped_at is null and ((v_hold.athlete_id is not null and re.athlete_id=v_hold.athlete_id) or (v_hold.real_team_id is not null and re.real_team_id=v_hold.real_team_id))) then
      update waiver_claims set status='failed',resolved_at=now(),failure_reason='Asset is no longer available' where waiver_hold_id=v_hold.id and status='pending'; update waiver_holds set status='expired',resolved_at=now() where id=v_hold.id; continue;
    end if;
    for v_claim in
      with ranked as (
        select wc.*, row_number() over (order by
          case when (s.wins+s.losses+s.ties)=0 then 0 else 1 end asc,
          case when (s.wins+s.losses+s.ties)=0 then sf.draft_position end desc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then (s.wins + 0.5*s.ties)::numeric/(s.wins+s.losses+s.ties) end asc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then s.points_for end asc nulls last,
          wc.created_at asc,wc.id asc) as calculated_priority
        from waiver_claims wc join season_franchises sf on sf.id=wc.season_franchise_id join standings s on s.league_season_id=p_league_season_id and s.season_franchise_id=wc.season_franchise_id
        where wc.waiver_hold_id=v_hold.id and wc.status='pending') select * from ranked order by calculated_priority
    loop
      update waiver_claims set priority_rank=v_claim.calculated_priority where id=v_claim.id;
      select count(*) into v_active_count from roster_entries where season_franchise_id=v_claim.season_franchise_id and dropped_at is null;
      if v_active_count>=v_roster_limit and v_claim.drop_roster_entry_id is null then update waiver_claims set status='failed',resolved_at=now(),failure_reason='Roster is full and no drop was selected' where id=v_claim.id; continue; end if;
      v_drop_athlete:=null; v_drop_team:=null;
      if v_claim.drop_roster_entry_id is not null then
        select athlete_id,real_team_id into v_drop_athlete,v_drop_team from roster_entries where id=v_claim.drop_roster_entry_id and season_franchise_id=v_claim.season_franchise_id and dropped_at is null for update;
        if not found then update waiver_claims set status='failed',resolved_at=now(),failure_reason='Selected drop is no longer on roster' where id=v_claim.id; continue; end if;
        if exists (select 1 from lineups l where l.season_franchise_id=v_claim.season_franchise_id and l.locked_at is not null and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete) or (v_drop_team is not null and l.real_team_id=v_drop_team))) then update waiver_claims set status='failed',resolved_at=now(),failure_reason='Selected drop is locked in a lineup' where id=v_claim.id; continue; end if;

        v_integrity:=evaluate_roster_integrity_drop(v_claim.drop_roster_entry_id,'waiver_award');
        if not coalesce((v_integrity->>'allowed')::boolean,false) then
          update waiver_claims set status='failed',resolved_at=now(),failure_reason=coalesce(v_integrity->>'message','Roster Integrity blocked the selected drop') where id=v_claim.id;
          continue;
        end if;
        if v_integrity->>'override_id' is not null then v_override:=consume_roster_integrity_override(v_claim.drop_roster_entry_id); end if;

        delete from lineups l where l.season_franchise_id=v_claim.season_franchise_id and l.locked_at is null and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete) or (v_drop_team is not null and l.real_team_id=v_drop_team));
        perform set_config('big_exec.roster_drop_context','waiver_award_prechecked',true);
        update roster_entries set dropped_at=now() where id=v_claim.drop_roster_entry_id and dropped_at is null;
        perform set_config('big_exec.roster_drop_context','',true);
        insert into waiver_holds(league_season_id,athlete_id,real_team_id,source_roster_entry_id,source_season_franchise_id,clears_at) values(p_league_season_id,v_drop_athlete,v_drop_team,v_claim.drop_roster_entry_id,v_claim.season_franchise_id,now()+make_interval(hours=>v_period));
      end if;
      insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via) values(v_claim.season_franchise_id,v_hold.athlete_id,v_hold.real_team_id,'waiver');
      v_winner:=v_claim.season_franchise_id;
      update waiver_claims set status='won',resolved_at=now(),failure_reason=null where id=v_claim.id;
      update waiver_claims set status='lost',resolved_at=now() where waiver_hold_id=v_hold.id and status='pending' and id<>v_claim.id;
      update waiver_holds set status='claimed',claimed_by_season_franchise_id=v_winner,resolved_at=now() where id=v_hold.id;
      insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,p_league_season_id,'waiver_claimed','Waiver claim awarded',jsonb_build_object('waiver_hold_id',v_hold.id,'winner_season_franchise_id',v_winner,'athlete_id',v_hold.athlete_id,'real_team_id',v_hold.real_team_id));
      v_claimed:=v_claimed+1; exit;
    end loop;
    if v_winner is null then update waiver_holds set status='expired',resolved_at=now() where id=v_hold.id and status='open'; end if;
  end loop;
  return jsonb_build_object('status','ok','processed',v_processed,'claimed',v_claimed);
end
$function$;

revoke execute on function public.roster_integrity_asset_is_protected(uuid) from public,anon,authenticated;
revoke execute on function public.evaluate_roster_integrity_drop(uuid,text) from public,anon,authenticated;
revoke execute on function public.consume_roster_integrity_override(uuid) from public,anon,authenticated;
revoke execute on function public.enforce_roster_integrity_drop() from public,anon,authenticated;

grant execute on function public.request_roster_integrity_review(uuid,text) to authenticated;
grant execute on function public.resolve_roster_integrity_review(uuid,boolean,text) to authenticated;
grant execute on function public.update_roster_integrity_settings(uuid,text,integer,integer,boolean,boolean) to authenticated;
grant execute on function public.set_franchise_roster_lock(uuid,boolean,text) to authenticated;
