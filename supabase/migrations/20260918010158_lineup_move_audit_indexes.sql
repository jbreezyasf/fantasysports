create index if not exists lineup_move_audit_league_season
  on public.lineup_move_audit (league_season_id);
create index if not exists lineup_move_audit_actor
  on public.lineup_move_audit (actor_user_id);
create index if not exists lineup_move_audit_previous_athlete
  on public.lineup_move_audit (previous_athlete_id);
create index if not exists lineup_move_audit_previous_real_team
  on public.lineup_move_audit (previous_real_team_id);
create index if not exists lineup_move_audit_new_athlete
  on public.lineup_move_audit (new_athlete_id);
create index if not exists lineup_move_audit_new_real_team
  on public.lineup_move_audit (new_real_team_id);
