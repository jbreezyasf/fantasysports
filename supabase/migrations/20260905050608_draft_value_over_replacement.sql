-- Rank auto-pick candidates by draft value, not raw fantasy points.
-- The value score is historical/projected points above a position-specific
-- replacement baseline, which keeps QB/K scoring scales from dominating a
-- 1-QB draft room.

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
  with latest_value_seasons as (
    select distinct dhv.season_year
    from public.draft_historical_values dhv
    where dhv.competition_id = p_competition_id
    order by dhv.season_year desc
    limit 5
  ),
  asset_points as (
    select
      dhv.asset_type,
      dhv.athlete_id,
      dhv.real_team_id,
      dhv.position,
      avg(dhv.points) as points
    from public.draft_historical_values dhv
    join latest_value_seasons recent on recent.season_year = dhv.season_year
    where dhv.competition_id = p_competition_id
    group by dhv.asset_type, dhv.athlete_id, dhv.real_team_id, dhv.position
  ),
  ranked_points as (
    select
      asset_points.*,
      row_number() over (partition by position order by points desc) as position_row,
      count(*) over (partition by position) as position_count
    from asset_points
  ),
  replacement_rank(position, rank_number) as (
    values
      ('QB', 12),
      ('RB', 36),
      ('WR', 48),
      ('TE', 12),
      ('D/ST', 12),
      ('K', 12)
  ),
  baselines as (
    select
      rp.position,
      coalesce(
        max(rp.points) filter (where rp.position_row = rr.rank_number),
        case when max(rp.position_count) >= 5 then min(rp.points) else 0 end
      ) as baseline
    from ranked_points rp
    left join replacement_rank rr on rr.position = rp.position
    group by rp.position
  ),
  position_priors as (
    select position, round((percentile_cont(0.5) within group (order by points) * case position
      when 'RB' then 0.62
      when 'WR' then 0.58
      when 'QB' then 0.56
      when 'TE' then 0.54
      when 'K' then 0.72
      when 'D/ST' then 0.72
      else 0.5
    end)::numeric, 2) as points
    from asset_points
    group by position
  ),
  emergency_priors(position, points) as (
    values
      ('RB', 58.90::numeric),
      ('WR', 51.00::numeric),
      ('QB', 47.04::numeric),
      ('TE', 30.24::numeric),
      ('D/ST', 34.56::numeric),
      ('K', 31.68::numeric)
  ),
  ranked as (
    select
      a.id as athlete_id,
      null::uuid as real_team_id,
      coalesce(ap.points, pp.points, ep.points, 0) - coalesce(b.baseline, 0) as score,
      case a.position when 'RB' then 1 when 'WR' then 2 when 'QB' then 3 when 'TE' then 4 when 'K' then 6 else 99 end as position_order,
      case when ap.points is null then 1 else 0 end as prior_order,
      a.id as tiebreak
    from public.athletes a
    left join asset_points ap on ap.athlete_id = a.id and ap.asset_type = 'athlete'
    left join position_priors pp on pp.position = a.position
    left join emergency_priors ep on ep.position = a.position
    left join baselines b on b.position = a.position
    where a.competition_id = p_competition_id
      and a.active = true
      and a.position in ('QB', 'RB', 'WR', 'TE', 'K')
      and (p_positions is null or a.position = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.athlete_id = a.id and dp.picked_at is not null
      )
    union all
    select
      null::uuid as athlete_id,
      rt.id as real_team_id,
      coalesce(ap.points, pp.points, ep.points, 0) - coalesce(b.baseline, 0) as score,
      5 as position_order,
      case when ap.points is null then 1 else 0 end as prior_order,
      rt.id as tiebreak
    from public.real_teams rt
    left join asset_points ap on ap.real_team_id = rt.id and ap.asset_type = 'team_defense'
    left join position_priors pp on pp.position = 'D/ST'
    left join emergency_priors ep on ep.position = 'D/ST'
    left join baselines b on b.position = 'D/ST'
    where rt.competition_id = p_competition_id
      and rt.active = true
      and (p_positions is null or 'DST' = any(p_positions) or 'D/ST' = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.real_team_id = rt.id and dp.picked_at is not null
      )
  )
  select ranked.athlete_id, ranked.real_team_id
  from ranked
  order by ranked.score desc, ranked.prior_order, ranked.position_order, ranked.tiebreak
  limit 1
$$;

revoke execute on function public.draft_autopick_candidate(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.draft_autopick_candidate(uuid, uuid, text[]) to service_role;
