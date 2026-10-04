-- Production definitions of the season functions, read with
-- pg_get_functiondef from project njjiqdqhmcbxblwhfade on 2026-10-03.
--
-- None of these is defined by a migration in this repository. They are kept
-- here, unmodified, only so supabase/tests/second_half_rehearsal.sql can run
-- the real bodies. Each body was checked against production by comparing an
-- md5 of its whitespace-stripped source. This file is NOT a migration and must
-- not be applied anywhere but a throwaway test database.

CREATE OR REPLACE FUNCTION public.award_matchup_achievements(p_matchup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_inserted int:=0;
begin
  insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload)
  select sf.franchise_id,m.league_season_id,a.id,m.week,
         jsonb_build_object(
           'winner_seed',case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'home_seed')::int else (m.context->>'away_seed')::int end,
           'defeated_seed',case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'away_seed')::int else (m.context->>'home_seed')::int end,
           'matchup_id',m.id)
  from matchups m
  join season_franchises sf on sf.id=m.winner_season_franchise_id
  join achievements a on a.code='CHAOS_GIANT_KILLER'
  where m.id=p_matchup_id
    and m.is_final
    and m.event_type='chaos'
    and m.winner_season_franchise_id is not null
    and nullif(m.context->>'home_seed','') is not null
    and nullif(m.context->>'away_seed','') is not null
    and (case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'home_seed')::int else (m.context->>'away_seed')::int end)
        > (case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'away_seed')::int else (m.context->>'home_seed')::int end)
    and not exists(
      select 1 from franchise_achievements fa
      where fa.franchise_id=sf.franchise_id and fa.league_season_id=m.league_season_id and fa.achievement_id=a.id and fa.week=m.week
    );
  get diagnostics v_inserted=row_count;
  return jsonb_build_object('status','ok','awards',v_inserted);
end $function$;

CREATE OR REPLACE FUNCTION public.recompute_matchup(p_matchup_id uuid, p_finalize boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m matchups%rowtype; v_home numeric:=0; v_away numeric:=0; v_unfinished int:=0; v_winner uuid; v_loser uuid; v_league uuid;
begin
  select * into v_m from matchups where id=p_matchup_id for update;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  select league_id into v_league from league_seasons where id=v_m.league_season_id;
  if auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid()) then raise exception 'League access required'; end if;
  if p_finalize and auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid() and role='commissioner') then raise exception 'Commissioner access required to finalize matchup'; end if;

  select coalesce(sum(x.points),0) into v_home from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  select coalesce(sum(x.points),0) into v_away from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  update matchups set home_points=v_home,away_points=v_away where id=v_m.id;

  if p_finalize and not v_m.is_final then
    select count(*) into v_unfinished from real_games rg where rg.competition_season_id=(select competition_season_id from league_seasons where id=v_m.league_season_id) and rg.week=v_m.week and rg.state<>'final';
    if v_unfinished>0 then raise exception 'Cannot finalize while real games are unfinished'; end if;
    if v_home>v_away then v_winner:=v_m.home_season_franchise_id; v_loser:=v_m.away_season_franchise_id;
    elsif v_away>v_home then v_winner:=v_m.away_season_franchise_id; v_loser:=v_m.home_season_franchise_id;
    else v_winner:=null; end if;
    update matchups set home_points=v_home,away_points=v_away,winner_season_franchise_id=v_winner,is_final=true where id=v_m.id;
    if v_winner is null then
      update standings set ties=ties+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=0 where league_season_id=v_m.league_season_id and season_franchise_id in (v_m.home_season_franchise_id,v_m.away_season_franchise_id);
    else
      update standings set wins=wins+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak>=0 then streak+1 else 1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_winner;
      update standings set losses=losses+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak<=0 then streak-1 else -1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_loser;
    end if;
    perform award_matchup_achievements(v_m.id);
    insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'matchup_final','Matchup final',jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner));
  elsif v_m.is_final then v_winner:=v_m.winner_season_franchise_id; end if;
  return jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'is_final',p_finalize or v_m.is_final,'winner_season_franchise_id',coalesce(v_winner,v_m.winner_season_franchise_id));
