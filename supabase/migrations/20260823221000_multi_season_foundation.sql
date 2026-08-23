-- Big Exec multi-season foundation.
-- A league may own many historical seasons, but normal gameplay must resolve exactly one current season.

alter table public.league_seasons
  add column if not exists is_current boolean not null default true;

-- Existing production leagues were built under a one-season assumption. If drift exists,
-- retain the newest competition season as current and mark all older rows historical.
with ranked as (
  select
    ls.id,
    row_number() over (
      partition by ls.league_id
      order by cs.season_year desc, ls.id desc
    ) as rn
  from public.league_seasons ls
  join public.competition_seasons cs on cs.id = ls.competition_season_id
)
update public.league_seasons ls
set is_current = (ranked.rn = 1)
from ranked
where ranked.id = ls.id;

create unique index if not exists league_seasons_one_current_per_league_idx
  on public.league_seasons(league_id)
  where is_current;

create or replace function public.current_league_season_id(p_league_id uuid)
returns uuid
language sql
stable
set search_path = 'public'
as $function$
  select ls.id
  from public.league_seasons ls
  where ls.league_id = p_league_id
    and ls.is_current
  limit 1
$function$;

-- New season activation is explicit and atomic. Historical seasons stay intact.
create or replace function public.activate_league_season(p_league_season_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_league uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select league_id into v_league
  from public.league_seasons
  where id = p_league_season_id;

  if v_league is null then raise exception 'League season not found'; end if;

  if not exists (
    select 1 from public.league_members
    where league_id = v_league and user_id = v_user and role = 'commissioner'
  ) then
    raise exception 'Commissioner access required';
  end if;

  update public.league_seasons set is_current = false where league_id = v_league and is_current;
  update public.league_seasons set is_current = true where id = p_league_season_id;
  return p_league_season_id;
end
$function$;

revoke all on function public.activate_league_season(uuid) from public, anon;
grant execute on function public.activate_league_season(uuid) to authenticated, postgres;

-- Trade deadlines must never mutate archived seasons.
create or replace function public.set_trade_deadline(p_league_id uuid, p_deadline timestamp with time zone)
returns timestamp with time zone
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_ls uuid;
  v_existing timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = v_user and role = 'commissioner'
  ) then
    raise exception 'Commissioner access required';
  end if;
  if p_deadline is null or p_deadline <= now() then raise exception 'Trade deadline must be in the future'; end if;

  v_ls := public.current_league_season_id(p_league_id);
  if v_ls is null then raise exception 'Current league season not found'; end if;

  select trade_deadline_at into v_existing from public.league_seasons where id = v_ls;
  if v_existing is not null and v_existing <= now() then raise exception 'A passed trade deadline cannot be reopened'; end if;

  update public.league_seasons set trade_deadline_at = p_deadline where id = v_ls;

  insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_ls,v_user,'trade_deadline_set','Trade deadline set',jsonb_build_object('trade_deadline_at',p_deadline));

  return p_deadline;
end
$function$;

-- These two functions previously resolved season by arbitrary/highest row id.
create or replace function public.post_locker_room_message(p_league_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_event uuid;
  v_body text := trim(p_body);
  v_ls uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.is_league_member(p_league_id) then raise exception 'League access required'; end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Message must be between 1 and 1000 characters';
  end if;

  v_ls := public.current_league_season_id(p_league_id);
  if v_ls is null then raise exception 'Current league season not found'; end if;

  insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_ls,v_user,'human_message',v_body,'{}')
  returning id into v_event;

  return jsonb_build_object('status','posted','event_id',v_event);
end
$function$;

create or replace function public.generate_weekly_awards(p_league_id uuid, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_ls uuid;
  rec record;
  v_count int := 0;
begin
  if not exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = v_user and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  v_ls := public.current_league_season_id(p_league_id);
  if v_ls is null then raise exception 'Current league season not found'; end if;

  if not exists(select 1 from public.matchups where league_season_id=v_ls and week=p_week) then raise exception 'No matchups for this week'; end if;
  if exists(select 1 from public.matchups where league_season_id=v_ls and week=p_week and not is_final) then raise exception 'All matchups must be final before awards'; end if;

  select season_franchise_id,points into rec from (
    select home_season_franchise_id season_franchise_id,home_points points from public.matchups where league_season_id=v_ls and week=p_week
    union all
    select away_season_franchise_id,away_points from public.matchups where league_season_id=v_ls and week=p_week
  ) x order by points desc,season_franchise_id limit 1;
  insert into public.weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload)
  values(v_ls,p_week,'highest_score','Highest Score',rec.season_franchise_id,jsonb_build_object('points',rec.points)) on conflict do nothing;
  if found then v_count:=v_count+1; end if;

  select winner_season_franchise_id,abs(home_points-away_points) margin into rec
  from public.matchups where league_season_id=v_ls and week=p_week and winner_season_franchise_id is not null
  order by abs(home_points-away_points) desc,id limit 1;
  if rec.winner_season_franchise_id is not null then
    insert into public.weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload)
    values(v_ls,p_week,'biggest_blowout','Biggest Blowout',rec.winner_season_franchise_id,jsonb_build_object('margin',rec.margin)) on conflict do nothing;
    if found then v_count:=v_count+1; end if;
  end if;

  select winner_season_franchise_id,abs(home_points-away_points) margin into rec
  from public.matchups where league_season_id=v_ls and week=p_week and winner_season_franchise_id is not null
  order by abs(home_points-away_points),id limit 1;
  if rec.winner_season_franchise_id is not null then
    insert into public.weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload)
    values(v_ls,p_week,'closest_win','Closest Win',rec.winner_season_franchise_id,jsonb_build_object('margin',rec.margin)) on conflict do nothing;
    if found then v_count:=v_count+1; end if;
  end if;

  insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  select p_league_id,v_ls,v_user,'weekly_awards','Week '||p_week||' awards are in',
    jsonb_build_object('week',p_week,'awards',jsonb_agg(jsonb_build_object('code',code,'title',title,'winner',winner_season_franchise_id,'payload',payload)))
  from public.weekly_awards
  where league_season_id=v_ls and week=p_week
    and not exists(
      select 1 from public.league_feed_events e
      where e.league_id=p_league_id and e.season_id=v_ls and e.event_type='weekly_awards' and (e.payload->>'week')::int=p_week
    )
  group by league_season_id;

  return jsonb_build_object('status','ok','week',p_week,'awards',(select count(*) from public.weekly_awards where league_season_id=v_ls and week=p_week));
end
$function$;
