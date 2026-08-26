-- Big Exec Draft Night: server-authoritative pick deadlines and queue-first
-- autopick. Fantasy Core remains the source of truth for official picks.

alter table public.drafts
add column if not exists current_pick_deadline_at timestamptz;

create or replace function public.make_draft_pick(
  p_draft_id uuid,
  p_athlete_id uuid default null::uuid,
  p_real_team_id uuid default null::uuid,
  p_auto boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_draft public.drafts%rowtype;
  v_pick public.draft_picks%rowtype;
  v_franchise uuid;
  v_total int;
  v_league uuid;
  v_competition_id uuid;
  v_next_deadline timestamptz;
begin
  if (p_athlete_id is null) = (p_real_team_id is null) then raise exception 'Choose exactly one athlete or D/ST'; end if;

  select * into v_draft from public.drafts where id = p_draft_id for update;
  if v_draft.id is null or v_draft.status <> 'live' then raise exception 'Draft is not live'; end if;

  select * into v_pick
  from public.draft_picks
  where draft_id = p_draft_id and pick_number = v_draft.current_pick
  for update;
  if v_pick.id is null then raise exception 'Current pick missing'; end if;

  select f.id, f.league_id, cs.competition_id
  into v_franchise, v_league, v_competition_id
  from public.season_franchises sf
  join public.franchises f on f.id = sf.franchise_id
  join public.league_seasons ls on ls.id = v_draft.league_season_id
  join public.competition_seasons cs on cs.id = ls.competition_season_id
  where sf.id = v_pick.season_franchise_id;

  if p_auto and v_user is not null and not exists (
    select 1 from public.league_members lm
    where lm.league_id = v_league and lm.user_id = v_user and lm.role = 'commissioner'
  ) then raise exception 'Only the commissioner or draft system can auto-pick'; end if;

  if not p_auto and not exists (
    select 1 from public.franchise_owners fo
    where fo.franchise_id = v_franchise and fo.user_id = v_user and fo.ends_on is null
  ) then raise exception 'Not your pick'; end if;

  if not p_auto and v_draft.current_pick_deadline_at is not null and now() > v_draft.current_pick_deadline_at then
    raise exception 'Pick clock expired';
  end if;

  if p_athlete_id is not null and not exists (
    select 1 from public.athletes
    where id = p_athlete_id
      and competition_id = v_competition_id
      and active = true
      and position in ('QB', 'RB', 'WR', 'TE', 'K')
  ) then raise exception 'Athlete is not draft eligible'; end if;

  if p_real_team_id is not null and not exists (
    select 1 from public.real_teams
    where id = p_real_team_id
      and competition_id = v_competition_id
  ) then raise exception 'D/ST is not draft eligible'; end if;

  if p_athlete_id is not null and exists (
    select 1 from public.draft_picks
    where draft_id = p_draft_id and athlete_id = p_athlete_id and picked_at is not null
  ) then raise exception 'Athlete already drafted'; end if;

  if p_real_team_id is not null and exists (
    select 1 from public.draft_picks
    where draft_id = p_draft_id and real_team_id = p_real_team_id and picked_at is not null
  ) then raise exception 'D/ST already drafted'; end if;

  update public.draft_picks
  set athlete_id = p_athlete_id,
      real_team_id = p_real_team_id,
      is_auto_pick = p_auto,
      picked_at = now()
  where id = v_pick.id;

  insert into public.roster_entries(season_franchise_id, athlete_id, real_team_id, acquired_via)
  values(v_pick.season_franchise_id, p_athlete_id, p_real_team_id, 'draft');

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  select
    ls.league_id,
    ls.id,
    v_user,
    case when p_auto then 'draft_auto_pick' else 'draft_pick' end,
    case when p_auto then 'Draft clock expired; autopick made' else 'Draft pick made' end,
    jsonb_build_object(
      'draft_id', p_draft_id,
      'pick_number', v_pick.pick_number,
      'athlete_id', p_athlete_id,
      'real_team_id', p_real_team_id,
      'season_franchise_id', v_pick.season_franchise_id
    )
  from public.league_seasons ls
  where ls.id = v_draft.league_season_id;

  select count(*) into v_total from public.draft_picks where draft_id = p_draft_id;
  if v_draft.current_pick >= v_total then
    update public.drafts
    set status = 'completed',
        completed_at = now(),
        current_pick_deadline_at = null
    where id = p_draft_id;
  else
    v_next_deadline := now() + make_interval(secs => greatest(30, least(coalesce(v_draft.pick_seconds, 90), 300)));
    update public.drafts
    set current_pick = current_pick + 1,
        current_pick_deadline_at = v_next_deadline
    where id = p_draft_id;
  end if;

  return jsonb_build_object(
    'pick_number', v_pick.pick_number,
    'season_franchise_id', v_pick.season_franchise_id,
    'auto', p_auto,
    'complete', v_draft.current_pick >= v_total
  );
end
$function$;

create or replace function public.start_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_league uuid;
  v_deadline timestamptz;
begin
  select ls.league_id into v_league
  from public.drafts d
  join public.league_seasons ls on ls.id = d.league_season_id
  where d.id = p_draft_id;

  if not exists (
    select 1 from public.league_members
    where league_id = v_league and user_id = v_user and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  update public.drafts
  set status = 'live',
      started_at = coalesce(started_at, now()),
      current_pick = case when current_pick = 0 then 1 else current_pick end,
      current_pick_deadline_at = now() + make_interval(secs => greatest(30, least(coalesce(pick_seconds, 90), 300)))
  where id = p_draft_id and status in ('scheduled', 'paused')
  returning current_pick_deadline_at into v_deadline;

  return jsonb_build_object('draft_id', p_draft_id, 'status', 'live', 'current_pick_deadline_at', v_deadline);
end
$function$;

create or replace function public.process_expired_draft_picks(
  p_draft_id uuid default null::uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_processed integer := 0;
  v_draft record;
  v_pick public.draft_picks%rowtype;
  v_athlete_id uuid;
  v_real_team_id uuid;
  v_result jsonb;
begin
  if v_user is not null then
    if p_draft_id is null then raise exception 'Draft id required'; end if;
    if not exists (
      select 1
      from public.drafts d
      join public.league_seasons ls on ls.id = d.league_season_id
      join public.league_members lm on lm.league_id = ls.league_id
      where d.id = p_draft_id
        and lm.user_id = v_user
        and lm.role = 'commissioner'
    ) then raise exception 'Commissioner access required'; end if;
  end if;

  for v_draft in
    select d.id, d.league_season_id, d.current_pick, cs.competition_id
    from public.drafts d
    join public.league_seasons ls on ls.id = d.league_season_id
    join public.competition_seasons cs on cs.id = ls.competition_season_id
    where d.status = 'live'
      and d.current_pick_deadline_at is not null
      and d.current_pick_deadline_at <= now()
      and (p_draft_id is null or d.id = p_draft_id)
    order by d.current_pick_deadline_at, d.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    perform pg_advisory_xact_lock(hashtextextended('draft_autopick:' || v_draft.id::text, 0));

    select * into v_pick
    from public.draft_picks
    where draft_id = v_draft.id and pick_number = v_draft.current_pick and picked_at is null
    for update;

    if v_pick.id is null then
      continue;
    end if;

    v_athlete_id := null;
    v_real_team_id := null;

    select q.athlete_id, q.real_team_id
    into v_athlete_id, v_real_team_id
    from public.draft_queues q
    left join public.athletes a on a.id = q.athlete_id
    left join public.real_teams rt on rt.id = q.real_team_id
    where q.draft_id = v_draft.id
      and q.season_franchise_id = v_pick.season_franchise_id
      and ((q.athlete_id is not null
          and a.competition_id = v_draft.competition_id
          and a.active = true
          and a.position in ('QB', 'RB', 'WR', 'TE', 'K')
          and not exists (
            select 1 from public.draft_picks dp
            where dp.draft_id = v_draft.id and dp.athlete_id = q.athlete_id and dp.picked_at is not null
          ))
        or (q.real_team_id is not null
          and rt.competition_id = v_draft.competition_id
          and not exists (
            select 1 from public.draft_picks dp
            where dp.draft_id = v_draft.id and dp.real_team_id = q.real_team_id and dp.picked_at is not null
          )))
    order by q.queue_rank, q.created_at, q.id
    limit 1;

    if v_athlete_id is null and v_real_team_id is null then
      select ranked.athlete_id, ranked.real_team_id
      into v_athlete_id, v_real_team_id
      from (
        select
          a.id as athlete_id,
          null::uuid as real_team_id,
          coalesce(sum(fps.points), 0) as score,
          case a.position when 'RB' then 1 when 'WR' then 2 when 'QB' then 3 when 'TE' then 4 when 'K' then 6 else 99 end as position_order,
          a.display_name as name
        from public.athletes a
        left join public.fantasy_player_scores fps on fps.athlete_id = a.id
        where a.competition_id = v_draft.competition_id
          and a.active = true
          and a.position in ('QB', 'RB', 'WR', 'TE', 'K')
          and not exists (
            select 1 from public.draft_picks dp
            where dp.draft_id = v_draft.id and dp.athlete_id = a.id and dp.picked_at is not null
          )
        group by a.id, a.position, a.display_name
        union all
        select
          null::uuid as athlete_id,
          rt.id as real_team_id,
          coalesce(sum(fts.points), 0) as score,
          5 as position_order,
          coalesce(rt.abbreviation, rt.display_name) as name
        from public.real_teams rt
        left join public.fantasy_team_scores fts on fts.real_team_id = rt.id
        where rt.competition_id = v_draft.competition_id
          and not exists (
            select 1 from public.draft_picks dp
            where dp.draft_id = v_draft.id and dp.real_team_id = rt.id and dp.picked_at is not null
          )
        group by rt.id, rt.abbreviation, rt.display_name
      ) ranked
      order by ranked.score desc, ranked.position_order, ranked.name
      limit 1;
    end if;

    if v_athlete_id is null and v_real_team_id is null then
      raise exception 'No legal draft asset available for autopick';
    end if;

    v_result := public.make_draft_pick(v_draft.id, v_athlete_id, v_real_team_id, true);
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('processed', v_processed);
end
$function$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'big-exec-process-draft-autopicks';

    perform cron.schedule(
      'big-exec-process-draft-autopicks',
      '* * * * *',
      'select public.process_expired_draft_picks();'
    );
  end if;
end $$;

revoke execute on function public.make_draft_pick(uuid, uuid, uuid, boolean) from public, anon;
revoke execute on function public.start_draft(uuid) from public, anon;
revoke execute on function public.process_expired_draft_picks(uuid, integer) from public, anon;

grant execute on function public.make_draft_pick(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.start_draft(uuid) to authenticated;
grant execute on function public.process_expired_draft_picks(uuid, integer) to authenticated, service_role;
