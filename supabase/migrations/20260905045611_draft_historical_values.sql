-- Provider-backed draft value history. This stays separate from weekly fantasy
-- matchup scoring because importer rows are season projections/totals, not
-- league matchup events.

create table if not exists public.draft_historical_values (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_year integer not null check (season_year between 1900 and 2200),
  asset_type text not null check (asset_type in ('athlete', 'team_defense')),
  athlete_id uuid references public.athletes(id) on delete cascade,
  real_team_id uuid references public.real_teams(id) on delete cascade,
  asset_key text generated always as (coalesce(athlete_id::text, real_team_id::text)) stored,
  position text not null,
  points numeric not null,
  games_played numeric,
  games_started numeric,
  source text not null,
  source_version text not null default 'unknown',
  raw_stats jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  constraint draft_historical_values_one_asset check (
    (asset_type = 'athlete' and athlete_id is not null and real_team_id is null)
    or (asset_type = 'team_defense' and athlete_id is null and real_team_id is not null)
  )
);

create unique index if not exists draft_historical_values_athlete_year_source
  on public.draft_historical_values(competition_id, season_year, source, athlete_id)
  where asset_type = 'athlete';

create unique index if not exists draft_historical_values_team_year_source
  on public.draft_historical_values(competition_id, season_year, source, real_team_id)
  where asset_type = 'team_defense';

create unique index if not exists draft_historical_values_asset_year_source
  on public.draft_historical_values(competition_id, season_year, source, asset_type, asset_key);

create index if not exists draft_historical_values_competition_position_year
  on public.draft_historical_values(competition_id, position, season_year desc);

alter table public.draft_historical_values enable row level security;

drop policy if exists "Members can read draft historical values" on public.draft_historical_values;
create policy "Members can read draft historical values"
  on public.draft_historical_values
  for select
  to authenticated
  using (true);

revoke all on public.draft_historical_values from public, anon, authenticated;
grant select on public.draft_historical_values to authenticated;
grant all on public.draft_historical_values to service_role;

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
  athlete_historical_scores as (
    select dhv.athlete_id, avg(dhv.points) as score
    from public.draft_historical_values dhv
    join latest_value_seasons recent on recent.season_year = dhv.season_year
    where dhv.competition_id = p_competition_id
      and dhv.asset_type = 'athlete'
      and dhv.athlete_id is not null
    group by dhv.athlete_id
  ),
  team_historical_scores as (
    select dhv.real_team_id, avg(dhv.points) as score
    from public.draft_historical_values dhv
    join latest_value_seasons recent on recent.season_year = dhv.season_year
    where dhv.competition_id = p_competition_id
      and dhv.asset_type = 'team_defense'
      and dhv.real_team_id is not null
    group by dhv.real_team_id
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
    end)::numeric, 2) as score
    from public.draft_historical_values dhv
    join latest_value_seasons recent on recent.season_year = dhv.season_year
    where dhv.competition_id = p_competition_id
    group by position
  ),
  emergency_priors(position, score) as (
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
      coalesce(s.score, pp.score, ep.score, 0) as score,
      case a.position when 'RB' then 1 when 'WR' then 2 when 'QB' then 3 when 'TE' then 4 when 'K' then 6 else 99 end as position_order,
      case when s.score is null then 1 else 0 end as prior_order,
      a.id as tiebreak
    from public.athletes a
    left join athlete_historical_scores s on s.athlete_id = a.id
    left join position_priors pp on pp.position = a.position
    left join emergency_priors ep on ep.position = a.position
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
      coalesce(s.score, pp.score, ep.score, 0) as score,
      5 as position_order,
      case when s.score is null then 1 else 0 end as prior_order,
      rt.id as tiebreak
    from public.real_teams rt
    left join team_historical_scores s on s.real_team_id = rt.id
    left join position_priors pp on pp.position = 'D/ST'
    left join emergency_priors ep on ep.position = 'D/ST'
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