end $function$;

CREATE OR REPLACE FUNCTION public.generate_circuit_schedule(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_ls uuid;
  teams uuid[];
  rotated uuid[];
  n int;
  wk int;
  i int;
  home_id uuid;
  away_id uuid;
  tmp uuid[];
  inserted_count int:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  select array_agg(id order by coalesce(draft_position,999),id) into teams from season_franchises where league_season_id=v_ls;
  n:=coalesce(array_length(teams,1),0);
  if n<>10 then raise exception 'Circuit schedule requires 10 franchises'; end if;
  if exists(select 1 from matchups where league_season_id=v_ls and week between 1 and 9) then return jsonb_build_object('status','exists','weeks',9); end if;
  rotated:=teams;
  for wk in 1..9 loop
    for i in 1..5 loop
      if mod(wk+i,2)=0 then home_id:=rotated[i]; away_id:=rotated[11-i]; else home_id:=rotated[11-i]; away_id:=rotated[i]; end if;
      insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type)
      values(v_ls,wk,home_id,away_id,'circuit');
      inserted_count:=inserted_count+1;
    end loop;
    tmp:=array[rotated[1],rotated[10]] || rotated[2:9];
    rotated:=tmp;
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_ls,v_user,'circuit_schedule_created','Weeks 1–9 Circuit schedule is set',jsonb_build_object('matchups',inserted_count));
  return jsonb_build_object('status','created','weeks',9,'matchups',inserted_count);
end $function$;

CREATE OR REPLACE FUNCTION public.generate_rivalry_week(p_league_id uuid, p_week integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; rec record; used uuid[]:='{}'; a_sf uuid; b_sf uuid; inserted int:=0;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;

 -- First use commissioner-designated rivalries.
 for rec in select * from rivalries where league_id=p_league_id and designated order by rivalry_score desc,created_at loop
   select id into a_sf from season_franchises where league_season_id=v_ls and franchise_id=rec.franchise_a_id;
   select id into b_sf from season_franchises where league_season_id=v_ls and franchise_id=rec.franchise_b_id;
   if a_sf is not null and b_sf is not null and not(a_sf=any(used)) and not(b_sf=any(used)) then
     insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,a_sf,b_sf,'rivalry');
     used:=array_append(array_append(used,a_sf),b_sf); inserted:=inserted+1;
   end if;
 end loop;

 -- Fill remaining pairs using closest Circuit games first, then deterministic standings IDs.
 for rec in
   select m.home_season_franchise_id a,m.away_season_franchise_id b,abs(m.home_points-m.away_points) margin
   from matchups m where m.league_season_id=v_ls and m.week between 1 and 9
   order by case when m.is_final then 0 else 1 end,abs(m.home_points-m.away_points),m.week desc
 loop
   if inserted>=5 then exit; end if;
   if not(rec.a=any(used)) and not(rec.b=any(used)) then
     insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,rec.a,rec.b,'rivalry');
     used:=array_append(array_append(used,rec.a),rec.b); inserted:=inserted+1;
   end if;
 end loop;
 if inserted<5 then
   for rec in select id from season_franchises where league_season_id=v_ls and not(id=any(used)) order by id loop
     if a_sf is null or a_sf=any(used) then a_sf:=rec.id; else b_sf:=rec.id; insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,a_sf,b_sf,'rivalry'); used:=array_append(array_append(used,a_sf),b_sf); inserted:=inserted+1; a_sf:=null; b_sf:=null; end if;
   end loop;
 end if;
 return jsonb_build_object('status','created','week',p_week,'matchups',inserted);
end $function$;

