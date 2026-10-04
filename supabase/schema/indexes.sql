-- indexes.sql — Every index in schema public (including the ones that back PK/UNIQUE constraints).
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== indexes: 184 object(s) =====
-- Query:
--   select (i.tablename || '.' || i.indexname)::text as ord, i.indexdef || ';' as text
--   from pg_indexes i
--   where i.schemaname = 'public'

-- achievements.achievements_code_key
CREATE UNIQUE INDEX achievements_code_key ON public.achievements USING btree (code);

-- achievements.achievements_pkey
CREATE UNIQUE INDEX achievements_pkey ON public.achievements USING btree (id);

-- athlete_game_stats.athlete_game_stats_athlete_id_game_id_source_provider_key
CREATE UNIQUE INDEX athlete_game_stats_athlete_id_game_id_source_provider_key ON public.athlete_game_stats USING btree (athlete_id, game_id, source_provider);

-- athlete_game_stats.athlete_game_stats_athlete_idx
CREATE INDEX athlete_game_stats_athlete_idx ON public.athlete_game_stats USING btree (athlete_id);

-- athlete_game_stats.athlete_game_stats_game_idx
CREATE INDEX athlete_game_stats_game_idx ON public.athlete_game_stats USING btree (game_id);

-- athlete_game_stats.athlete_game_stats_pkey
CREATE UNIQUE INDEX athlete_game_stats_pkey ON public.athlete_game_stats USING btree (id);

-- athlete_provider_ids.athlete_provider_ids_athlete_id_provider_key
CREATE UNIQUE INDEX athlete_provider_ids_athlete_id_provider_key ON public.athlete_provider_ids USING btree (athlete_id, provider);

-- athlete_provider_ids.athlete_provider_ids_pkey
CREATE UNIQUE INDEX athlete_provider_ids_pkey ON public.athlete_provider_ids USING btree (provider, provider_athlete_id);

-- athletes.athletes_competition_team_position_idx
CREATE INDEX athletes_competition_team_position_idx ON public.athletes USING btree (competition_id, real_team_id, "position");

-- athletes.athletes_pkey
CREATE UNIQUE INDEX athletes_pkey ON public.athletes USING btree (id);

-- beta_feedback_analysis.beta_feedback_analysis_cluster_key_idx
CREATE INDEX beta_feedback_analysis_cluster_key_idx ON public.beta_feedback_analysis USING btree (cluster_key);

-- beta_feedback_analysis.beta_feedback_analysis_pkey
CREATE UNIQUE INDEX beta_feedback_analysis_pkey ON public.beta_feedback_analysis USING btree (id);

-- beta_feedback_analysis.beta_feedback_analysis_review_status_idx
CREATE INDEX beta_feedback_analysis_review_status_idx ON public.beta_feedback_analysis USING btree (review_status, severity DESC, churn_risk_score DESC, analyzed_at DESC);

-- beta_feedback_analysis.beta_feedback_analysis_submission_id_key
CREATE UNIQUE INDEX beta_feedback_analysis_submission_id_key ON public.beta_feedback_analysis USING btree (submission_id);

-- beta_feedback_analysis.beta_feedback_analysis_support_idx
CREATE INDEX beta_feedback_analysis_support_idx ON public.beta_feedback_analysis USING btree (support_disposition, severity DESC, analyzed_at DESC);

-- beta_feedback_review_events.beta_feedback_review_events_pkey
CREATE UNIQUE INDEX beta_feedback_review_events_pkey ON public.beta_feedback_review_events USING btree (id);

-- beta_feedback_submissions.beta_feedback_submissions_pkey
CREATE UNIQUE INDEX beta_feedback_submissions_pkey ON public.beta_feedback_submissions USING btree (id);

-- championships.championships_league_season_id_bracket_key
CREATE UNIQUE INDEX championships_league_season_id_bracket_key ON public.championships USING btree (league_season_id, bracket);

-- championships.championships_pkey
CREATE UNIQUE INDEX championships_pkey ON public.championships USING btree (id);

-- competition_seasons.competition_seasons_competition_id_season_year_key
CREATE UNIQUE INDEX competition_seasons_competition_id_season_year_key ON public.competition_seasons USING btree (competition_id, season_year);

-- competition_seasons.competition_seasons_pkey
CREATE UNIQUE INDEX competition_seasons_pkey ON public.competition_seasons USING btree (id);

-- competitions.competitions_code_key
CREATE UNIQUE INDEX competitions_code_key ON public.competitions USING btree (code);

