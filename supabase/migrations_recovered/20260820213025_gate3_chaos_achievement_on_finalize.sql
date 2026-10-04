-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820213025, name gate3_chaos_achievement_on_finalize. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.recompute_matchup(p_matchup_id uuid, p_finalize boolean default false)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare
  v_m matchups%rowtype; v_home numeric:=0; v_away numeric:=0; v_unfinished int:=0; v_winner uuid; v_loser uuid; v_league uuid;
  v_winner_seed int; v_loser_seed int; v_franchise uuid; v_ach uuid;
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
      if v_m.event_type='chaos' then
        if v_winner=v_m.home_season_franchise_id then v_winner_seed:=nullif(v_m.context->>'home_seed','')::int; v_loser_seed:=nullif(v_m.context->>'away_seed','')::int;
        else v_winner_seed:=nullif(v_m.context->>'away_seed','')::int; v_loser_seed:=nullif(v_m.context->>'home_seed','')::int; end if;
        if v_winner_seed is not null and v_loser_seed is not null and v_winner_seed>v_loser_seed then
          select franchise_id into v_franchise from season_franchises where id=v_winner;
          select id into v_ach from achievements where code='CHAOS_GIANT_KILLER';
          if v_franchise is not null and v_ach is not null and not exists(select 1 from franchise_achievements where franchise_id=v_franchise and league_season_id=v_m.league_season_id and achievement_id=v_ach and week=v_m.week) then
            insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values(v_franchise,v_m.league_season_id,v_ach,v_m.week,jsonb_build_object('winner_seed',v_winner_seed,'defeated_seed',v_loser_seed,'matchup_id',v_m.id));
          end if;
        end if;
      end if;
    end if;
    insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'matchup_final','Matchup final',jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner));
  elsif v_m.is_final then v_winner:=v_m.winner_season_franchise_id; end if;
  return jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'is_final',p_finalize or v_m.is_final,'winner_season_franchise_id',coalesce(v_winner,v_m.winner_season_franchise_id));
end $$;
