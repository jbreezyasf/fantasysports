-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820155624, name grant_authenticated_draft_pool_reads. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

grant select on table public.athletes to authenticated;
grant select on table public.real_teams to authenticated;