-- competitions.competitions_pkey
CREATE UNIQUE INDEX competitions_pkey ON public.competitions USING btree (id);

-- draft_corrections.draft_corrections_pkey
CREATE UNIQUE INDEX draft_corrections_pkey ON public.draft_corrections USING btree (id);

-- draft_historical_values.draft_historical_values_asset_year_source
CREATE UNIQUE INDEX draft_historical_values_asset_year_source ON public.draft_historical_values USING btree (competition_id, season_year, source, asset_type, asset_key);

-- draft_historical_values.draft_historical_values_athlete_year_source
CREATE UNIQUE INDEX draft_historical_values_athlete_year_source ON public.draft_historical_values USING btree (competition_id, season_year, source, athlete_id) WHERE (asset_type = 'athlete'::text);

-- draft_historical_values.draft_historical_values_competition_position_year
CREATE INDEX draft_historical_values_competition_position_year ON public.draft_historical_values USING btree (competition_id, "position", season_year DESC);

-- draft_historical_values.draft_historical_values_pkey
CREATE UNIQUE INDEX draft_historical_values_pkey ON public.draft_historical_values USING btree (id);

-- draft_historical_values.draft_historical_values_team_year_source
CREATE UNIQUE INDEX draft_historical_values_team_year_source ON public.draft_historical_values USING btree (competition_id, season_year, source, real_team_id) WHERE (asset_type = 'team_defense'::text);

-- draft_picks.draft_picks_draft_id_pick_number_key
CREATE UNIQUE INDEX draft_picks_draft_id_pick_number_key ON public.draft_picks USING btree (draft_id, pick_number);

-- draft_picks.draft_picks_draft_pick_idx
CREATE INDEX draft_picks_draft_pick_idx ON public.draft_picks USING btree (draft_id, pick_number);

-- draft_picks.draft_picks_pkey
CREATE UNIQUE INDEX draft_picks_pkey ON public.draft_picks USING btree (id);

-- draft_queues.draft_queues_athlete_unique
CREATE UNIQUE INDEX draft_queues_athlete_unique ON public.draft_queues USING btree (draft_id, season_franchise_id, athlete_id) WHERE (athlete_id IS NOT NULL);

-- draft_queues.draft_queues_owner_order_idx
CREATE INDEX draft_queues_owner_order_idx ON public.draft_queues USING btree (draft_id, season_franchise_id, queue_rank, created_at);

-- draft_queues.draft_queues_pkey
CREATE UNIQUE INDEX draft_queues_pkey ON public.draft_queues USING btree (id);

-- draft_queues.draft_queues_team_unique
CREATE UNIQUE INDEX draft_queues_team_unique ON public.draft_queues USING btree (draft_id, season_franchise_id, real_team_id) WHERE (real_team_id IS NOT NULL);

-- drafts.drafts_league_season_id_key
CREATE UNIQUE INDEX drafts_league_season_id_key ON public.drafts USING btree (league_season_id);

-- drafts.drafts_pkey
CREATE UNIQUE INDEX drafts_pkey ON public.drafts USING btree (id);

-- fantasy_leagues.fantasy_leagues_pkey
CREATE UNIQUE INDEX fantasy_leagues_pkey ON public.fantasy_leagues USING btree (id);

-- fantasy_player_market_values.fantasy_player_market_values_competition_id_season_year_ath_key
CREATE UNIQUE INDEX fantasy_player_market_values_competition_id_season_year_ath_key ON public.fantasy_player_market_values USING btree (competition_id, season_year, athlete_id, source, scoring_format);

-- fantasy_player_market_values.fantasy_player_market_values_draft_idx
CREATE INDEX fantasy_player_market_values_draft_idx ON public.fantasy_player_market_values USING btree (competition_id, season_year, scoring_format, overall_rank, adp);

-- fantasy_player_market_values.fantasy_player_market_values_pkey
CREATE UNIQUE INDEX fantasy_player_market_values_pkey ON public.fantasy_player_market_values USING btree (id);

-- fantasy_player_market_values.fantasy_player_market_values_waiver_idx
CREATE INDEX fantasy_player_market_values_waiver_idx ON public.fantasy_player_market_values USING btree (competition_id, season_year, projected_points DESC NULLS LAST, overall_rank);

-- fantasy_player_scores.fantasy_player_scores_league_season_id_athlete_id_game_id_key
CREATE UNIQUE INDEX fantasy_player_scores_league_season_id_athlete_id_game_id_key ON public.fantasy_player_scores USING btree (league_season_id, athlete_id, game_id);

