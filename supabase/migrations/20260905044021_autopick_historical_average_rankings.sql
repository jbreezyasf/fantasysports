-- Replace fallback-board autopick ranking with historical production ranking.
-- The draft selector now ranks by average season fantasy points over the most
-- recent five scored seasons available for the competition. If no historical
-- ranking data exists for an asset, autopick does not invent a score for it.

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
  with latest_scored_seasons as (
    select season_year
    from (
      select distinct cs.season_year
      from public.fantasy_player_scores fps
      join public.league_seasons ls on ls.id = fps.league_season_id
      join public.competition_seasons cs on cs.id = ls.competition_season_id
      where cs.competition_id = p_competition_id
      union
      select distinct cs.season_year
      from public.fantasy_team_scores fts
      join public.league_seasons ls on ls.id = fts.league_season_id
      join public.competition_seasons cs on cs.id = ls.competition_season_id
      where cs.competition_id = p_competition_id
    ) seasons
    order by season_year desc
    limit 5
  ),
  athlete_season_totals as (
    select
      fps.athlete_id,
      cs.season_year,
      sum(fps.points) / greatest(count(distinct fps.league_season_id), 1) as season_points
    from public.fantasy_player_scores fps
    join public.league_seasons ls on ls.id = fps.league_season_id
    join public.competition_seasons cs on cs.id = ls.competition_season_id
    join latest_scored_seasons recent on recent.season_year = cs.season_year
    where cs.competition_id = p_competition_id
    group by fps.athlete_id, cs.season_year
  ),
  athlete_scores as (
    select athlete_id, avg(season_points) as historical_average
    from athlete_season_totals
    group by athlete_id
  ),
  team_season_totals as (
    select
      fts.real_team_id,
      cs.season_year,
      sum(fts.points) / greatest(count(distinct fts.league_season_id), 1) as season_points
    from public.fantasy_team_scores fts
    join public.league_seasons ls on ls.id = fts.league_season_id
    join public.competition_seasons cs on cs.id = ls.competition_season_id
    join latest_scored_seasons recent on recent.season_year = cs.season_year
    where cs.competition_id = p_competition_id
    group by fts.real_team_id, cs.season_year
  ),
  team_scores as (
    select real_team_id, avg(season_points) as historical_average
    from team_season_totals
    group by real_team_id
  ),
  ranked as (
    select
      a.id as athlete_id,
      null::uuid as real_team_id,
      s.historical_average as score,
      case a.position when 'RB' then 1 when 'WR' then 2 when 'QB' then 3 when 'TE' then 4 when 'K' then 6 else 99 end as position_order,
      a.id as tiebreak
    from public.athletes a
    join athlete_scores s on s.athlete_id = a.id
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
      s.historical_average as score,
      5 as position_order,
      rt.id as tiebreak
    from public.real_teams rt
    join team_scores s on s.real_team_id = rt.id
    where rt.competition_id = p_competition_id
      and (p_positions is null or 'DST' = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.real_team_id = rt.id and dp.picked_at is not null
      )
  )
  select ranked.athlete_id, ranked.real_team_id
  from ranked
  order by ranked.score desc, ranked.position_order, ranked.tiebreak
  limit 1
$$;

revoke execute on function public.draft_autopick_candidate(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.draft_autopick_candidate(uuid, uuid, text[]) to service_role;