CREATE OR REPLACE FUNCTION public.generate_revenge_week(p_league_id uuid, p_week integer DEFAULT 11)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; rec record; used uuid[]:='{}'; inserted int:=0;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
 -- Prioritize completed losses that were closest, then rivalry losses.
 for rec in
   select case when winner_season_franchise_id=home_season_franchise_id then away_season_franchise_id else home_season_franchise_id end loser,
          winner_season_franchise_id winner, abs(home_points-away_points) margin, week
   from matchups where league_season_id=v_ls and week between 1 and 10 and is_final and winner_season_franchise_id is not null
   order by abs(home_points-away_points),week desc
 loop
   if inserted>=5 then exit; end if;
   if not(rec.loser=any(used)) and not(rec.winner=any(used)) then
     insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,rec.loser,rec.winner,'revenge');
     used:=array_append(array_append(used,rec.loser),rec.winner); inserted:=inserted+1;
   end if;
 end loop;
 -- If not all teams have a completed loss, pair remaining teams by current standings order.
 for rec in select s.season_franchise_id from standings s where s.league_season_id=v_ls and not(s.season_franchise_id=any(used)) order by s.wins desc,s.points_for desc loop
   if inserted>=5 then exit; end if;
   if array_length(used,1) is null or not(rec.season_franchise_id=any(used)) then
     if (select count(*) from season_franchises sf where sf.league_season_id=v_ls and not(sf.id=any(used)))>=2 then
       if not exists(select 1 from matchups where league_season_id=v_ls and week=p_week and (home_season_franchise_id=rec.season_franchise_id or away_season_franchise_id=rec.season_franchise_id)) then
         -- pick next unmatched opponent
         insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type)
         select v_ls,p_week,rec.season_franchise_id,sf.id,'revenge' from season_franchises sf where sf.league_season_id=v_ls and sf.id<>rec.season_franchise_id and not(sf.id=any(used)) order by sf.id limit 1;
         if found then used:=array_append(used,rec.season_franchise_id); select away_season_franchise_id into rec.winner from matchups where league_season_id=v_ls and week=p_week and home_season_franchise_id=rec.season_franchise_id; used:=array_append(used,rec.winner); inserted:=inserted+1; end if;
       end if;
     end if;
   end if;
 end loop;
 return jsonb_build_object('status','created','week',p_week,'matchups',inserted);
end $function$;

CREATE OR REPLACE FUNCTION public.generate_position_week(p_league_id uuid, p_week integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; i int;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
 select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
 if array_length(ranked,1)<>10 then raise exception 'Position Week requires 10 franchises'; end if;
 for i in 1..5 loop insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,ranked[(i*2)-1],ranked[i*2],'position'); end loop;
 return jsonb_build_object('status','created','week',p_week,'matchups',5);
end $function$;

CREATE OR REPLACE FUNCTION public.generate_chaos_week(p_league_id uuid, p_week integer DEFAULT 13)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; i int; n int;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
  select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
  n:=coalesce(array_length(ranked,1),0); if n<>10 then raise exception 'Chaos Week requires 10 franchises'; end if;
  for i in 1..5 loop
    insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context)
    values(v_ls,p_week,ranked[i],ranked[11-i],'chaos',jsonb_build_object('home_seed',i,'away_seed',11-i,'format','standings_inversion'));
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'chaos_week_created','Chaos Week is set',jsonb_build_object('week',p_week,'format','1v10 2v9 3v8 4v7 5v6'));
  return jsonb_build_object('status','created','week',p_week,'matchups',5);
end $function$;

