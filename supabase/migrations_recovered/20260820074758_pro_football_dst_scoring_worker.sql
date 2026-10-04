-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820074758, name pro_football_dst_scoring_worker. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.calculate_pro_football_dst_scores(p_league_season_id uuid, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_count int;
begin
  if not exists (
    select 1 from league_seasons ls
    join competition_seasons cs on cs.id=ls.competition_season_id
    join competitions c on c.id=cs.competition_id
    where ls.id=p_league_season_id and c.code='pro_football'
  ) then raise exception 'Pro Football league season not found'; end if;

  insert into fantasy_team_scores(league_season_id,real_team_id,game_id,week,points,breakdown,calculated_at)
  select p_league_season_id,
         s.real_team_id,
         s.game_id,
         p_week,
         round(
           coalesce((s.raw_stats->>'def_sacks')::numeric,0)
           + coalesce((s.raw_stats->>'def_interceptions')::numeric,0)*2
           + coalesce((s.raw_stats->>'fumble_recovery_opp')::numeric,0)*2
           + (coalesce((s.raw_stats->>'def_tds')::numeric,0)+coalesce((s.raw_stats->>'fumble_recovery_tds')::numeric,0)+coalesce((s.raw_stats->>'special_teams_tds')::numeric,0))*6
           + coalesce((s.raw_stats->>'def_safeties')::numeric,0)*2
           + (coalesce((s.raw_stats->>'def_punt_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_pat_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_fg_blocks')::numeric,0))*2
           + case
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end)=0 then 10
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 1 and 6 then 7
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 7 and 13 then 4
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 14 and 20 then 1
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 21 and 27 then 0
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 28 and 34 then -1
               else -4
             end,2),
         jsonb_build_object(
           'sacks',coalesce((s.raw_stats->>'def_sacks')::numeric,0),
           'interceptions',coalesce((s.raw_stats->>'def_interceptions')::numeric,0)*2,
           'fumble_recoveries',coalesce((s.raw_stats->>'fumble_recovery_opp')::numeric,0)*2,
           'touchdowns',(coalesce((s.raw_stats->>'def_tds')::numeric,0)+coalesce((s.raw_stats->>'fumble_recovery_tds')::numeric,0)+coalesce((s.raw_stats->>'special_teams_tds')::numeric,0))*6,
           'safeties',coalesce((s.raw_stats->>'def_safeties')::numeric,0)*2,
           'blocked_kicks',(coalesce((s.raw_stats->>'def_punt_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_pat_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_fg_blocks')::numeric,0))*2,
           'points_allowed',(case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end)
         ), now()
  from real_team_game_stats s
  join real_games g on g.id=s.game_id
  join league_seasons ls on ls.id=p_league_season_id and ls.competition_season_id=g.competition_season_id
  where g.week=p_week
  on conflict (league_season_id,real_team_id,game_id)
  do update set points=excluded.points,breakdown=excluded.breakdown,calculated_at=excluded.calculated_at;

  get diagnostics v_count=row_count;
  return jsonb_build_object('status','ok','week',p_week,'scored_rows',v_count);
end $$;

revoke all on function public.calculate_pro_football_dst_scores(uuid,integer) from public,anon;
grant execute on function public.calculate_pro_football_dst_scores(uuid,integer) to authenticated,service_role;

create or replace function public.calculate_pro_football_week_scores(p_league_season_id uuid,p_week integer)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare p jsonb; d jsonb;
begin
  p:=public.calculate_pro_football_player_scores(p_league_season_id,p_week);
  d:=public.calculate_pro_football_dst_scores(p_league_season_id,p_week);
  return jsonb_build_object('status','ok','player_scores',p,'dst_scores',d);
end $$;
revoke all on function public.calculate_pro_football_week_scores(uuid,integer) from public,anon;
grant execute on function public.calculate_pro_football_week_scores(uuid,integer) to authenticated,service_role;
