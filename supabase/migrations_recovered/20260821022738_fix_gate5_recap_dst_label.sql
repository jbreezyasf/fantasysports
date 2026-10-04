-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260821022738, name fix_gate5_recap_dst_label. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function build_matchup_recap(p_matchup_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  m matchups%rowtype;
  v_league uuid; v_script uuid; v_home_name text; v_away_name text; v_winner_name text; v_loser_name text;
  v_winner uuid; v_loser uuid; v_margin numeric; v_top_name text; v_top_points numeric;
begin
  select * into m from matchups where id=p_matchup_id;
  if m.id is null then raise exception 'Matchup not found'; end if;
  if not m.is_final then raise exception 'Recap requires a final matchup'; end if;
  select league_id into v_league from league_seasons where id=m.league_season_id;
  if auth.uid() is not null and not is_league_member(v_league) then raise exception 'League access required'; end if;
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
end $$;