-- fantasy_player_scores.fantasy_player_scores_pkey
CREATE UNIQUE INDEX fantasy_player_scores_pkey ON public.fantasy_player_scores USING btree (id);

-- fantasy_team_scores.fantasy_team_scores_league_season_id_real_team_id_game_id_key
CREATE UNIQUE INDEX fantasy_team_scores_league_season_id_real_team_id_game_id_key ON public.fantasy_team_scores USING btree (league_season_id, real_team_id, game_id);

-- fantasy_team_scores.fantasy_team_scores_pkey
CREATE UNIQUE INDEX fantasy_team_scores_pkey ON public.fantasy_team_scores USING btree (id);

-- feed_reactions.feed_reactions_event_id_user_id_reaction_key
CREATE UNIQUE INDEX feed_reactions_event_id_user_id_reaction_key ON public.feed_reactions USING btree (event_id, user_id, reaction);

-- feed_reactions.feed_reactions_pkey
CREATE UNIQUE INDEX feed_reactions_pkey ON public.feed_reactions USING btree (id);

-- franchise_achievements.franchise_achievements_franchise_idx
CREATE INDEX franchise_achievements_franchise_idx ON public.franchise_achievements USING btree (franchise_id, earned_at DESC);

-- franchise_achievements.franchise_achievements_pkey
CREATE UNIQUE INDEX franchise_achievements_pkey ON public.franchise_achievements USING btree (id);

-- franchise_owners.franchise_owners_pkey
CREATE UNIQUE INDEX franchise_owners_pkey ON public.franchise_owners USING btree (franchise_id, user_id, starts_on);

-- franchise_stadium_features.franchise_stadium_features_pkey
CREATE UNIQUE INDEX franchise_stadium_features_pkey ON public.franchise_stadium_features USING btree (stadium_id, stadium_feature_id);

-- franchises.franchises_league_id_name_key
CREATE UNIQUE INDEX franchises_league_id_name_key ON public.franchises USING btree (league_id, name);

-- franchises.franchises_pkey
CREATE UNIQUE INDEX franchises_pkey ON public.franchises USING btree (id);

-- generated_messages.generated_messages_matchup_idx
CREATE INDEX generated_messages_matchup_idx ON public.generated_messages USING btree (matchup_id, requested_by, tone, created_at DESC);

-- generated_messages.generated_messages_pkey
CREATE UNIQUE INDEX generated_messages_pkey ON public.generated_messages USING btree (id);

-- historical_backfill_runs.historical_backfill_runs_league_season_id_idempotency_key_key
CREATE UNIQUE INDEX historical_backfill_runs_league_season_id_idempotency_key_key ON public.historical_backfill_runs USING btree (league_season_id, idempotency_key);

-- historical_backfill_runs.historical_backfill_runs_league_status_idx
CREATE INDEX historical_backfill_runs_league_status_idx ON public.historical_backfill_runs USING btree (league_season_id, status, created_at DESC);

-- historical_backfill_runs.historical_backfill_runs_pkey
CREATE UNIQUE INDEX historical_backfill_runs_pkey ON public.historical_backfill_runs USING btree (id);

-- historical_dst_score_validation.historical_dst_score_validation_pkey
CREATE UNIQUE INDEX historical_dst_score_validation_pkey ON public.historical_dst_score_validation USING btree (real_team_id, game_id, scoring_profile_id);

-- historical_fantasy_score_validation.historical_fantasy_score_validation_pkey
CREATE UNIQUE INDEX historical_fantasy_score_validation_pkey ON public.historical_fantasy_score_validation USING btree (athlete_id, game_id, scoring_profile_id);

-- historical_lineups.historical_lineups_league_season_id_season_franchise_id_wee_key
CREATE UNIQUE INDEX historical_lineups_league_season_id_season_franchise_id_wee_key ON public.historical_lineups USING btree (league_season_id, season_franchise_id, week, source);

-- historical_lineups.historical_lineups_league_week_idx
CREATE INDEX historical_lineups_league_week_idx ON public.historical_lineups USING btree (league_season_id, week, season_franchise_id);

-- historical_lineups.historical_lineups_pkey
CREATE UNIQUE INDEX historical_lineups_pkey ON public.historical_lineups USING btree (id);

-- league_feed_events.league_feed_events_league_created_idx
CREATE INDEX league_feed_events_league_created_idx ON public.league_feed_events USING btree (league_id, created_at DESC);

