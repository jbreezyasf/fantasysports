-- Rebuildable deterministic history fixture for Big Exec QA.
create table if not exists public.qa_fixture_leagues(fixture_key text primary key,league_id uuid not null unique references public.fantasy_leagues(id) on delete cascade,created_at timestamptz not null default now());
create table if not exists public.qa_fixture_users(fixture_key text not null,user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
revoke all on public.qa_fixture_leagues,public.qa_fixture_users from public,anon,authenticated;
grant all on public.qa_fixture_leagues,public.qa_fixture_users to postgres,service_role;

create or replace function public.rebuild_five_season_history_lab(p_owner_user_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $function$
declare
  k constant text:='big_exec_five_season_history_v1'; old_league uuid; comp uuid; scoring uuid; league uuid; ls uuid; current_ls uuid; cs uuid;
  u uuid; synthetic uuid[]:='{}'; f uuid[]:='{}'; sf uuid[]; rank_sf uuid[]; rank_idx int[]; leaders int[]:=array[1,2,3,1,4]; wins int[]:=array[11,10,9,8,7,6,6,5,4,4];
  names text[]:=array['Ironclad Syndicate','Neon Kings','Blacktop Empire','Gold Standard','Midnight Boardroom','Apex Authority','Velvet Hammers','Crown District','Fourth Quarter','Legacy House'];
  abbr text[]:=array['IRON','NEON','BLKT','GOLD','MIDN','APEX','VLVT','CRWN','4QTR','LGCY'];
  pri text[]:=array['#D9B43B','#9B7BFF','#E76F51','#F2C94C','#4169E1','#00A6A6','#B76E79','#E0B94E','#FF7A00','#9A7B4F'];
  sec text[]:=array['#08090A','#0B0B0C','#101114','#121212','#080A12','#091313','#160D10','#0B0B0C','#111111','#F5F1E8'];
  y int; yr int; i int; a int; b int; leader int; hp numeric; ap numeric; win_sf uuid; lose_sf uuid; mid uuid; final_id uuid; red_id uuid; ach uuid; script_id uuid;
begin
  if not exists(select 1 from auth.users where id=p_owner_user_id) then raise exception 'Owner auth user not found'; end if;
  select league_id into old_league from public.qa_fixture_leagues where fixture_key=k;
  if old_league is not null then delete from public.fantasy_leagues where id=old_league; end if;
  for u in select user_id from public.qa_fixture_users where fixture_key=k loop delete from auth.users where id=u; end loop;
  delete from public.qa_fixture_users where fixture_key=k; delete from public.qa_fixture_leagues where fixture_key=k;

  select id into comp from public.competitions where code='pro_football';
  select id into scoring from public.scoring_profiles where sport='football' and is_system_default limit 1;
  if comp is null or scoring is null then raise exception 'Pro Football foundation missing'; end if;
  for yr in 2021..2026 loop insert into public.competition_seasons(competition_id,season_year) values(comp,yr) on conflict(competition_id,season_year) do nothing; end loop;

  insert into public.fantasy_leagues(name,created_by,draft_min_franchises,max_franchises) values('Big Exec Five-Year History Lab',p_owner_user_id,10,10) returning id into league;
  insert into public.qa_fixture_leagues(fixture_key,league_id) values(k,league);
  insert into public.league_members(league_id,user_id,role) values(league,p_owner_user_id,'commissioner');
  for i in 2..10 loop
    u:=gen_random_uuid();
    insert into auth.users(id,aud,role,raw_app_meta_data,raw_user_meta_data,is_sso_user,is_anonymous,created_at,updated_at)
    values(u,'authenticated','authenticated',jsonb_build_object('provider','history_lab','providers',jsonb_build_array(),'big_exec_history_lab',true),jsonb_build_object('display_name','History Manager '||i),false,false,now(),now());
    insert into public.qa_fixture_users(fixture_key,user_id) values(k,u); synthetic:=array_append(synthetic,u);
    insert into public.user_profiles(user_id,display_name) values(u,'History Manager '||i) on conflict(user_id) do update set display_name=excluded.display_name,updated_at=now();
    insert into public.league_members(league_id,user_id,role) values(league,u,'manager');
  end loop;

  for i in 1..10 loop
    insert into public.franchises(league_id,name,abbreviation,primary_color,secondary_color,established_year) values(league,names[i],abbr[i],pri[i],sec[i],2021) returning id into u;
    f:=array_append(f,u); insert into public.stadiums(franchise_id,environment_key) values(u,'neon_dome') on conflict(franchise_id) do nothing;
    insert into public.franchise_owners(franchise_id,user_id,starts_on) values(u,case when i=1 then p_owner_user_id else synthetic[i-1] end,'2021-08-01');
  end loop;
  for i in 1..5 loop insert into public.rivalries(league_id,franchise_a_id,franchise_b_id,designated,rivalry_score) values(league,f[2*i-1],f[2*i],true,100-i*7); end loop;

  for y in 1..5 loop
    yr:=2020+y; leader:=leaders[y]; select id into cs from public.competition_seasons where competition_id=comp and season_year=yr;
    insert into public.league_seasons(league_id,competition_season_id,status,roster_config,scoring_profile_id,trade_deadline_at,waiver_period_hours,is_current)
    values(league,cs,'complete','{"starters":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1},"bench":6,"ir":1}'::jsonb,scoring,make_timestamptz(yr,11,10,21,0,0,'UTC'),48,false) returning id into ls;
    sf:='{}'; rank_idx:='{}'; rank_sf:='{}';
    for i in 1..10 loop rank_idx:=array_append(rank_idx,mod(leader+i-2,10)+1); end loop;
    for i in 1..10 loop
      insert into public.season_franchises(league_season_id,franchise_id,draft_position) values(ls,f[i],mod(i+y-2,10)+1) returning id into u; sf:=array_append(sf,u);
    end loop;
    for i in 1..10 loop rank_sf:=array_append(rank_sf,sf[rank_idx[i]]); end loop;
    for i in 1..10 loop
      insert into public.standings(league_season_id,season_franchise_id,wins,losses,ties,points_for,points_against,streak)
      values(ls,rank_sf[i],wins[i],14-wins[i],0,1900-i*47+y*11,1600+i*39-y*7,case when i<=3 then 2 else -1 end);
      insert into public.postseason_seeds(league_season_id,season_franchise_id,seed,bracket) values(ls,rank_sf[i],i,case when i<=6 then 'championship' else 'redemption' end);
    end loop;

    -- Rivalry Week: five persistent rivalry pairs with alternating winners.
    for i in 1..5 loop
      a:=2*i-1; b:=2*i;
      if mod(y+i,2)=0 then hp:=124+i+y/10.0; ap:=116+i; win_sf:=sf[a]; lose_sf:=sf[b]; else hp:=112+i; ap:=126+i+y/10.0; win_sf:=sf[b]; lose_sf:=sf[a]; end if;
      insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context)
      values(ls,10,sf[a],sf[b],'rivalry',hp,ap,win_sf,true,jsonb_build_object('designated',true,'fixture','history_lab')) returning id into mid;
      select id into ach from public.achievements where code='RIVALRY_WIN'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,10,jsonb_build_object('matchup_id',mid,'opponent',lose_sf));
    end loop;

    -- Revenge Week reverses every Rivalry Week result.
    for i in 1..5 loop
      a:=2*i-1; b:=2*i;
      if mod(y+i,2)=0 then hp:=109+i; ap:=130+i; win_sf:=sf[b]; lose_sf:=sf[a]; else hp:=131+i; ap:=108+i; win_sf:=sf[a]; lose_sf:=sf[b]; end if;
      insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context)
      values(ls,11,sf[a],sf[b],'revenge',hp,ap,win_sf,true,jsonb_build_object('fixture','history_lab')) returning id into mid;
      select id into ach from public.achievements where code='REVENGE_COMPLETE'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,11,jsonb_build_object('matchup_id',mid,'opponent',lose_sf));
    end loop;

    -- Chaos Week follows final standings; #10 upsets #1, the other favorites survive.
    for i in 1..5 loop
      if i=1 then hp:=104+y; ap:=137+y; win_sf:=rank_sf[10]; else hp:=133-i+y/10.0; ap:=101+i; win_sf:=rank_sf[i]; end if;
      insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context)
      values(ls,13,rank_sf[i],rank_sf[11-i],'chaos',hp,ap,win_sf,true,jsonb_build_object('home_seed',i,'away_seed',11-i,'format','standings_inversion')) returning id into mid;
      if i=1 then
        select id into ach from public.achievements where code='CHAOS_GIANT_KILLER'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,13,jsonb_build_object('matchup_id',mid,'winner_seed',10,'defeated_seed',1));
        select id into ach from public.achievements where code='GIANT_KILLER'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,13,jsonb_build_object('matchup_id',mid,'winner_seed',10,'defeated_seed',1));
      end if;
    end loop;

    insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context)
    values(ls,17,rank_sf[1],rank_sf[3],'championship',142+y,126,rank_sf[1],true,jsonb_build_object('fixture','history_lab')) returning id into final_id;
    insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context)
    values(ls,17,rank_sf[7],rank_sf[8],'redemption_final',132+y,121,rank_sf[7],true,jsonb_build_object('fixture','history_lab')) returning id into red_id;
    insert into public.championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id,awarded_at) values
      (ls,'championship',rank_sf[1],rank_sf[3],final_id,make_timestamptz(yr,12,31,18,0,0,'UTC')),(ls,'redemption',rank_sf[7],rank_sf[8],red_id,make_timestamptz(yr,12,31,18,5,0,'UTC'));
    select id into ach from public.achievements where code='LEAGUE_CHAMPION'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,earned_at,payload) values((select franchise_id from public.season_franchises where id=rank_sf[1]),ls,ach,17,make_timestamptz(yr,12,31,18,0,0,'UTC'),jsonb_build_object('matchup_id',final_id,'season_year',yr));
    select id into ach from public.achievements where code='REDEMPTION_CHAMPION'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,earned_at,payload) values((select franchise_id from public.season_franchises where id=rank_sf[7]),ls,ach,17,make_timestamptz(yr,12,31,18,5,0,'UTC'),jsonb_build_object('matchup_id',red_id,'season_year',yr));
    if y=1 then select id into ach from public.achievements where code='FIRST_WIN'; for i in 1..10 loop insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,earned_at,payload) values(f[i],ls,ach,1,make_timestamptz(yr,9,15,12,0,0,'UTC'),jsonb_build_object('fixture',true)); end loop; end if;

    insert into public.recap_scripts(matchup_id,league_season_id,winner_season_franchise_id,loser_season_franchise_id,title,summary,created_at,updated_at)
    values(final_id,ls,rank_sf[1],rank_sf[3],yr||' Championship: '||(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[1]),'A permanent Big Exec championship memory.',make_timestamptz(yr,12,31,18,10,0,'UTC'),make_timestamptz(yr,12,31,18,10,0,'UTC')) returning id into script_id;
    insert into public.recap_scenes(recap_script_id,scene_index,scene_kind,duration_ms,payload) values
      (script_id,1,'stadium_open',4500,jsonb_build_object('week',17,'event_type','championship','home',(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[1]),'away',(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[3]))),
      (script_id,2,'score_reveal',5000,jsonb_build_object('home_points',142+y,'away_points',126)),
      (script_id,3,'winner_moment',6500,jsonb_build_object('winner',(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[1]),'margin',16+y,'effect','laser_storm')),
      (script_id,4,'final_card',4500,jsonb_build_object('title',yr||' LEAGUE CHAMPION','home_points',142+y,'away_points',126));
    insert into public.story_events(league_id,league_season_id,source_type,source_id,event_type,facts,created_at) values
      (league,ls,'season',ls,'season_complete',jsonb_build_object('season_year',yr,'champion',rank_sf[1],'redemption_champion',rank_sf[7]),make_timestamptz(yr,12,31,19,0,0,'UTC')),
      (league,ls,'matchup',final_id,'championship_memory',jsonb_build_object('season_year',yr,'winner',rank_sf[1]),make_timestamptz(yr,12,31,19,5,0,'UTC'));
  end loop;

  -- Open 2026 with the same 10 persistent franchises and all accumulated legacy.
  select id into cs from public.competition_seasons where competition_id=comp and season_year=2026;
  insert into public.league_seasons(league_id,competition_season_id,status,roster_config,scoring_profile_id,trade_deadline_at,waiver_period_hours,is_current)
  values(league,cs,'setup','{"starters":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1},"bench":6,"ir":1}'::jsonb,scoring,'2026-11-10 21:00:00+00',48,true) returning id into current_ls;
  for i in 1..10 loop insert into public.season_franchises(league_season_id,franchise_id,draft_position) values(current_ls,f[i],i) returning id into u; insert into public.standings(league_season_id,season_franchise_id) values(current_ls,u); perform public.sync_franchise_stadium_features(f[i]); end loop;
  insert into public.story_events(league_id,league_season_id,source_type,source_id,event_type,facts) values(league,current_ls,'season',current_ls,'new_season_open',jsonb_build_object('season_year',2026,'history_years',5));
  insert into public.league_feed_events(league_id,season_id,event_type,body,payload) values(league,current_ls,'new_season','2026 is open. Five seasons of receipts came with you.',jsonb_build_object('history_years',5));
  return jsonb_build_object('fixture_key',k,'league_id',league,'current_league_season_id',current_ls,'members',(select count(*) from public.league_members where league_id=league),'franchises',(select count(*) from public.franchises where league_id=league),'historical_seasons',(select count(*) from public.league_seasons where league_id=league and not is_current),'championships',(select count(*) from public.championships c join public.league_seasons l on l.id=c.league_season_id where l.league_id=league),'matchups',(select count(*) from public.matchups m join public.league_seasons l on l.id=m.league_season_id where l.league_id=league));
end $function$;
revoke all on function public.rebuild_five_season_history_lab(uuid) from public,anon,authenticated;
grant execute on function public.rebuild_five_season_history_lab(uuid) to postgres,service_role;
