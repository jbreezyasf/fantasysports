-- Autopick must respect roster requirements while still taking the best
-- available asset.
--
-- Defect (qa-artifacts/2026-09-04_draft-autopick-completion): a draft completed
-- 91% by unattended autopick left 7 of 10 franchises unable to field a legal
-- lineup. process_expired_draft_picks chose the best undrafted asset without ever
-- reading the picking franchise's roster, so it had no notion of positional need.
--
-- Fix: two helpers plus a replaced autopick.
--   draft_roster_needs        -> which positions a franchise still has to fill
--   draft_autopick_candidate  -> best available asset, optionally restricted
--   process_expired_draft_picks
--       queue-first behavior is unchanged;
--       the fallback takes the best available asset overall until the franchise's
--       remaining picks equal its unmet deficit, at which point it is restricted
--       to the positions it still needs. Legality is guaranteed and value is not
--       thrown away early (no round-3 kicker).
--
-- Requirements are read from league_seasons.roster_config in either production
-- shape ({"starters":{...}}) or the QA fixture shape ({"slots":{...}}), and
-- default to QB1 RB2 WR2 TE1 K1 DST1 FLEX1 when absent. FLEX counts as one extra
-- RB/WR/TE so the result is a fully fillable starting lineup, not just minimums.

-- ---------------------------------------------------------------------------
-- 1. What does this franchise still need?
-- ---------------------------------------------------------------------------
create or replace function public.draft_roster_needs(p_season_franchise_id uuid)
returns table(need_position text, deficit integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cfg jsonb;
  v_req jsonb;
  v_have jsonb;
  v_rb_have integer; v_wr_have integer; v_te_have integer;
  v_rb_req integer;  v_wr_req integer;  v_te_req integer;  v_flex_req integer;
  v_flex_deficit integer;
  v_pos text;
  v_req_n integer;
  v_have_n integer;
begin
  select ls.roster_config into v_cfg
  from public.season_franchises sf
  join public.league_seasons ls on ls.id = sf.league_season_id
  where sf.id = p_season_franchise_id;

  -- Accept either shape; unknown or missing keys fall back to defaults.
  v_req := coalesce(v_cfg -> 'starters', v_cfg -> 'slots', '{}'::jsonb);

  -- Current active roster, DST represented by real_team_id.
  select coalesce(jsonb_object_agg(pos, n), '{}'::jsonb) into v_have
  from (
    select case when re.real_team_id is not null then 'DST' else coalesce(a.position, 'UNKNOWN') end as pos, count(*)::int as n
    from public.roster_entries re
    left join public.athletes a on a.id = re.athlete_id
    where re.season_franchise_id = p_season_franchise_id
      and re.dropped_at is null
    group by 1
  ) counts;

  -- Explicit minimums.
  foreach v_pos in array array['QB','RB','WR','TE','K','DST'] loop
    v_req_n := coalesce((v_req ->> v_pos)::int,
                        case v_pos when 'RB' then 2 when 'WR' then 2 else 1 end);
    v_have_n := coalesce((v_have ->> v_pos)::int, 0);
    if v_req_n - v_have_n > 0 then
      need_position := v_pos;
      deficit := v_req_n - v_have_n;
      return next;
    end if;
  end loop;

  -- FLEX: one more RB/WR/TE beyond the explicit minimums. Reported against each
  -- of the three positions with the same deficit so any of them satisfies it.
  v_rb_req := coalesce((v_req ->> 'RB')::int, 2);
  v_wr_req := coalesce((v_req ->> 'WR')::int, 2);
  v_te_req := coalesce((v_req ->> 'TE')::int, 1);
  v_flex_req := coalesce((v_req ->> 'FLEX')::int, 1);
  v_rb_have := coalesce((v_have ->> 'RB')::int, 0);
  v_wr_have := coalesce((v_have ->> 'WR')::int, 0);
  v_te_have := coalesce((v_have ->> 'TE')::int, 0);

  v_flex_deficit := (v_rb_req + v_wr_req + v_te_req + v_flex_req)
                    - (v_rb_have + v_wr_have + v_te_have);
  -- Only the portion not already covered by the explicit RB/WR/TE deficits above.
  v_flex_deficit := v_flex_deficit
                    - greatest(0, v_rb_req - v_rb_have)
                    - greatest(0, v_wr_req - v_wr_have)
                    - greatest(0, v_te_req - v_te_have);
  if v_flex_deficit > 0 then
    foreach v_pos in array array['RB','WR','TE'] loop
      need_position := v_pos || '_FLEX';
      deficit := v_flex_deficit;
      return next;
    end loop;
  end if;

  return;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Best available asset, optionally restricted to a set of positions.
--    Ordering matches the existing UI ranking basis: summed points, then a fixed
--    position priority, then name, then id for determinism.
-- ---------------------------------------------------------------------------
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
      coalesce(sum(fps.points), 0) as score,
      case a.position when 'RB' then 1 when 'WR' then 2 when 'QB' then 3 when 'TE' then 4 when 'K' then 6 else 99 end as position_order,
      a.display_name as name,
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
    group by a.id, a.position, a.display_name
    union all
    select
      null::uuid as athlete_id,
      rt.id as real_team_id,
      coalesce(sum(fts.points), 0) as score,
      5 as position_order,
      coalesce(rt.abbreviation, rt.display_name) as name,
      rt.id as tiebreak
    from public.real_teams rt
    left join public.fantasy_team_scores fts on fts.real_team_id = rt.id
    where rt.competition_id = p_competition_id
      and (p_positions is null or 'DST' = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.real_team_id = rt.id and dp.picked_at is not null
      )
    group by rt.id, rt.abbreviation, rt.display_name
  ) ranked
  order by ranked.score desc, ranked.position_order, ranked.name, ranked.tiebreak
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 3. Autopick. Same signature, so existing grants and the cron job are unchanged.
-- ---------------------------------------------------------------------------
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

    -- 1) The manager's own queue always wins. Unchanged.
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

    -- 2) Best available, restricted to unmet positions only once it must be.
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

      -- Not forced, or the needed positions are exhausted: best available overall.
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

-- Helpers are internal to the autopick path. Authenticated users may read needs
-- (it is roster-composition information about a franchise the caller can already
-- see); nothing may be executed anonymously.
revoke execute on function public.draft_roster_needs(uuid) from public, anon;
revoke execute on function public.draft_autopick_candidate(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.draft_roster_needs(uuid) to authenticated, service_role;
grant execute on function public.draft_autopick_candidate(uuid, uuid, text[]) to service_role;
