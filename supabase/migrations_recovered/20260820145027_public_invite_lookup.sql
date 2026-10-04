-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820145027, name public_invite_lookup. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.get_public_league_invite(p_invite_token uuid)
returns table(
  league_id uuid,
  league_name text,
  status text,
  expires_at timestamptz,
  draft_min_franchises integer
)
language sql
stable
security definer
set search_path=public
as $$
  select li.league_id, fl.name, li.status, li.expires_at, coalesce(fl.draft_min_franchises,10)
  from league_invites li
  join fantasy_leagues fl on fl.id=li.league_id
  where li.invite_token=p_invite_token
    and li.status='pending'
    and li.expires_at>now()
  limit 1;
$$;
revoke all on function public.get_public_league_invite(uuid) from public;
grant execute on function public.get_public_league_invite(uuid) to anon, authenticated;
