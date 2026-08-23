-- Big Exec V1 rule: every touchdown is worth six points.
-- Keep the authoritative database scoring worker aligned with the system profile.

create or replace function public.calculate_pro_football_player_scores(p_league_season_id uuid, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count int;
begin
  if not exists (
    select 1 from league_seasons ls
    join competition_seasons cs on cs.id=ls.competition_season_id
    join competitions c on c.id=cs.competition_id
    where ls.id=p_league_season_id and c.code='pro_football'
  ) then raise exception 'Pro Football league season not found'; end if;

  insert into fantasy_player_scores(league_season_id,athlete_id,game_id,week,points,breakdown,calculated_at)
  select
    p_league_season_id,
    ags.athlete_id,
    ags.game_id,
    p_week,
    round((
      coalesce((ags.raw_stats->>'passing_yards')::numeric,0)/25
      + coalesce((ags.raw_stats->>'passing_tds')::numeric,0)*6
      - coalesce((ags.raw_stats->>'passing_interceptions')::numeric,0)*2
      + coalesce((ags.raw_stats->>'rushing_yards')::numeric,0)/10
      + coalesce((ags.raw_stats->>'rushing_tds')::numeric,0)*6
      + coalesce((ags.raw_stats->>'receptions')::numeric,0)*0.5
      + coalesce((ags.raw_stats->>'receiving_yards')::numeric,0)/10
      + coalesce((ags.raw_stats->>'receiving_tds')::numeric,0)*6
      + (coalesce((ags.raw_stats->>'passing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'rushing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'receiving_2pt_conversions')::numeric,0))*2
      + coalesce((ags.raw_stats->>'special_teams_tds')::numeric,0)*6
      - (coalesce((ags.raw_stats->>'rushing_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'receiving_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'sack_fumbles_lost')::numeric,0))*2
      + coalesce((ags.raw_stats->>'fg_made_0_19')::numeric,0)*3
      + coalesce((ags.raw_stats->>'fg_made_20_29')::numeric,0)*3
      + coalesce((ags.raw_stats->>'fg_made_30_39')::numeric,0)*3
      + coalesce((ags.raw_stats->>'fg_made_40_49')::numeric,0)*4
      + coalesce((ags.raw_stats->>'fg_made_50_59')::numeric,0)*5
      + coalesce((ags.raw_stats->>'fg_made_60_')::numeric,0)*6
      + coalesce((ags.raw_stats->>'pat_made')::numeric,0)
    ),2),
    jsonb_build_object(
      'passing', round(coalesce((ags.raw_stats->>'passing_yards')::numeric,0)/25 + coalesce((ags.raw_stats->>'passing_tds')::numeric,0)*6 - coalesce((ags.raw_stats->>'passing_interceptions')::numeric,0)*2,2),
      'rushing', round(coalesce((ags.raw_stats->>'rushing_yards')::numeric,0)/10 + coalesce((ags.raw_stats->>'rushing_tds')::numeric,0)*6,2),
      'receiving', round(coalesce((ags.raw_stats->>'receptions')::numeric,0)*0.5 + coalesce((ags.raw_stats->>'receiving_yards')::numeric,0)/10 + coalesce((ags.raw_stats->>'receiving_tds')::numeric,0)*6,2),
      'two_point', (coalesce((ags.raw_stats->>'passing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'rushing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'receiving_2pt_conversions')::numeric,0))*2,
      'fumbles_lost', (coalesce((ags.raw_stats->>'rushing_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'receiving_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'sack_fumbles_lost')::numeric,0))*-2,
      'special_teams_td', coalesce((ags.raw_stats->>'special_teams_tds')::numeric,0)*6,
      'kicking', coalesce((ags.raw_stats->>'fg_made_0_19')::numeric,0)*3 + coalesce((ags.raw_stats->>'fg_made_20_29')::numeric,0)*3 + coalesce((ags.raw_stats->>'fg_made_30_39')::numeric,0)*3 + coalesce((ags.raw_stats->>'fg_made_40_49')::numeric,0)*4 + coalesce((ags.raw_stats->>'fg_made_50_59')::numeric,0)*5 + coalesce((ags.raw_stats->>'fg_made_60_')::numeric,0)*6 + coalesce((ags.raw_stats->>'pat_made')::numeric,0)
    ),
    now()
  from athlete_game_stats ags
  join real_games g on g.id=ags.game_id
  join league_seasons ls on ls.id=p_league_season_id and ls.competition_season_id=g.competition_season_id
  where g.week=p_week
  on conflict (league_season_id,athlete_id,game_id)
  do update set points=excluded.points, breakdown=excluded.breakdown, calculated_at=excluded.calculated_at;

  get diagnostics v_count = row_count;
  return jsonb_build_object('status','ok','week',p_week,'scored_rows',v_count);
end
$function$;
