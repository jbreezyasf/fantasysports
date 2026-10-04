-- cron.sql — pg_cron jobs (name, schedule, command).
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== cron: 2 object(s) =====
-- Query:
--   select coalesce(j.jobname, j.jobid::text)::text as ord,
--          format(E'-- active: %s\nselect cron.schedule(%L, %L, %L);', j.active, j.jobname, j.schedule, j.command) as text
--   from cron.job j

-- big-exec-process-draft-autopicks
-- active: t
select cron.schedule('big-exec-process-draft-autopicks', '* * * * *', 'select public.process_expired_draft_picks();');

-- big-exec-process-waivers
-- active: t
select cron.schedule('big-exec-process-waivers', '*/15 * * * *', 'select public.process_all_due_waivers();');
