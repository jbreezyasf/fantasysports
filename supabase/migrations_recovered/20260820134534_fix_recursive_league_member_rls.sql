-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820134534, name fix_recursive_league_member_rls. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

drop policy if exists league_member_read_leagues on public.fantasy_leagues;
create policy league_member_read_leagues on public.fantasy_leagues
for select to authenticated
using (public.is_league_member(id));

drop policy if exists league_member_read_members on public.league_members;
create policy league_member_read_members on public.league_members
for select to authenticated
using (public.is_league_member(league_id));
