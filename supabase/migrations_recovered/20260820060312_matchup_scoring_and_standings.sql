-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820060312, name matchup_scoring_and_standings. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.recompute_matchup(p_matchup_id uuid, p_finalize boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_m matchups%rowtype;
  v_home numeric:=0;
  v_away numeric:=0;
  v_unfinished int:=0;
  v_winner uuid;
  v_loser uuid;
  v_league uuid;
begin
  select * into v_m from matchups where id=p_matchup_id for update;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  select league_id into v_league from league_seasons where id=v_m.league_season_id;
  if auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid()) then raise exception 'League access required'; end if;

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
    insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'matchup_final','Matchup final',jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner));
  end if;
  return jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'is_final',p_finalize or v_m.is_final,'winner_season_franchise_id',v_winner);
end $$;
revoke all on function public.recompute_matchup(uuid,boolean) from public,anon;
grant execute on function public.recompute_matchup(uuid,boolean) to authenticated;

alter table matchups enable row level security;
alter table standings enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='matchups' and policyname='league_members_read_matchups') then create policy league_members_read_matchups on matchups for select to authenticated using (exists(select 1 from league_seasons ls join league_members lm on lm.league_id=ls.league_id where ls.id=matchups.league_season_id and lm.user_id=auth.uid())); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='standings' and policyname='league_members_read_standings') then create policy league_members_read_standings on standings for select to authenticated using (exists(select 1 from league_seasons ls join league_members lm on lm.league_id=ls.league_id where ls.id=standings.league_season_id and lm.user_id=auth.uid())); end if;
end $$;