-- league_feed_events.league_feed_events_pkey
CREATE UNIQUE INDEX league_feed_events_pkey ON public.league_feed_events USING btree (id);

-- league_invites.league_invites_invite_token_key
CREATE UNIQUE INDEX league_invites_invite_token_key ON public.league_invites USING btree (invite_token);

-- league_invites.league_invites_pkey
CREATE UNIQUE INDEX league_invites_pkey ON public.league_invites USING btree (id);

-- league_invites.league_invites_token_idx
CREATE INDEX league_invites_token_idx ON public.league_invites USING btree (invite_token);

-- league_members.league_members_league_id_user_id_key
CREATE UNIQUE INDEX league_members_league_id_user_id_key ON public.league_members USING btree (league_id, user_id);

-- league_members.league_members_pkey
CREATE UNIQUE INDEX league_members_pkey ON public.league_members USING btree (id);

-- league_news_stories.league_news_stories_league_id_source_type_source_key_key
CREATE UNIQUE INDEX league_news_stories_league_id_source_type_source_key_key ON public.league_news_stories USING btree (league_id, source_type, source_key);

-- league_news_stories.league_news_stories_league_published
CREATE INDEX league_news_stories_league_published ON public.league_news_stories USING btree (league_id, published_at DESC);

-- league_news_stories.league_news_stories_pkey
CREATE UNIQUE INDEX league_news_stories_pkey ON public.league_news_stories USING btree (id);

-- league_seasons.league_seasons_league_id_competition_season_id_key
CREATE UNIQUE INDEX league_seasons_league_id_competition_season_id_key ON public.league_seasons USING btree (league_id, competition_season_id);

-- league_seasons.league_seasons_one_current_per_league_idx
CREATE UNIQUE INDEX league_seasons_one_current_per_league_idx ON public.league_seasons USING btree (league_id) WHERE is_current;

-- league_seasons.league_seasons_pkey
CREATE UNIQUE INDEX league_seasons_pkey ON public.league_seasons USING btree (id);

-- lineup_move_audit.lineup_move_audit_actor
CREATE INDEX lineup_move_audit_actor ON public.lineup_move_audit USING btree (actor_user_id);

-- lineup_move_audit.lineup_move_audit_franchise_week_created
CREATE INDEX lineup_move_audit_franchise_week_created ON public.lineup_move_audit USING btree (season_franchise_id, week, created_at DESC);

-- lineup_move_audit.lineup_move_audit_league_season
CREATE INDEX lineup_move_audit_league_season ON public.lineup_move_audit USING btree (league_season_id);

-- lineup_move_audit.lineup_move_audit_new_athlete
CREATE INDEX lineup_move_audit_new_athlete ON public.lineup_move_audit USING btree (new_athlete_id);

-- lineup_move_audit.lineup_move_audit_new_real_team
CREATE INDEX lineup_move_audit_new_real_team ON public.lineup_move_audit USING btree (new_real_team_id);

-- lineup_move_audit.lineup_move_audit_pkey
CREATE UNIQUE INDEX lineup_move_audit_pkey ON public.lineup_move_audit USING btree (id);

-- lineup_move_audit.lineup_move_audit_previous_athlete
CREATE INDEX lineup_move_audit_previous_athlete ON public.lineup_move_audit USING btree (previous_athlete_id);

-- lineup_move_audit.lineup_move_audit_previous_real_team
CREATE INDEX lineup_move_audit_previous_real_team ON public.lineup_move_audit USING btree (previous_real_team_id);

-- lineups.lineups_franchise_week_idx
CREATE INDEX lineups_franchise_week_idx ON public.lineups USING btree (season_franchise_id, week);

-- lineups.lineups_pkey
CREATE UNIQUE INDEX lineups_pkey ON public.lineups USING btree (id);

-- lineups.lineups_season_franchise_id_week_athlete_id_key
CREATE UNIQUE INDEX lineups_season_franchise_id_week_athlete_id_key ON public.lineups USING btree (season_franchise_id, week, athlete_id);

-- lineups.lineups_team_week_unique
CREATE UNIQUE INDEX lineups_team_week_unique ON public.lineups USING btree (season_franchise_id, week, real_team_id) WHERE (real_team_id IS NOT NULL);

-- lineups.lineups_unique_athlete_week
CREATE UNIQUE INDEX lineups_unique_athlete_week ON public.lineups USING btree (season_franchise_id, week, athlete_id) WHERE (athlete_id IS NOT NULL);