CREATE OR REPLACE FUNCTION public.generate_judgment_week(p_league_id uuid, p_week integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; pairs int[][]:=array[[1,4],[2,3],[5,6],[7,8],[9,10]]; i int;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
  select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
  if coalesce(array_length(ranked,1),0)<>10 then raise exception 'Judgment Week requires 10 franchises'; end if;
  for i in 1..5 loop
    insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context)
    values(v_ls,p_week,ranked[pairs[i][1]],ranked[pairs[i][2]],'judgment',jsonb_build_object('home_seed',pairs[i][1],'away_seed',pairs[i][2],'format','playoff_consequence'));
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'judgment_week_created','Judgment Week is set',jsonb_build_object('week',p_week,'format','1v4 2v3 5v6 7v8 9v10'));
  return jsonb_build_object('status','created','week',p_week,'matchups',5);
end $function$;

CREATE OR REPLACE FUNCTION public.initialize_postseason(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; i int;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from postseason_seeds where league_season_id=v_ls) then return jsonb_build_object('status','exists','league_season_id',v_ls); end if;
  if exists(select 1 from matchups where league_season_id=v_ls and week=14 and not is_final) then raise exception 'Judgment Week must be final before postseason seeding'; end if;
  select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
  if coalesce(array_length(ranked,1),0)<>10 then raise exception 'Postseason requires 10 franchises'; end if;
  for i in 1..10 loop insert into postseason_seeds(league_season_id,season_franchise_id,seed,bracket) values(v_ls,ranked[i],i,case when i<=6 then 'championship' else 'redemption' end); end loop;
  insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context) values
    (v_ls,15,ranked[3],ranked[6],'playoff_qf',jsonb_build_object('seeds',jsonb_build_array(3,6))),
    (v_ls,15,ranked[4],ranked[5],'playoff_qf',jsonb_build_object('seeds',jsonb_build_array(4,5))),
    (v_ls,15,ranked[7],ranked[10],'redemption_sf',jsonb_build_object('seeds',jsonb_build_array(7,10))),
    (v_ls,15,ranked[8],ranked[9],'redemption_sf',jsonb_build_object('seeds',jsonb_build_array(8,9)));
  update league_seasons set status='postseason' where id=v_ls;
  return jsonb_build_object('status','created','league_season_id',v_ls,'championship_seeds',6,'redemption_seeds',4,'week15_matchups',4);
end $function$;

CREATE OR REPLACE FUNCTION public.generate_postseason_week16(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; seed1 uuid; seed2 uuid; qfw uuid[]; qfseeds int[]; low_w uuid; high_w uuid;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=16 and event_type='playoff_sf') then return jsonb_build_object('status','exists','week',16); end if;
  if (select count(*) from matchups where league_season_id=v_ls and week=15 and event_type='playoff_qf' and is_final)<>2 then raise exception 'Both Week 15 championship quarterfinals must be final'; end if;
  select season_franchise_id into seed1 from postseason_seeds where league_season_id=v_ls and seed=1;
  select season_franchise_id into seed2 from postseason_seeds where league_season_id=v_ls and seed=2;
  select array_agg(m.winner_season_franchise_id order by ps.seed desc), array_agg(ps.seed order by ps.seed desc) into qfw,qfseeds
  from matchups m join postseason_seeds ps on ps.league_season_id=v_ls and ps.season_franchise_id=m.winner_season_franchise_id where m.league_season_id=v_ls and m.week=15 and m.event_type='playoff_qf';
  low_w:=qfw[1]; high_w:=qfw[2];
  insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context) values
    (v_ls,16,seed1,low_w,'playoff_sf',jsonb_build_object('seed1',1,'opponent_seed',qfseeds[1])),
    (v_ls,16,seed2,high_w,'playoff_sf',jsonb_build_object('seed1',2,'opponent_seed',qfseeds[2]));
  return jsonb_build_object('status','created','week',16,'matchups',2,'redemption_status','rest_week');
end $function$;

