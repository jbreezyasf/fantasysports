-- Big Exec core-integrity fixes validated against production on 2026-08-23.

alter table public.league_seasons
  add column if not exists trade_deadline_at timestamptz;

comment on column public.league_seasons.trade_deadline_at is
  'After this instant no new trade proposal may be created and no pending trade may be accepted.';

-- 2026 Pro Football uses the real NFL trade deadline: Nov 10, 2026 at 4 PM ET / 3 PM CT.
update public.league_seasons ls
set trade_deadline_at = timestamptz '2026-11-10 21:00:00+00'
from public.competition_seasons cs
join public.competitions c on c.id = cs.competition_id
where ls.competition_season_id = cs.id
  and c.code = 'pro_football'
  and cs.season_year = 2026
  and ls.trade_deadline_at is null;

-- Big Exec rule: a touchdown is worth six points, including passing touchdowns.
update public.scoring_profiles
set rules = jsonb_set(rules, '{passing_td}', '6'::jsonb, true)
where sport = 'football'
  and is_system_default = true;

create or replace function public.create_pro_football_league(
  p_name text,
  p_franchise_name text,
  p_abbreviation text default null::text,
  p_primary_color text default null::text,
  p_secondary_color text default null::text
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
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'League name required'; end if;
  if nullif(trim(p_franchise_name),'') is null then raise exception 'Franchise name required'; end if;

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
  insert into franchises(league_id,name,abbreviation,primary_color,secondary_color,established_year)
  values(v_league,trim(p_franchise_name),upper(nullif(trim(p_abbreviation),'')),p_primary_color,p_secondary_color,extract(year from current_date)::int)
  returning id into v_franchise;
  insert into franchise_owners(franchise_id,user_id) values(v_franchise,v_user);
  insert into season_franchises(league_season_id,franchise_id) values(v_league_season,v_franchise) returning id into v_season_franchise;
  insert into standings(league_season_id,season_franchise_id) values(v_league_season,v_season_franchise);
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_league,v_league_season,v_user,'league_created','League created',jsonb_build_object('franchise_id',v_franchise));

  return jsonb_build_object('league_id',v_league,'league_season_id',v_league_season,'franchise_id',v_franchise,'season_franchise_id',v_season_franchise);
end
$function$;

create or replace function public.create_trade_proposal(
  p_league_season_id uuid,
  p_to_season_franchise_id uuid,
  p_offer_athlete_ids uuid[] default '{}'::uuid[],
  p_request_athlete_ids uuid[] default '{}'::uuid[],
  p_offer_team_ids uuid[] default '{}'::uuid[],
  p_request_team_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_from uuid;
  v_trade uuid;
  v_league uuid;
  v_deadline timestamptz;
  x uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select ls.league_id, ls.trade_deadline_at into v_league, v_deadline from league_seasons ls where ls.id=p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;
  if v_deadline is not null and now() >= v_deadline then raise exception 'The trade deadline has passed. Trades are closed for this season.'; end if;

  select sf.id into v_from from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.league_season_id=p_league_season_id and fo.user_id=v_user and fo.ends_on is null limit 1;
  if v_from is null then raise exception 'You do not own a franchise in this season'; end if;
  if p_to_season_franchise_id=v_from then raise exception 'Cannot trade with your own franchise'; end if;
  if not exists(select 1 from season_franchises where id=p_to_season_franchise_id and league_season_id=p_league_season_id) then raise exception 'Trade partner not in this league season'; end if;
  if coalesce(array_length(p_offer_athlete_ids,1),0)+coalesce(array_length(p_request_athlete_ids,1),0)+coalesce(array_length(p_offer_team_ids,1),0)+coalesce(array_length(p_request_team_ids,1),0)=0 then raise exception 'Trade must contain at least one asset'; end if;
  foreach x in array p_offer_athlete_ids loop if not exists(select 1 from roster_entries where season_franchise_id=v_from and athlete_id=x and dropped_at is null) then raise exception 'Offered athlete is no longer on your roster'; end if; end loop;
  foreach x in array p_request_athlete_ids loop if not exists(select 1 from roster_entries where season_franchise_id=p_to_season_franchise_id and athlete_id=x and dropped_at is null) then raise exception 'Requested athlete is no longer on partner roster'; end if; end loop;
  foreach x in array p_offer_team_ids loop if not exists(select 1 from roster_entries where season_franchise_id=v_from and real_team_id=x and dropped_at is null) then raise exception 'Offered D/ST is no longer on your roster'; end if; end loop;
  foreach x in array p_request_team_ids loop if not exists(select 1 from roster_entries where season_franchise_id=p_to_season_franchise_id and real_team_id=x and dropped_at is null) then raise exception 'Requested D/ST is no longer on partner roster'; end if; end loop;
  insert into trades(league_season_id,proposed_by_franchise_id,proposed_to_franchise_id,status) values(p_league_season_id,v_from,p_to_season_franchise_id,'proposed') returning id into v_trade;
  foreach x in array p_offer_athlete_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,athlete_id) values(v_trade,v_from,p_to_season_franchise_id,x); end loop;
  foreach x in array p_request_athlete_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,athlete_id) values(v_trade,p_to_season_franchise_id,v_from,x); end loop;
  foreach x in array p_offer_team_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,real_team_id) values(v_trade,v_from,p_to_season_franchise_id,x); end loop;
  foreach x in array p_request_team_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,real_team_id) values(v_trade,p_to_season_franchise_id,v_from,x); end loop;
  insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts) values(v_league,p_league_season_id,'trade',v_trade,'trade_proposed',jsonb_build_object('from',v_from,'to',p_to_season_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=v_trade)));
  return jsonb_build_object('status','proposed','trade_id',v_trade);
