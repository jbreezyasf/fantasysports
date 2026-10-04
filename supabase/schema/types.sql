-- types.sql — Enum types in schema public.
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== types: 5 object(s) =====
-- Query:
--   select t.typname::text as ord,
--          format('CREATE TYPE public.%I AS ENUM (%s);', t.typname,
--                 string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)) as text
--   from pg_type t
--   join pg_namespace n on n.oid = t.typnamespace
--   join pg_enum e on e.enumtypid = t.oid
--   where n.nspname = 'public'
--   group by t.typname

-- competition_level
CREATE TYPE public.competition_level AS ENUM ('pro', 'college');

-- game_state
CREATE TYPE public.game_state AS ENUM ('scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'delayed', 'suspended', 'unknown');

-- lineup_slot
CREATE TYPE public.lineup_slot AS ENUM ('QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BENCH', 'IR');

-- member_role
CREATE TYPE public.member_role AS ENUM ('commissioner', 'manager');

-- sport_code
CREATE TYPE public.sport_code AS ENUM ('football', 'basketball', 'baseball', 'soccer');