-- lineups.lineups_unique_slot_index
CREATE UNIQUE INDEX lineups_unique_slot_index ON public.lineups USING btree (season_franchise_id, week, slot, slot_index);

-- lineups.lineups_unique_team_week
CREATE UNIQUE INDEX lineups_unique_team_week ON public.lineups USING btree (season_franchise_id, week, real_team_id) WHERE (real_team_id IS NOT NULL);

-- live_scoring_runs.live_scoring_runs_pkey
CREATE UNIQUE INDEX live_scoring_runs_pkey ON public.live_scoring_runs USING btree (id);

-- live_scoring_runs.live_scoring_runs_started_at_idx
CREATE INDEX live_scoring_runs_started_at_idx ON public.live_scoring_runs USING btree (started_at DESC);

-- matchups.matchups_league_season_id_week_away_season_franchise_id_key
CREATE UNIQUE INDEX matchups_league_season_id_week_away_season_franchise_id_key ON public.matchups USING btree (league_season_id, week, away_season_franchise_id);

-- matchups.matchups_league_season_id_week_home_season_franchise_id_key
CREATE UNIQUE INDEX matchups_league_season_id_week_home_season_franchise_id_key ON public.matchups USING btree (league_season_id, week, home_season_franchise_id);

-- matchups.matchups_league_week_idx
CREATE INDEX matchups_league_week_idx ON public.matchups USING btree (league_season_id, week);

-- matchups.matchups_pkey
CREATE UNIQUE INDEX matchups_pkey ON public.matchups USING btree (id);

-- ops_audit_events.ops_audit_events_created_idx
CREATE INDEX ops_audit_events_created_idx ON public.ops_audit_events USING btree (created_at DESC);

-- ops_audit_events.ops_audit_events_pkey
CREATE UNIQUE INDEX ops_audit_events_pkey ON public.ops_audit_events USING btree (id);

-- ops_audit_events.ops_audit_events_target_idx
CREATE INDEX ops_audit_events_target_idx ON public.ops_audit_events USING btree (target_type, target_id, created_at DESC);

-- ops_staff_roles.ops_staff_roles_pkey
CREATE UNIQUE INDEX ops_staff_roles_pkey ON public.ops_staff_roles USING btree (id);

-- ops_staff_roles.ops_staff_roles_user_active_idx
CREATE INDEX ops_staff_roles_user_active_idx ON public.ops_staff_roles USING btree (user_id, disabled_at, created_at DESC);

-- postseason_seeds.postseason_seeds_league_season_id_seed_key
CREATE UNIQUE INDEX postseason_seeds_league_season_id_seed_key ON public.postseason_seeds USING btree (league_season_id, seed);

-- postseason_seeds.postseason_seeds_pkey
CREATE UNIQUE INDEX postseason_seeds_pkey ON public.postseason_seeds USING btree (league_season_id, season_franchise_id);

-- qa_fixture_leagues.qa_fixture_leagues_league_id_key
CREATE UNIQUE INDEX qa_fixture_leagues_league_id_key ON public.qa_fixture_leagues USING btree (league_id);

-- qa_fixture_leagues.qa_fixture_leagues_pkey
CREATE UNIQUE INDEX qa_fixture_leagues_pkey ON public.qa_fixture_leagues USING btree (fixture_key);

-- qa_fixture_users.qa_fixture_users_pkey
CREATE UNIQUE INDEX qa_fixture_users_pkey ON public.qa_fixture_users USING btree (user_id);

-- real_games.real_games_pkey
CREATE UNIQUE INDEX real_games_pkey ON public.real_games USING btree (id);

-- real_games.real_games_provider_game_id_unique_idx
CREATE UNIQUE INDEX real_games_provider_game_id_unique_idx ON public.real_games USING btree (provider_game_id) WHERE (provider_game_id IS NOT NULL);

-- real_games.real_games_season_provider_uniq
CREATE UNIQUE INDEX real_games_season_provider_uniq ON public.real_games USING btree (competition_season_id, provider_game_id) WHERE (provider_game_id IS NOT NULL);

-- real_team_game_stats.real_team_game_stats_game_idx
CREATE INDEX real_team_game_stats_game_idx ON public.real_team_game_stats USING btree (game_id);

-- real_team_game_stats.real_team_game_stats_pkey
CREATE UNIQUE INDEX real_team_game_stats_pkey ON public.real_team_game_stats USING btree (id);