end
$function$;

create or replace function public.resolve_trade(p_trade_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  t trades%rowtype;
  v_league uuid;
  v_deadline timestamptz;
  v_last_final int:=0;
  item record;
  v_owner_from boolean;
  v_owner_to boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into t from trades where id=p_trade_id for update;
  if t.id is null then raise exception 'Trade not found'; end if;
  if t.status<>'proposed' then return jsonb_build_object('status',t.status,'already_resolved',true); end if;
  select ls.league_id, ls.trade_deadline_at into v_league, v_deadline from league_seasons ls where ls.id=t.league_season_id;

  select exists(select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.id=t.proposed_by_franchise_id and fo.user_id=v_user and fo.ends_on is null) into v_owner_from;
  select exists(select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.id=t.proposed_to_franchise_id and fo.user_id=v_user and fo.ends_on is null) into v_owner_to;
  if p_action='cancel' then if not v_owner_from then raise exception 'Only proposer can cancel'; end if; update trades set status='cancelled',resolved_at=now() where id=t.id; return jsonb_build_object('status','cancelled'); end if;
  if p_action='reject' then if not v_owner_to then raise exception 'Only recipient can reject'; end if; update trades set status='rejected',resolved_at=now() where id=t.id; return jsonb_build_object('status','rejected'); end if;
  if p_action<>'accept' then raise exception 'Unsupported trade action'; end if;
  if not v_owner_to then raise exception 'Only recipient can accept'; end if;
  if v_deadline is not null and now() >= v_deadline then raise exception 'The trade deadline has passed. This offer can no longer be accepted.'; end if;

  for item in select * from trade_items where trade_id=t.id loop
    if item.athlete_id is not null and not exists(select 1 from roster_entries where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and dropped_at is null) then raise exception 'Trade asset changed before acceptance'; end if;
    if item.real_team_id is not null and not exists(select 1 from roster_entries where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and dropped_at is null) then raise exception 'Trade asset changed before acceptance'; end if;
  end loop;
  select coalesce(max(week),0) into v_last_final from matchups where league_season_id=t.league_season_id and is_final;
  for item in select * from trade_items where trade_id=t.id loop
    if item.athlete_id is not null then
      update roster_entries set dropped_at=now() where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and dropped_at is null;
      insert into roster_entries(season_franchise_id,athlete_id,acquired_via) values(item.to_season_franchise_id,item.athlete_id,'trade');
      delete from lineups where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and week>v_last_final;
    else
      update roster_entries set dropped_at=now() where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and dropped_at is null;
      insert into roster_entries(season_franchise_id,real_team_id,acquired_via) values(item.to_season_franchise_id,item.real_team_id,'trade');
      delete from lineups where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and week>v_last_final;
    end if;
  end loop;
  update trades set status='accepted',resolved_at=now() where id=t.id;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_league,t.league_season_id,v_user,'trade_accepted','Trade accepted',jsonb_build_object('trade_id',t.id,'from',t.proposed_by_franchise_id,'to',t.proposed_to_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=t.id)));
  insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts)
  values(v_league,t.league_season_id,'trade',t.id,'trade_accepted',jsonb_build_object('from',t.proposed_by_franchise_id,'to',t.proposed_to_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=t.id)));
  return jsonb_build_object('status','accepted','trade_id',t.id);
end
$function$;

