-- Current provider rankings, ADP, and projections are operational inputs.
-- Historical fantasy scores remain separate and are only a fallback.
create table if not exists public.fantasy_player_market_values (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_year integer not null check (season_year between 1900 and 2200),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  source text not null,
  scoring_format text not null,
  overall_rank integer check (overall_rank is null or overall_rank > 0),
  position_rank integer check (position_rank is null or position_rank > 0),
  adp numeric check (adp is null or adp > 0),
  projected_points numeric,
  percent_rostered numeric check (percent_rostered is null or percent_rostered between 0 and 100),
  percent_started numeric check (percent_started is null or percent_started between 0 and 100),
  raw_ranking jsonb not null default '{}'::jsonb,
  raw_adp jsonb not null default '{}'::jsonb,
  raw_projection jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (competition_id, season_year, athlete_id, source, scoring_format)
);

create index if not exists fantasy_player_market_values_draft_idx
  on public.fantasy_player_market_values(competition_id, season_year, scoring_format, overall_rank, adp);
create index if not exists fantasy_player_market_values_waiver_idx
  on public.fantasy_player_market_values(competition_id, season_year, projected_points desc nulls last, overall_rank);

alter table public.fantasy_player_market_values enable row level security;
revoke all on public.fantasy_player_market_values from public, anon;
grant select on public.fantasy_player_market_values to authenticated;
grant all on public.fantasy_player_market_values to service_role;

drop policy if exists fantasy_player_market_values_authenticated_read on public.fantasy_player_market_values;
create policy fantasy_player_market_values_authenticated_read
on public.fantasy_player_market_values for select
to authenticated
using ((select auth.uid()) is not null);

comment on table public.fantasy_player_market_values is
  'Latest provider-authored NFL fantasy rankings, ADP, and projections. Public sports data readable by signed-in managers; service role writes imports.';