-- real_team_game_stats.real_team_game_stats_real_team_id_game_id_source_provider_key
CREATE UNIQUE INDEX real_team_game_stats_real_team_id_game_id_source_provider_key ON public.real_team_game_stats USING btree (real_team_id, game_id, source_provider);

-- real_teams.real_teams_competition_abbr_uniq
CREATE UNIQUE INDEX real_teams_competition_abbr_uniq ON public.real_teams USING btree (competition_id, abbreviation) WHERE (abbreviation IS NOT NULL);

-- real_teams.real_teams_pkey
CREATE UNIQUE INDEX real_teams_pkey ON public.real_teams USING btree (id);

-- recap_matchup_moments.recap_matchup_moments_matchup_id_key
CREATE UNIQUE INDEX recap_matchup_moments_matchup_id_key ON public.recap_matchup_moments USING btree (matchup_id);

-- recap_matchup_moments.recap_matchup_moments_pkey
CREATE UNIQUE INDEX recap_matchup_moments_pkey ON public.recap_matchup_moments USING btree (id);

-- recap_matchup_moments.recap_matchup_moments_week_score
CREATE INDEX recap_matchup_moments_week_score ON public.recap_matchup_moments USING btree (league_season_id, week, story_score DESC);

-- recap_renders.recap_renders_pkey
CREATE UNIQUE INDEX recap_renders_pkey ON public.recap_renders USING btree (id);

-- recap_renders.recap_renders_recap_script_id_aspect_ratio_key
CREATE UNIQUE INDEX recap_renders_recap_script_id_aspect_ratio_key ON public.recap_renders USING btree (recap_script_id, aspect_ratio);

-- recap_scenes.recap_scenes_pkey
CREATE UNIQUE INDEX recap_scenes_pkey ON public.recap_scenes USING btree (id);

-- recap_scenes.recap_scenes_recap_script_id_scene_index_key
CREATE UNIQUE INDEX recap_scenes_recap_script_id_scene_index_key ON public.recap_scenes USING btree (recap_script_id, scene_index);

-- recap_scripts.recap_scripts_matchup_id_key
CREATE UNIQUE INDEX recap_scripts_matchup_id_key ON public.recap_scripts USING btree (matchup_id);

-- recap_scripts.recap_scripts_one_league_week
CREATE UNIQUE INDEX recap_scripts_one_league_week ON public.recap_scripts USING btree (league_season_id, week) WHERE (recap_kind = 'league_week'::text);

-- recap_scripts.recap_scripts_pkey
CREATE UNIQUE INDEX recap_scripts_pkey ON public.recap_scripts USING btree (id);

-- rivalries.rivalries_pkey
CREATE UNIQUE INDEX rivalries_pkey ON public.rivalries USING btree (id);

-- rivalries.rivalries_unique_pair
CREATE UNIQUE INDEX rivalries_unique_pair ON public.rivalries USING btree (league_id, LEAST(franchise_a_id, franchise_b_id), GREATEST(franchise_a_id, franchise_b_id));

-- roster_entries.roster_entries_active_idx
CREATE INDEX roster_entries_active_idx ON public.roster_entries USING btree (season_franchise_id) WHERE (dropped_at IS NULL);

-- roster_entries.roster_entries_pkey
CREATE UNIQUE INDEX roster_entries_pkey ON public.roster_entries USING btree (id);

-- roster_entries.roster_entries_season_franchise_id_athlete_id_added_at_key
CREATE UNIQUE INDEX roster_entries_season_franchise_id_athlete_id_added_at_key ON public.roster_entries USING btree (season_franchise_id, athlete_id, added_at);

-- roster_entries.roster_entries_team_unique
CREATE UNIQUE INDEX roster_entries_team_unique ON public.roster_entries USING btree (season_franchise_id, real_team_id, added_at) WHERE (real_team_id IS NOT NULL);

-- roster_integrity_audit.roster_integrity_audit_league_idx
CREATE INDEX roster_integrity_audit_league_idx ON public.roster_integrity_audit USING btree (league_season_id, created_at DESC);

-- roster_integrity_audit.roster_integrity_audit_pkey
CREATE UNIQUE INDEX roster_integrity_audit_pkey ON public.roster_integrity_audit USING btree (id);

-- roster_integrity_overrides.roster_integrity_overrides_active_idx
CREATE INDEX roster_integrity_overrides_active_idx ON public.roster_integrity_overrides USING btree (roster_entry_id, expires_at) WHERE (consumed_at IS NULL);