create or replace function public.set_trade_deadline(p_league_id uuid, p_deadline timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_existing timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then
    raise exception 'Commissioner access required';
  end if;
  if p_deadline is null or p_deadline <= now() then raise exception 'Trade deadline must be in the future'; end if;

  select trade_deadline_at into v_existing from league_seasons where league_id=p_league_id;
  if v_existing is not null and v_existing <= now() then raise exception 'A passed trade deadline cannot be reopened'; end if;

  update league_seasons set trade_deadline_at=p_deadline where league_id=p_league_id;
  if not found then raise exception 'League season not found'; end if;

  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  select p_league_id,id,v_user,'trade_deadline_set','Trade deadline set',jsonb_build_object('trade_deadline_at',p_deadline)
  from league_seasons where league_id=p_league_id;

  return p_deadline;
end
$function$;

create or replace function public.build_matchup_recap(p_matchup_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m matchups%rowtype;
  v_league uuid; v_script uuid; v_home_name text; v_away_name text; v_winner_name text; v_loser_name text;
  v_winner uuid; v_loser uuid; v_margin numeric; v_top_name text; v_top_points numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into m from matchups where id=p_matchup_id;
  if m.id is null then raise exception 'Matchup not found'; end if;
  if not m.is_final then raise exception 'Recap requires a final matchup'; end if;
  select league_id into v_league from league_seasons where id=m.league_season_id;
  if not is_league_member(v_league) then raise exception 'League access required'; end if;
  v_winner:=m.winner_season_franchise_id;
  if v_winner is null then v_loser:=null;
  elsif v_winner=m.home_season_franchise_id then v_loser:=m.away_season_franchise_id;
  else v_loser:=m.home_season_franchise_id; end if;
  select f.name into v_home_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=m.home_season_franchise_id;
  select f.name into v_away_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=m.away_season_franchise_id;
  if v_winner is not null then
    select f.name into v_winner_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=v_winner;
    select f.name into v_loser_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=v_loser;
  end if;
  v_margin:=abs(m.home_points-m.away_points);
  select coalesce(a.display_name,rt.display_name||' D/ST'), coalesce(fps.points,fts.points) into v_top_name,v_top_points
  from lineups l
  left join athletes a on a.id=l.athlete_id
  left join real_teams rt on rt.id=l.real_team_id
  left join fantasy_player_scores fps on fps.league_season_id=m.league_season_id and fps.week=m.week and fps.athlete_id=l.athlete_id
  left join fantasy_team_scores fts on fts.league_season_id=m.league_season_id and fts.week=m.week and fts.real_team_id=l.real_team_id
  where l.week=m.week and l.season_franchise_id in (m.home_season_franchise_id,m.away_season_franchise_id) and l.slot<>'BENCH'
  order by coalesce(fps.points,fts.points,0) desc nulls last limit 1;
  insert into recap_scripts(matchup_id,league_season_id,winner_season_franchise_id,loser_season_franchise_id,title,summary,updated_at)
  values(m.id,m.league_season_id,v_winner,v_loser,
    case when v_winner is null then 'Dead Heat: '||v_home_name||' vs '||v_away_name else v_winner_name||' Takes Week '||m.week end,
    case when v_winner is null then v_home_name||' and '||v_away_name||' finished level at '||m.home_points||'.' else v_winner_name||' defeated '||v_loser_name||' by '||v_margin||' points.' end,
    now())
  on conflict(matchup_id) do update set winner_season_franchise_id=excluded.winner_season_franchise_id,loser_season_franchise_id=excluded.loser_season_franchise_id,title=excluded.title,summary=excluded.summary,updated_at=now()
  returning id into v_script;
  delete from recap_scenes where recap_script_id=v_script;
  insert into recap_scenes(recap_script_id,scene_index,scene_kind,duration_ms,payload) values
  (v_script,1,'stadium_open',4500,jsonb_build_object('week',m.week,'home',v_home_name,'away',v_away_name,'event_type',m.event_type)),
  (v_script,2,'score_reveal',5000,jsonb_build_object('home',v_home_name,'away',v_away_name,'home_points',m.home_points,'away_points',m.away_points)),
  (v_script,3,'arcade_star',6500,jsonb_build_object('name',coalesce(v_top_name,'Top Performer'),'points',coalesce(v_top_points,0),'effect','plasma_burst')),
  (v_script,4,'winner_moment',6500,jsonb_build_object('winner',coalesce(v_winner_name,'TIE'),'loser',v_loser_name,'margin',v_margin,'effect',case when v_margin>=25 then 'meteor_mode' when v_margin>=10 then 'laser_storm' else 'last_second_portal' end)),
  (v_script,5,'final_card',4500,jsonb_build_object('title',case when v_winner is null then 'TIE GAME' else v_winner_name||' WINS' end,'home_points',m.home_points,'away_points',m.away_points));
  insert into recap_renders(recap_script_id,aspect_ratio,status) values(v_script,'16:9','pending'),(v_script,'9:16','pending') on conflict(recap_script_id,aspect_ratio) do nothing;
  return v_script;
end
$function$;

-- Remove anonymous/public execution from user-facing trade and recap RPCs.
revoke execute on function public.build_matchup_recap(uuid) from public, anon;
grant execute on function public.build_matchup_recap(uuid) to authenticated;
revoke execute on function public.create_trade_proposal(uuid,uuid,uuid[],uuid[],uuid[],uuid[]) from public, anon;
grant execute on function public.create_trade_proposal(uuid,uuid,uuid[],uuid[],uuid[],uuid[]) to authenticated;
revoke execute on function public.resolve_trade(uuid,text) from public, anon;
grant execute on function public.resolve_trade(uuid,text) to authenticated;
revoke execute on function public.set_trade_deadline(uuid,timestamptz) from public, anon;
grant execute on function public.set_trade_deadline(uuid,timestamptz) to authenticated;

-- These two are internal mutation helpers. They should not be callable directly by end users.
revoke execute on function public.award_matchup_achievements(uuid) from public, anon, authenticated;
revoke execute on function public.sync_franchise_stadium_features(uuid) from public, anon, authenticated;
grant execute on function public.award_matchup_achievements(uuid) to service_role;
grant execute on function public.sync_franchise_stadium_features(uuid) to service_role;
