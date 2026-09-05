-- Fixes observed mock-draft behavior:
-- - Any authenticated league member may trigger processing for an already
--   expired pick. The database still verifies the server deadline and chooses
--   the autopick.
-- - Autopick no longer falls back to alphabetical/name ordering when mock data
--   has no usable fantasy scores. It uses Big Exec score data first, then an
--   explicit internal draft-value board.

create or replace function public.draft_autopick_candidate(
  p_draft_id uuid,
  p_competition_id uuid,
  p_positions text[] default null
)
returns table(athlete_id uuid, real_team_id uuid)
language sql
security definer
set search_path to 'public'
as $$
  select ranked.athlete_id, ranked.real_team_id
  from (
    select
      a.id as athlete_id,
      null::uuid as real_team_id,
      coalesce(
        nullif(sum(fps.points), 0),
        case a.position
          when 'RB' then 100
          when 'WR' then 98
          when 'QB' then 86
          when 'TE' then 76
          when 'K' then 8
          else 0
        end
      ) as score,
      case a.position when 'RB' then 1 when 'WR' then 2 when 'QB' then 3 when 'TE' then 4 when 'K' then 6 else 99 end as position_order,
      a.id as tiebreak
    from public.athletes a
    left join public.fantasy_player_scores fps on fps.athlete_id = a.id
    where a.competition_id = p_competition_id
      and a.active = true
      and a.position in ('QB', 'RB', 'WR', 'TE', 'K')
      and (p_positions is null or a.position = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.athlete_id = a.id and dp.picked_at is not null
      )
    group by a.id, a.position
    union all
    select
      null::uuid as athlete_id,
      rt.id as real_team_id,
      coalesce(nullif(sum(fts.points), 0), 28) as score,
      5 as position_order,
      rt.id as tiebreak
    from public.real_teams rt
    left join public.fantasy_team_scores fts on fts.real_team_id = rt.id
    where rt.competition_id = p_competition_id
      and (p_positions is null or 'DST' = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.real_team_id = rt.id and dp.picked_at is not null
      )
    group by rt.id
  ) ranked
  order by ranked.score desc, ranked.position_order, ranked.tiebreak
  limit 1
$$;

create or replace function public.process_expired_draft_picks(p_draft_id uuid default null, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_processed integer := 0;
  v_draft record;
  v_pick public.draft_picks%rowtype;
  v_athlete_id uuid;
  v_real_team_id uuid;
  v_result jsonb;
  v_needed_positions text[];
  v_unmet_deficit integer;
  v_remaining_picks integer;
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
    ) then raise exception 'League member access required'; end if;
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
      select
        coalesce(array_agg(distinct replace(n.need_position, '_FLEX', '')), '{}'::text[]),
        coalesce(sum(case when n.need_position like '%\_FLEX' then 0 else n.deficit end), 0)
          + coalesce(max(case when n.need_position like '%\_FLEX' then n.deficit else 0 end), 0)
      into v_needed_positions, v_unmet_deficit
      from public.draft_roster_needs(v_pick.season_franchise_id) n;

      select count(*) into v_remaining_picks
      from public.draft_picks dp
      where dp.draft_id = v_draft.id
        and dp.season_franchise_id = v_pick.season_franchise_id
        and dp.picked_at is null;

      if v_unmet_deficit > 0 and v_unmet_deficit >= v_remaining_picks then
        select c.athlete_id, c.real_team_id
        into v_athlete_id, v_real_team_id
        from public.draft_autopick_candidate(v_draft.id, v_draft.competition_id, v_needed_positions) c;
      end if;

      if v_athlete_id is null and v_real_team_id is null then
        select c.athlete_id, c.real_team_id
        into v_athlete_id, v_real_team_id
        from public.draft_autopick_candidate(v_draft.id, v_draft.competition_id, null) c;
      end if;
    end if;

    if v_athlete_id is null and v_real_team_id is null then
      raise exception 'No legal draft asset available for autopick';
    end if;

    v_result := public.make_draft_pick(v_draft.id, v_athlete_id, v_real_team_id, true);
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('processed', v_processed);
end
$$;

revoke execute on function public.draft_autopick_candidate(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.draft_autopick_candidate(uuid, uuid, text[]) to service_role;
grant execute on function public.process_expired_draft_picks(uuid, integer) to authenticated, service_role;