-- roster_integrity_overrides.roster_integrity_overrides_pkey
CREATE UNIQUE INDEX roster_integrity_overrides_pkey ON public.roster_integrity_overrides USING btree (id);

-- roster_integrity_reviews.roster_integrity_reviews_league_status_idx
CREATE INDEX roster_integrity_reviews_league_status_idx ON public.roster_integrity_reviews USING btree (league_season_id, status, requested_at DESC);

-- roster_integrity_reviews.roster_integrity_reviews_one_pending
CREATE UNIQUE INDEX roster_integrity_reviews_one_pending ON public.roster_integrity_reviews USING btree (roster_entry_id) WHERE (status = 'pending'::text);

-- roster_integrity_reviews.roster_integrity_reviews_pkey
CREATE UNIQUE INDEX roster_integrity_reviews_pkey ON public.roster_integrity_reviews USING btree (id);

-- scoring_profiles.scoring_profiles_pkey
CREATE UNIQUE INDEX scoring_profiles_pkey ON public.scoring_profiles USING btree (id);

-- season_franchises.season_franchises_league_season_id_franchise_id_key
CREATE UNIQUE INDEX season_franchises_league_season_id_franchise_id_key ON public.season_franchises USING btree (league_season_id, franchise_id);

-- season_franchises.season_franchises_pkey
CREATE UNIQUE INDEX season_franchises_pkey ON public.season_franchises USING btree (id);

-- share_links.share_links_pkey
CREATE UNIQUE INDEX share_links_pkey ON public.share_links USING btree (id);

-- share_links.share_links_token_key
CREATE UNIQUE INDEX share_links_token_key ON public.share_links USING btree (token);

-- social_oauth_connections.social_oauth_connections_pkey
CREATE UNIQUE INDEX social_oauth_connections_pkey ON public.social_oauth_connections USING btree (id);

-- social_oauth_connections.social_oauth_connections_provider_platform_idx
CREATE INDEX social_oauth_connections_provider_platform_idx ON public.social_oauth_connections USING btree (provider, platform);

-- social_oauth_connections.social_oauth_connections_provider_platform_platform_account_key
CREATE UNIQUE INDEX social_oauth_connections_provider_platform_platform_account_key ON public.social_oauth_connections USING btree (provider, platform, platform_account_id);

-- social_oauth_states.social_oauth_states_expires_at_idx
CREATE INDEX social_oauth_states_expires_at_idx ON public.social_oauth_states USING btree (expires_at);

-- social_oauth_states.social_oauth_states_pkey
CREATE UNIQUE INDEX social_oauth_states_pkey ON public.social_oauth_states USING btree (state_hash);

-- social_publication_jobs.idx_social_publication_jobs_due
CREATE INDEX idx_social_publication_jobs_due ON public.social_publication_jobs USING btree (cohort_id, scheduled_at_utc, state);

-- social_publication_jobs.social_publication_jobs_cohort_id_content_artifact_id_key
CREATE UNIQUE INDEX social_publication_jobs_cohort_id_content_artifact_id_key ON public.social_publication_jobs USING btree (cohort_id, content_artifact_id);

-- social_publication_jobs.social_publication_jobs_pkey
CREATE UNIQUE INDEX social_publication_jobs_pkey ON public.social_publication_jobs USING btree (publishing_job_id);

-- social_publication_registrations.social_publication_registrati_platform_account_reference_co_key
CREATE UNIQUE INDEX social_publication_registrati_platform_account_reference_co_key ON public.social_publication_registrations USING btree (platform, account_reference, content_artifact_id);

-- social_publication_registrations.social_publication_registrations_pkey
CREATE UNIQUE INDEX social_publication_registrations_pkey ON public.social_publication_registrations USING btree (publication_id);

-- social_publication_registrations.social_publication_registrations_provider_platform_post_id_key
CREATE UNIQUE INDEX social_publication_registrations_provider_platform_post_id_key ON public.social_publication_registrations USING btree (provider, platform_post_id);

-- social_publication_registrations.social_publication_registrations_publishing_job_id_key
CREATE UNIQUE INDEX social_publication_registrations_publishing_job_id_key ON public.social_publication_registrations USING btree (publishing_job_id);

-- social_scheduler_cohort_items.idx_social_scheduler_items_due
CREATE INDEX idx_social_scheduler_items_due ON public.social_scheduler_cohort_items USING btree (cohort_id, scheduled_at_utc, status);

