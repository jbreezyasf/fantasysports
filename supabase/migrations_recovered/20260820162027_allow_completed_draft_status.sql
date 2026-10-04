-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820162027, name allow_completed_draft_status. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.drafts drop constraint if exists drafts_status_check;
alter table public.drafts add constraint drafts_status_check check (status = any (array['scheduled'::text,'live'::text,'paused'::text,'complete'::text,'completed'::text]));