CREATE OR REPLACE FUNCTION public.generate_postseason_week17(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; sfw uuid[]; redw uuid[];
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=17 and event_type in ('championship','redemption_final')) then return jsonb_build_object('status','exists','week',17); end if;
  if (select count(*) from matchups where league_season_id=v_ls and week=16 and event_type='playoff_sf' and is_final)<>2 then raise exception 'Both Week 16 championship semifinals must be final'; end if;
  if (select count(*) from matchups where league_season_id=v_ls and week=15 and event_type='redemption_sf' and is_final)<>2 then raise exception 'Both Redemption semifinals must be final'; end if;
  select array_agg(winner_season_franchise_id order by id) into sfw from matchups where league_season_id=v_ls and week=16 and event_type='playoff_sf';
  select array_agg(winner_season_franchise_id order by id) into redw from matchups where league_season_id=v_ls and week=15 and event_type='redemption_sf';
  insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values
    (v_ls,17,sfw[1],sfw[2],'championship'),(v_ls,17,redw[1],redw[2],'redemption_final');
  return jsonb_build_object('status','created','week',17,'matchups',2);
end $function$;

CREATE OR REPLACE FUNCTION public.close_league_season(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; v_status text; champ matchups%rowtype; red matchups%rowtype; champ_franchise uuid; red_franchise uuid; ach uuid;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id,ls.status into v_ls,v_status from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if v_status='complete' and exists(select 1 from championships where league_season_id=v_ls and bracket='championship') then
    return jsonb_build_object('status','complete','league_season_id',v_ls,'already_closed',true,
      'champion',(select winner_season_franchise_id from championships where league_season_id=v_ls and bracket='championship'),
      'redemption_champion',(select winner_season_franchise_id from championships where league_season_id=v_ls and bracket='redemption'));
  end if;
  select * into champ from matchups where league_season_id=v_ls and week=17 and event_type='championship' and is_final limit 1;
  select * into red from matchups where league_season_id=v_ls and week=17 and event_type='redemption_final' and is_final limit 1;
  if champ.id is null or champ.winner_season_franchise_id is null then raise exception 'Championship final must be complete'; end if;
  if red.id is null or red.winner_season_franchise_id is null then raise exception 'Redemption final must be complete'; end if;
  insert into championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id)
  values(v_ls,'championship',champ.winner_season_franchise_id,case when champ.winner_season_franchise_id=champ.home_season_franchise_id then champ.away_season_franchise_id else champ.home_season_franchise_id end,champ.id)
  on conflict (league_season_id,bracket) do nothing;
  insert into championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id)
  values(v_ls,'redemption',red.winner_season_franchise_id,case when red.winner_season_franchise_id=red.home_season_franchise_id then red.away_season_franchise_id else red.home_season_franchise_id end,red.id)
  on conflict (league_season_id,bracket) do nothing;
  select franchise_id into champ_franchise from season_franchises where id=champ.winner_season_franchise_id;
  select franchise_id into red_franchise from season_franchises where id=red.winner_season_franchise_id;
  select id into ach from achievements where code='LEAGUE_CHAMPION';
  if ach is not null and not exists(select 1 from franchise_achievements where franchise_id=champ_franchise and league_season_id=v_ls and achievement_id=ach) then insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values(champ_franchise,v_ls,ach,17,jsonb_build_object('bracket','championship','matchup_id',champ.id)); end if;
  select id into ach from achievements where code='REDEMPTION_CHAMPION';
  if ach is not null and not exists(select 1 from franchise_achievements where franchise_id=red_franchise and league_season_id=v_ls and achievement_id=ach) then insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values(red_franchise,v_ls,ach,17,jsonb_build_object('bracket','redemption','matchup_id',red.id,'next_season_reward','first_choice_snake_draft_slot')); end if;
  update league_seasons set status='complete' where id=v_ls;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  select p_league_id,v_ls,v_user,'season_complete','Season complete',jsonb_build_object('champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id)
  where not exists(select 1 from league_feed_events where league_id=p_league_id and season_id=v_ls and event_type='season_complete');
  return jsonb_build_object('status','complete','league_season_id',v_ls,'already_closed',false,'champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id);
end $function$;