-- social_scheduler_cohort_items.social_scheduler_cohort_items_pkey
CREATE UNIQUE INDEX social_scheduler_cohort_items_pkey ON public.social_scheduler_cohort_items USING btree (cohort_id, content_artifact_id);

-- social_scheduler_cohorts.social_scheduler_cohorts_pkey
CREATE UNIQUE INDEX social_scheduler_cohorts_pkey ON public.social_scheduler_cohorts USING btree (cohort_id);

-- social_scheduler_events.idx_social_scheduler_events_lookup
CREATE INDEX idx_social_scheduler_events_lookup ON public.social_scheduler_events USING btree (cohort_id, content_artifact_id, event_time DESC);

-- social_scheduler_events.social_scheduler_events_pkey
CREATE UNIQUE INDEX social_scheduler_events_pkey ON public.social_scheduler_events USING btree (id);

-- sports.sports_code_key
CREATE UNIQUE INDEX sports_code_key ON public.sports USING btree (code);

-- sports.sports_pkey
CREATE UNIQUE INDEX sports_pkey ON public.sports USING btree (id);

-- stadium_features.stadium_features_code_key
CREATE UNIQUE INDEX stadium_features_code_key ON public.stadium_features USING btree (code);

-- stadium_features.stadium_features_pkey
CREATE UNIQUE INDEX stadium_features_pkey ON public.stadium_features USING btree (id);

-- stadiums.stadiums_franchise_id_key
CREATE UNIQUE INDEX stadiums_franchise_id_key ON public.stadiums USING btree (franchise_id);

-- stadiums.stadiums_pkey
CREATE UNIQUE INDEX stadiums_pkey ON public.stadiums USING btree (id);

-- standings.standings_pkey
CREATE UNIQUE INDEX standings_pkey ON public.standings USING btree (league_season_id, season_franchise_id);

-- story_events.story_events_pkey
CREATE UNIQUE INDEX story_events_pkey ON public.story_events USING btree (id);

-- trade_items.trade_items_pkey
CREATE UNIQUE INDEX trade_items_pkey ON public.trade_items USING btree (id);

-- trade_messages.trade_messages_pkey
CREATE UNIQUE INDEX trade_messages_pkey ON public.trade_messages USING btree (id);

-- trades.trades_pkey
CREATE UNIQUE INDEX trades_pkey ON public.trades USING btree (id);

-- trades.trades_season_status_idx
CREATE INDEX trades_season_status_idx ON public.trades USING btree (league_season_id, status);

-- user_profiles.user_profiles_pkey
CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (user_id);

-- waiver_claims.waiver_claims_pending_idx
CREATE INDEX waiver_claims_pending_idx ON public.waiver_claims USING btree (waiver_hold_id, created_at) WHERE (status = 'pending'::text);

-- waiver_claims.waiver_claims_pkey
CREATE UNIQUE INDEX waiver_claims_pkey ON public.waiver_claims USING btree (id);

-- waiver_claims.waiver_claims_waiver_hold_id_season_franchise_id_key
CREATE UNIQUE INDEX waiver_claims_waiver_hold_id_season_franchise_id_key ON public.waiver_claims USING btree (waiver_hold_id, season_franchise_id);

-- waiver_holds.waiver_holds_due_idx
CREATE INDEX waiver_holds_due_idx ON public.waiver_holds USING btree (league_season_id, clears_at) WHERE (status = 'open'::text);

-- waiver_holds.waiver_holds_open_athlete_unique
CREATE UNIQUE INDEX waiver_holds_open_athlete_unique ON public.waiver_holds USING btree (league_season_id, athlete_id) WHERE ((status = 'open'::text) AND (athlete_id IS NOT NULL));

-- waiver_holds.waiver_holds_open_team_unique
CREATE UNIQUE INDEX waiver_holds_open_team_unique ON public.waiver_holds USING btree (league_season_id, real_team_id) WHERE ((status = 'open'::text) AND (real_team_id IS NOT NULL));

-- waiver_holds.waiver_holds_pkey
CREATE UNIQUE INDEX waiver_holds_pkey ON public.waiver_holds USING btree (id);

-- weekly_awards.weekly_awards_league_season_id_week_code_key
CREATE UNIQUE INDEX weekly_awards_league_season_id_week_code_key ON public.weekly_awards USING btree (league_season_id, week, code);

-- weekly_awards.weekly_awards_pkey
CREATE UNIQUE INDEX weekly_awards_pkey ON public.weekly_awards USING btree (id);
