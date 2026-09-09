drop function if exists public.get_public_league_invite_v2(uuid);
drop function if exists public.claim_share_league_invite(uuid);

create or replace function public.create_league_share_invite(p_league_id uuid)
returns table(invite_id uuid, invite_token uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.league_invites%rowtype;
  v_token uuid := gen_random_uuid();
  v_email text := concat('share+', replace(v_token::text, '-', ''), '@bigexecfs.local');
  v_invite_id uuid;
  v_member_count int;
  v_capacity int;
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

  select max_franchises into v_capacity from public.fantasy_leagues where id = p_league_id;
  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  if v_member_count >= coalesce(v_capacity, 10) then
    raise exception 'League is full';
  end if;

  select *
    into v_existing
  from public.league_invites li
  where li.league_id = p_league_id
    and li.status = 'pending'
    and li.expires_at > now()
    and li.email like 'share+%@bigexecfs.local'
  order by li.created_at desc
  limit 1;

  if v_existing.id is not null then
    return query select v_existing.id, v_existing.invite_token, v_existing.email;
    return;
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
  expires_at timestamptz,
  remaining_claims integer
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
    li.expires_at,
    greatest(0, coalesce(fl.max_franchises, 10) - (
      select count(*)::int
      from public.league_members lm
      where lm.league_id = li.league_id
    )) as remaining_claims
  from public.league_invites li
  join public.fantasy_leagues fl on fl.id = li.league_id
  where li.invite_token = p_invite_token
    and li.status = 'pending'
    and li.expires_at > now()
    and greatest(0, coalesce(fl.max_franchises, 10) - (
      select count(*)::int
      from public.league_members lm
      where lm.league_id = li.league_id
    )) > 0
  limit 1;
$$;

create or replace function public.claim_share_league_invite(p_invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_master public.league_invites%rowtype;
  v_capacity int;
  v_member_count int;
  v_existing public.league_invites%rowtype;
  v_claim_id uuid;
  v_claim_token uuid := gen_random_uuid();
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

  select *
    into v_master
  from public.league_invites li
  where li.invite_token = p_invite_token
    and li.status = 'pending'
    and li.expires_at > now()
    and li.email like 'share+%@bigexecfs.local'
  for update;

  if v_master.id is null then
    return null;
  end if;

  if exists (
    select 1
    from public.league_members lm
    where lm.league_id = v_master.league_id
      and lm.user_id = v_user
  ) then
    raise exception 'You are already a member of this league';
  end if;

  select max_franchises into v_capacity from public.fantasy_leagues where id = v_master.league_id;
  select count(*) into v_member_count from public.league_members where league_id = v_master.league_id;
  if v_member_count >= coalesce(v_capacity, 10) then
    raise exception 'League is full';
  end if;

  select *
    into v_existing
  from public.league_invites li
  where li.league_id = v_master.league_id
    and li.status = 'pending'
    and lower(li.email) = v_email
    and li.email not like 'share+%@bigexecfs.local'
    and li.expires_at > now()
  order by li.created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing.invite_token;
  end if;

  insert into public.league_invites(league_id, invited_by, email, invite_token, status, expires_at)
  values (v_master.league_id, v_master.invited_by, v_email, v_claim_token, 'pending', v_master.expires_at)
  returning id into v_claim_id;

  return v_claim_token;
end;
$$;

create or replace function public.commissioner_remove_pre_draft_franchise(p_league_id uuid, p_franchise_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_target_user uuid;
  v_current_season uuid;
  v_season_franchise uuid;
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
    raise exception 'Only the league commissioner can remove a franchise';
  end if;

  select user_id into v_target_user
  from public.franchise_owners
  where franchise_id = p_franchise_id
    and ends_on is null
  limit 1;

  if v_target_user is null then
    raise exception 'Active franchise owner not found';
  end if;

  if v_target_user = v_user then
    raise exception 'Commissioner cannot remove their own franchise from this control';
  end if;

  if not exists (
    select 1
    from public.franchises f
    where f.id = p_franchise_id
      and f.league_id = p_league_id
  ) then
    raise exception 'Franchise is not in this league';
  end if;

  select id into v_current_season
  from public.league_seasons
  where league_id = p_league_id
    and is_current = true
  limit 1;

  if v_current_season is null then
    raise exception 'Current league season missing';
  end if;

  if exists (
    select 1
    from public.drafts d
    where d.league_season_id = v_current_season
      and d.status <> 'scheduled'
  ) then
    raise exception 'Managers can only be removed before the draft starts';
  end if;

  if exists (
    select 1
    from public.draft_picks dp
    join public.drafts d on d.id = dp.draft_id
    where d.league_season_id = v_current_season
  ) then
    raise exception 'Managers can only be removed before draft picks exist';
  end if;

  select id into v_season_franchise
  from public.season_franchises
  where league_season_id = v_current_season
    and franchise_id = p_franchise_id;

  if v_season_franchise is not null then
    delete from public.standings where season_franchise_id = v_season_franchise;
    delete from public.season_franchises where id = v_season_franchise;
  end if;

  update public.franchise_owners
  set ends_on = current_date
  where franchise_id = p_franchise_id
    and user_id = v_target_user
    and ends_on is null;

  delete from public.league_members
  where league_id = p_league_id
    and user_id = v_target_user
    and role <> 'commissioner';

  delete from public.franchises
  where id = p_franchise_id
    and league_id = p_league_id;

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  values (
    p_league_id,
    v_current_season,
    v_user,
    'manager_removed',
    'A franchise seat was reopened by the commissioner',
    jsonb_build_object('franchise_id', p_franchise_id, 'removed_user_id', v_target_user)
  );

  return true;
end;
$$;

grant execute on function public.create_league_share_invite(uuid) to authenticated;
grant execute on function public.get_public_league_invite_v2(uuid) to anon, authenticated, service_role;
grant execute on function public.claim_share_league_invite(uuid) to authenticated;
grant execute on function public.commissioner_remove_pre_draft_franchise(uuid, uuid) to authenticated;
