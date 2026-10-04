-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820043931, name team_fantasy_assets. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table roster_entries alter column athlete_id drop not null;
alter table roster_entries add column real_team_id uuid references real_teams(id);
alter table roster_entries add constraint roster_entry_exactly_one_asset check (((athlete_id is not null)::int + (real_team_id is not null)::int) = 1);
create unique index roster_entries_team_unique on roster_entries(season_franchise_id, real_team_id, added_at) where real_team_id is not null;
alter table lineups alter column athlete_id drop not null;
alter table lineups add column real_team_id uuid references real_teams(id);
alter table lineups add constraint lineup_exactly_one_asset check (((athlete_id is not null)::int + (real_team_id is not null)::int) = 1);
create unique index lineups_team_week_unique on lineups(season_franchise_id, week, real_team_id) where real_team_id is not null;
create table real_team_game_stats (id uuid primary key default gen_random_uuid(),real_team_id uuid not null references real_teams(id),game_id uuid not null references real_games(id),raw_stats jsonb not null default '{}'::jsonb,source_provider text not null,source_updated_at timestamptz,ingested_at timestamptz not null default now(),unique(real_team_id, game_id, source_provider));
create table fantasy_team_scores (id uuid primary key default gen_random_uuid(),league_season_id uuid not null references league_seasons(id) on delete cascade,real_team_id uuid not null references real_teams(id),game_id uuid not null references real_games(id),week int not null,points numeric(8,2) not null,breakdown jsonb not null,calculated_at timestamptz not null default now(),unique(league_season_id, real_team_id, game_id));
