-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260823215847, name unique_provider_game_ids. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create unique index if not exists real_games_provider_game_id_unique_idx on public.real_games(provider_game_id) where provider_game_id is not null;
