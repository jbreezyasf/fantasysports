-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260823220243, name cascade_achievement_stadium_links. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.franchise_stadium_features drop constraint if exists franchise_stadium_features_source_achievement_id_fkey; alter table public.franchise_stadium_features add constraint franchise_stadium_features_source_achievement_id_fkey foreign key(source_achievement_id) references public.franchise_achievements(id) on delete cascade;
