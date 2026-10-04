# Supabase

Connected project: `njjiqdqhmcbxblwhfade` (Fantasy All-Sports).

The remote database is already initialized. New schema changes should be made as named migrations and mirrored into this directory for version control.

Current remote foundation includes sports/competitions/seasons, real teams/athletes/games/stats, fantasy leagues and persistent franchises, roster/lineup/scoring/matchups/standings, team D/ST assets, drafts, transactions/trades, progression, event definitions, historical test imports, and RLS policies.

## Schema baseline

`supabase/migrations/` does not contain the base schema: production's migration history starts on 2026-08-20 and 56 of its 80 entries have no file here.

- `supabase/schema/` is the authoritative, human-readable snapshot of the current production `public` schema (tables, indexes, functions, triggers, RLS policies, grants, cron jobs, extensions), plus the migration history reconciliation and security findings in `supabase/schema/README.md`. Reference only; never apply it.
- `supabase/migrations_recovered/` holds the SQL of the 56 production migrations that were missing from the repo, recovered from `supabase_migrations.schema_migrations`. Already live; never re-apply.
- `scripts/db-schema-snapshot.mjs` regenerates the snapshot (read-only catalog queries; connection string from `SUPABASE_DB_URL`).
