-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820121435, name fix_league_read_policy. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

drop policy if exists league_member_read_leagues on public.fantasy_leagues;
create policy league_member_read_leagues on public.fantasy_leagues
for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.league_members lm
    where lm.league_id = fantasy_leagues.id
      and lm.user_id = auth.uid()
  )
);
