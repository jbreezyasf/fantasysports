create or replace function public.create_league_share_invite(p_league_id uuid)
returns table(invite_id uuid, invite_token uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_token uuid := gen_random_uuid();
  v_email text := concat('share+', replace(v_token::text, '-', ''), '@bigexecfs.local');
  v_invite_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.league_members lm
    where lm.league_id = p_league_id
      and lm.user_id = v_user
      and lm.role = 'commissioner'
  ) then
    raise exception 'Only the league commissioner can create invite links';
  end if;

  insert into public.league_invites(league_id, invited_by, email, invite_token, status, expires_at)
  values (p_league_id, v_user, v_email, v_token, 'pending', now() + interval '14 days')
  returning id into v_invite_id;

  return query select v_invite_id, v_token, v_email;
end;
$$;

create or replace function public.get_public_league_invite_v2(p_invite_token uuid)
returns table(
  league_id uuid,
  league_name text,
  invite_kind text,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    li.league_id,
    fl.name as league_name,
    case when li.email like 'share+%@bigexecfs.local' then 'share' else 'email' end as invite_kind,
    li.status::text,
    li.expires_at
  from public.league_invites li
  join public.fantasy_leagues fl on fl.id = li.league_id
  where li.invite_token = p_invite_token
    and li.status = 'pending'
    and li.expires_at > now()
  limit 1;
$$;

create or replace function public.claim_share_league_invite(p_invite_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select lower(coalesce(u.email, '')) into v_email
  from auth.users u
  where u.id = v_user;

  if coalesce(v_email, '') = '' then
    raise exception 'Your account needs an email address before claiming this invite';
  end if;

  update public.league_invites li
  set email = v_email
  where li.invite_token = p_invite_token
    and li.status = 'pending'
    and li.expires_at > now()
    and li.email like 'share+%@bigexecfs.local';

  return found;
end;
$$;

grant execute on function public.create_league_share_invite(uuid) to authenticated;
grant execute on function public.get_public_league_invite_v2(uuid) to anon, authenticated, service_role;
grant execute on function public.claim_share_league_invite(uuid) to authenticated;

grant execute on function public.get_public_league_invite(uuid) to anon, authenticated, service_role;
grant execute on function public.invite_matches_current_user(uuid) to authenticated, service_role;
