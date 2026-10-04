-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820213332, name gate3_deterministic_matchup_achievements. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.award_matchup_achievements(p_matchup_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $$
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
end $$;

create or replace function public.recompute_matchup(p_matchup_id uuid, p_finalize boolean default false)
returns jsonb language plpgsql security definer set search_path='public' as $$
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
end $$;
