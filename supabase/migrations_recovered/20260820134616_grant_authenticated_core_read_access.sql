-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820134616, name grant_authenticated_core_read_access. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

grant select on public.fantasy_leagues to authenticated;
grant select on public.league_members to authenticated;
grant select on public.league_seasons to authenticated;
grant select on public.franchises to authenticated;
grant select on public.franchise_owners to authenticated;
grant select on public.season_franchises to authenticated;
grant select on public.standings to authenticated;
grant select on public.league_invites to authenticated;
grant select on public.drafts to authenticated;
grant select on public.matchups to authenticated;
grant select on public.user_profiles to authenticated;
