-- extensions.sql — Installed extensions.
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== extensions: 7 object(s) =====
-- Query:
--   select e.extname::text as ord,
--          format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I VERSION %L;', e.extname, n.nspname, e.extversion) as text
--   from pg_extension e
--   join pg_namespace n on n.oid = e.extnamespace

-- pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog VERSION '1.6.4';

-- pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions VERSION '0.20.4';

-- pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions VERSION '1.11';

-- pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions VERSION '1.3';

-- plpgsql
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog VERSION '1.0';

-- supabase_vault
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault VERSION '0.3.1';

-- uuid-ossp
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions VERSION '1.1';
