alter table public.franchises
  add column if not exists avatar_key text not null default 'classic';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'franchises_avatar_key_check'
      and conrelid = 'public.franchises'::regclass
  ) then
    alter table public.franchises
      add constraint franchises_avatar_key_check
      check (avatar_key in ('classic', 'crown', 'tower', 'orbit'));
  end if;
end $$;

comment on column public.franchises.avatar_key is
  'Selected original Big Exec franchise avatar/crest style. The mark is generated from franchise name, abbreviation, and colors.';

drop function if exists public.create_pro_football_league(text, text, text, text, text);
drop function if exists public.accept_league_invite(uuid, text, text, text, text);

create or replace function public.create_pro_football_league(
  p_name text,
  p_franchise_name text,
  p_abbreviation text default null::text,
  p_primary_color text default null::text,
  p_secondary_color text default null::text,
  p_avatar_key text default 'classic'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_competition uuid;
  v_competition_season uuid;
  v_season_year integer;
  v_scoring uuid;
  v_league uuid;
  v_league_season uuid;
  v_franchise uuid;
  v_season_franchise uuid;
  v_trade_deadline timestamptz;
  v_avatar_key text := coalesce(nullif(trim(p_avatar_key), ''), 'classic');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'League name required'; end if;
  if nullif(trim(p_franchise_name),'') is null then raise exception 'Franchise name required'; end if;
  if v_avatar_key not in ('classic', 'crown', 'tower', 'orbit') then raise exception 'Choose one of the available franchise avatar options'; end if;

  select id into v_competition from competitions where code='pro_football';
  select cs.id, cs.season_year
    into v_competition_season, v_season_year
  from competition_seasons cs
  where cs.competition_id=v_competition
  order by cs.season_year desc
  limit 1;
  if v_competition_season is null then raise exception 'Pro Football season missing'; end if;

  if v_season_year = 2026 then
    v_trade_deadline := timestamptz '2026-11-10 21:00:00+00';
  end if;

  select id into v_scoring from scoring_profiles where sport='football' and is_system_default=true limit 1;
  if v_scoring is null then raise exception 'Default football scoring profile missing'; end if;

  insert into fantasy_leagues(name, created_by) values(trim(p_name), v_user) returning id into v_league;
  insert into league_members(league_id,user_id,role) values(v_league,v_user,'commissioner');
  insert into league_seasons(league_id,competition_season_id,status,roster_config,scoring_profile_id,trade_deadline_at)
  values(v_league,v_competition_season,'setup','{"starters":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1},"bench":6,"ir":1}'::jsonb,v_scoring,v_trade_deadline)
  returning id into v_league_season;
  insert into franchises(league_id,name,abbreviation,primary_color,secondary_color,avatar_key,established_year)
  values(v_league,trim(p_franchise_name),upper(nullif(trim(p_abbreviation),'')),p_primary_color,p_secondary_color,v_avatar_key,extract(year from current_date)::int)
  returning id into v_franchise;
  insert into franchise_owners(franchise_id,user_id) values(v_franchise,v_user);
  insert into season_franchises(league_season_id,franchise_id) values(v_league_season,v_franchise) returning id into v_season_franchise;
  insert into standings(league_season_id,season_franchise_id) values(v_league_season,v_season_franchise);
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_league,v_league_season,v_user,'league_created','League created',jsonb_build_object('franchise_id',v_franchise,'avatar_key',v_avatar_key));

  return jsonb_build_object('league_id',v_league,'league_season_id',v_league_season,'franchise_id',v_franchise,'season_franchise_id',v_season_franchise);
end
$function$;

create or replace function public.accept_league_invite(
  p_invite_token uuid,
  p_franchise_name text,
  p_abbreviation text default null::text,
  p_primary_color text default null::text,
  p_secondary_color text default null::text,
  p_avatar_key text default 'classic'::text
)
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
  v_avatar_key text := coalesce(nullif(trim(p_avatar_key), ''), 'classic');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_franchise_name),'') is null then raise exception 'Franchise name required'; end if;
  if v_avatar_key not in ('classic', 'crown', 'tower', 'orbit') then raise exception 'Choose one of the available franchise avatar options'; end if;
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
  insert into franchises(league_id,name,abbreviation,primary_color,secondary_color,avatar_key,established_year)
  values(v_invite.league_id,trim(p_franchise_name),upper(nullif(trim(p_abbreviation),'')),p_primary_color,p_secondary_color,v_avatar_key,extract(year from current_date)::int) returning id into v_franchise;
  insert into franchise_owners(franchise_id,user_id) values(v_franchise,v_user);
  insert into season_franchises(league_season_id,franchise_id) values(v_league_season,v_franchise) returning id into v_season_franchise;
  insert into standings(league_season_id,season_franchise_id) values(v_league_season,v_season_franchise);
  update league_invites set status='accepted', accepted_by=v_user, accepted_at=now() where id=v_invite.id;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_invite.league_id,v_league_season,v_user,'manager_joined','A new franchise joined the league',jsonb_build_object('franchise_id',v_franchise,'avatar_key',v_avatar_key));
  return jsonb_build_object('league_id',v_invite.league_id,'franchise_id',v_franchise,'season_franchise_id',v_season_franchise);
end $function$;

revoke execute on function public.create_pro_football_league(text, text, text, text, text, text) from public, anon;
revoke execute on function public.accept_league_invite(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_pro_football_league(text, text, text, text, text, text) to authenticated;
grant execute on function public.accept_league_invite(uuid, text, text, text, text, text) to authenticated;
