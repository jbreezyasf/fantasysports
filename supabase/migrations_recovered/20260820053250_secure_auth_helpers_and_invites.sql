-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820053250, name secure_auth_helpers_and_invites. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.is_league_member(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;

create policy league_invites_commissioner_select on public.league_invites
for select to authenticated
using (
  exists (select 1 from public.league_members lm where lm.league_id=league_invites.league_id and lm.user_id=auth.uid() and lm.role='commissioner')
  or lower(email)=lower(coalesce(auth.jwt()->>'email',''))
);
create policy league_invites_commissioner_insert on public.league_invites
for insert to authenticated
with check (
  invited_by=auth.uid() and exists (select 1 from public.league_members lm where lm.league_id=league_invites.league_id and lm.user_id=auth.uid() and lm.role='commissioner')
);
create policy league_invites_commissioner_update on public.league_invites
for update to authenticated
using (
  exists (select 1 from public.league_members lm where lm.league_id=league_invites.league_id and lm.user_id=auth.uid() and lm.role='commissioner')
  or lower(email)=lower(coalesce(auth.jwt()->>'email',''))
)
with check (
  exists (select 1 from public.league_members lm where lm.league_id=league_invites.league_id and lm.user_id=auth.uid() and lm.role='commissioner')
  or lower(email)=lower(coalesce(auth.jwt()->>'email',''))
);
create policy league_invites_commissioner_delete on public.league_invites
for delete to authenticated
using (
  exists (select 1 from public.league_members lm where lm.league_id=league_invites.league_id and lm.user_id=auth.uid() and lm.role='commissioner')
);
