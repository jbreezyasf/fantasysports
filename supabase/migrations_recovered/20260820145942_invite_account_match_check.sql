-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820145942, name invite_account_match_check. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.invite_matches_current_user(p_invite_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.league_invites li
    join auth.users u on u.id = auth.uid()
    where li.invite_token = p_invite_token
      and li.status = 'pending'
      and li.expires_at > now()
      and lower(li.email) = lower(coalesce(u.email,''))
  );
$$;

grant execute on function public.invite_matches_current_user(uuid) to authenticated;
revoke execute on function public.invite_matches_current_user(uuid) from anon;
