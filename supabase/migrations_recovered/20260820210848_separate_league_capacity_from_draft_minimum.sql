-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820210848, name separate_league_capacity_from_draft_minimum. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.fantasy_leagues add column if not exists max_franchises integer not null default 10 check (max_franchises between 2 and 20);
update public.fantasy_leagues set max_franchises=2 where name='Football Junkies 1';

create or replace function public.create_league_invite(p_league_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_token uuid := gen_random_uuid();
  v_invite_id uuid;
  v_email text := lower(trim(p_email));
  v_active_count int;
  v_capacity int;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_email is null or v_email = '' then raise exception 'Email required'; end if;
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select max_franchises into v_capacity from fantasy_leagues where id=p_league_id;
  select count(*) into v_active_count from league_members where league_id=p_league_id;
  if v_active_count >= coalesce(v_capacity,10) then raise exception 'League is full'; end if;
  if exists(select 1 from league_invites where league_id=p_league_id and lower(email)=v_email and status='pending' and expires_at > now()) then
    select id, invite_token into v_invite_id, v_token from league_invites where league_id=p_league_id and lower(email)=v_email and status='pending' and expires_at > now() order by created_at desc limit 1;
  else
    insert into league_invites(league_id, invited_by, email, invite_token, status, expires_at)
    values(p_league_id, v_user, v_email, v_token, 'pending', now() + interval '14 days') returning id into v_invite_id;
  end if;
  return jsonb_build_object('invite_id',v_invite_id,'invite_token',v_token,'email',v_email);
end $function$;

create or replace function public.accept_league_invite(p_invite_token uuid, p_franchise_name text, p_abbreviation text default null, p_primary_color text default null, p_secondary_color text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite league_invites%rowtype;
  v_league_season uuid;
  v_franchise uuid;
  v_season_franchise uuid;
  v_member_count int;
  v_capacity int;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_franchise_name),'') is null then raise exception 'Franchise name required'; end if;
  select lower(coalesce(email,'')) into v_email from auth.users where id=v_user;
  select * into v_invite from league_invites where invite_token=p_invite_token and status='pending' and expires_at>now() for update;
  if v_invite.id is null then raise exception 'Invite invalid or expired'; end if;
  if lower(v_invite.email) <> v_email then raise exception 'Invite email does not match signed-in account'; end if;
  if exists(select 1 from league_members where league_id=v_invite.league_id and user_id=v_user) then raise exception 'You are already a member of this league'; end if;
  select max_franchises into v_capacity from fantasy_leagues where id=v_invite.league_id;
  select count(*) into v_member_count from league_members where league_id=v_invite.league_id;
  if v_member_count >= coalesce(v_capacity,10) then raise exception 'League is full'; end if;
  select ls.id into v_league_season from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=v_invite.league_id order by cs.season_year desc limit 1;
  if v_league_season is null then raise exception 'League season missing'; end if;
  insert into league_members(league_id,user_id,role) values(v_invite.league_id,v_user,'manager');
  insert into franchises(league_id,name,abbreviation,primary_color,secondary_color,established_year)
  values(v_invite.league_id,trim(p_franchise_name),upper(nullif(trim(p_abbreviation),'')),p_primary_color,p_secondary_color,extract(year from current_date)::int) returning id into v_franchise;
  insert into franchise_owners(franchise_id,user_id) values(v_franchise,v_user);
  insert into season_franchises(league_season_id,franchise_id) values(v_league_season,v_franchise) returning id into v_season_franchise;
  insert into standings(league_season_id,season_franchise_id) values(v_league_season,v_season_franchise);
  update league_invites set status='accepted', accepted_by=v_user, accepted_at=now() where id=v_invite.id;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_invite.league_id,v_league_season,v_user,'manager_joined','A new franchise joined the league',jsonb_build_object('franchise_id',v_franchise));
  return jsonb_build_object('league_id',v_invite.league_id,'franchise_id',v_franchise,'season_franchise_id',v_season_franchise);
end $function$;
