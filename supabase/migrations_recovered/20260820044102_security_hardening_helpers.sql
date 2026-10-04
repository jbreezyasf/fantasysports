-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820044102, name security_hardening_helpers. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

revoke all on function public.rls_auto_enable() from public, anon, authenticated; comment on function public.rls_auto_enable() is 'Internal database helper; not callable through client API.';
