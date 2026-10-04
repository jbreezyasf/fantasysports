-- grants.sql — EFFECTIVE privileges of anon, authenticated and service_role (has_*_privilege, so grants inherited through PUBLIC are included). Function lines also name PUBLIC when the function ACL grants it.
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== grants_tables: 203 object(s) =====
-- Query:
--   select (c.relname || '.' || r.rolname)::text as ord,
--          format('GRANT %s ON public.%I TO %I;', string_agg(p.priv, ', ' order by p.priv), c.relname, r.rolname) as text
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
--   cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv)
--   where n.nspname = 'public' and c.relkind in ('r','p','v','m')
--     and has_table_privilege(r.rolname, c.oid, p.priv)
--   group by c.relname, r.rolname

-- achievements.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.achievements TO anon;

-- achievements.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.achievements TO authenticated;

-- achievements.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.achievements TO service_role;

-- athlete_game_stats.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.athlete_game_stats TO anon;

-- athlete_game_stats.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.athlete_game_stats TO authenticated;

-- athlete_game_stats.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.athlete_game_stats TO service_role;

-- athlete_provider_ids.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.athlete_provider_ids TO anon;

-- athlete_provider_ids.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.athlete_provider_ids TO authenticated;

-- athlete_provider_ids.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.athlete_provider_ids TO service_role;

-- athletes.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.athletes TO anon;

-- athletes.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.athletes TO authenticated;

-- athletes.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.athletes TO service_role;

-- beta_feedback_analysis.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.beta_feedback_analysis TO service_role;

-- beta_feedback_review_events.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.beta_feedback_review_events TO service_role;

-- beta_feedback_submissions.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.beta_feedback_submissions TO service_role;

-- championships.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.championships TO anon;

-- championships.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.championships TO authenticated;

-- championships.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.championships TO service_role;

-- competition_seasons.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.competition_seasons TO anon;

-- competition_seasons.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.competition_seasons TO authenticated;

-- competition_seasons.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.competition_seasons TO service_role;

-- competitions.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.competitions TO anon;

-- competitions.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.competitions TO authenticated;

-- competitions.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.competitions TO service_role;

-- draft_corrections.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.draft_corrections TO anon;

-- draft_corrections.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.draft_corrections TO authenticated;

-- draft_corrections.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.draft_corrections TO service_role;

-- draft_historical_values.authenticated
GRANT SELECT ON public.draft_historical_values TO authenticated;

-- draft_historical_values.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.draft_historical_values TO service_role;

-- draft_picks.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.draft_picks TO anon;

-- draft_picks.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.draft_picks TO authenticated;

-- draft_picks.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.draft_picks TO service_role;

-- draft_queues.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.draft_queues TO anon;

-- draft_queues.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.draft_queues TO authenticated;

-- draft_queues.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.draft_queues TO service_role;

-- drafts.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.drafts TO anon;

-- drafts.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.drafts TO authenticated;

-- drafts.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.drafts TO service_role;

-- fantasy_leagues.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.fantasy_leagues TO anon;

-- fantasy_leagues.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.fantasy_leagues TO authenticated;

-- fantasy_leagues.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fantasy_leagues TO service_role;

-- fantasy_player_market_values.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.fantasy_player_market_values TO authenticated;

-- fantasy_player_market_values.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fantasy_player_market_values TO service_role;

-- fantasy_player_scores.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.fantasy_player_scores TO anon;

-- fantasy_player_scores.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.fantasy_player_scores TO authenticated;

-- fantasy_player_scores.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fantasy_player_scores TO service_role;

-- fantasy_team_scores.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.fantasy_team_scores TO anon;

-- fantasy_team_scores.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.fantasy_team_scores TO authenticated;

-- fantasy_team_scores.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fantasy_team_scores TO service_role;

-- feed_reactions.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.feed_reactions TO anon;

-- feed_reactions.authenticated
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.feed_reactions TO authenticated;

-- feed_reactions.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_reactions TO service_role;

-- franchise_achievements.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.franchise_achievements TO anon;

-- franchise_achievements.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.franchise_achievements TO authenticated;

-- franchise_achievements.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.franchise_achievements TO service_role;

-- franchise_owners.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.franchise_owners TO anon;

-- franchise_owners.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.franchise_owners TO authenticated;

-- franchise_owners.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.franchise_owners TO service_role;

-- franchise_stadium_features.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.franchise_stadium_features TO anon;

-- franchise_stadium_features.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.franchise_stadium_features TO authenticated;

-- franchise_stadium_features.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.franchise_stadium_features TO service_role;

-- franchises.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.franchises TO anon;

-- franchises.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.franchises TO authenticated;

-- franchises.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.franchises TO service_role;

-- gate1_scoring_validation_summary.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.gate1_scoring_validation_summary TO anon;

-- gate1_scoring_validation_summary.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.gate1_scoring_validation_summary TO authenticated;

-- gate1_scoring_validation_summary.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.gate1_scoring_validation_summary TO service_role;

-- generated_messages.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.generated_messages TO anon;

-- generated_messages.authenticated
GRANT INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.generated_messages TO authenticated;

-- generated_messages.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.generated_messages TO service_role;

-- historical_backfill_runs.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.historical_backfill_runs TO anon;

-- historical_backfill_runs.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.historical_backfill_runs TO authenticated;

-- historical_backfill_runs.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.historical_backfill_runs TO service_role;

-- historical_dst_score_validation.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.historical_dst_score_validation TO service_role;

-- historical_fantasy_score_validation.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.historical_fantasy_score_validation TO service_role;

-- historical_lineups.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.historical_lineups TO anon;

-- historical_lineups.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.historical_lineups TO authenticated;

-- historical_lineups.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.historical_lineups TO service_role;

-- league_feed_events.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.league_feed_events TO anon;

-- league_feed_events.authenticated
GRANT INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.league_feed_events TO authenticated;

-- league_feed_events.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.league_feed_events TO service_role;

-- league_invites.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.league_invites TO anon;

-- league_invites.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.league_invites TO authenticated;

-- league_invites.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.league_invites TO service_role;

-- league_members.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.league_members TO anon;

-- league_members.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.league_members TO authenticated;

-- league_members.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.league_members TO service_role;

-- league_news_stories.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.league_news_stories TO anon;

-- league_news_stories.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.league_news_stories TO authenticated;

-- league_news_stories.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.league_news_stories TO service_role;

-- league_seasons.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.league_seasons TO anon;

-- league_seasons.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.league_seasons TO authenticated;

-- league_seasons.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.league_seasons TO service_role;

-- lineup_move_audit.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.lineup_move_audit TO anon;

-- lineup_move_audit.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.lineup_move_audit TO authenticated;

-- lineup_move_audit.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lineup_move_audit TO service_role;

-- lineups.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.lineups TO anon;

-- lineups.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.lineups TO authenticated;

-- lineups.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lineups TO service_role;

-- live_scoring_runs.authenticated
GRANT SELECT ON public.live_scoring_runs TO authenticated;

-- live_scoring_runs.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.live_scoring_runs TO service_role;

-- matchups.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.matchups TO anon;

-- matchups.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.matchups TO authenticated;

-- matchups.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.matchups TO service_role;

-- ops_audit_events.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.ops_audit_events TO anon;

-- ops_audit_events.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.ops_audit_events TO authenticated;

-- ops_audit_events.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_audit_events TO service_role;

-- ops_staff_roles.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.ops_staff_roles TO anon;

-- ops_staff_roles.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.ops_staff_roles TO authenticated;

-- ops_staff_roles.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_staff_roles TO service_role;

-- postseason_seeds.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.postseason_seeds TO anon;

-- postseason_seeds.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.postseason_seeds TO authenticated;

-- postseason_seeds.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.postseason_seeds TO service_role;

-- qa_fixture_leagues.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.qa_fixture_leagues TO service_role;

-- qa_fixture_users.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.qa_fixture_users TO service_role;

-- real_games.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.real_games TO anon;

-- real_games.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.real_games TO authenticated;

-- real_games.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.real_games TO service_role;

-- real_team_game_stats.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.real_team_game_stats TO anon;

-- real_team_game_stats.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.real_team_game_stats TO authenticated;

-- real_team_game_stats.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.real_team_game_stats TO service_role;

-- real_teams.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.real_teams TO anon;

-- real_teams.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.real_teams TO authenticated;

-- real_teams.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.real_teams TO service_role;

-- recap_matchup_moments.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.recap_matchup_moments TO anon;

-- recap_matchup_moments.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recap_matchup_moments TO authenticated;

-- recap_matchup_moments.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.recap_matchup_moments TO service_role;

-- recap_renders.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.recap_renders TO anon;

-- recap_renders.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recap_renders TO authenticated;

-- recap_renders.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.recap_renders TO service_role;

-- recap_scenes.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.recap_scenes TO anon;

-- recap_scenes.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recap_scenes TO authenticated;

-- recap_scenes.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.recap_scenes TO service_role;

-- recap_scripts.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.recap_scripts TO anon;

-- recap_scripts.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recap_scripts TO authenticated;

-- recap_scripts.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.recap_scripts TO service_role;

-- rivalries.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.rivalries TO anon;

-- rivalries.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.rivalries TO authenticated;

-- rivalries.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.rivalries TO service_role;

-- roster_entries.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.roster_entries TO anon;

-- roster_entries.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.roster_entries TO authenticated;

-- roster_entries.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.roster_entries TO service_role;

-- roster_integrity_audit.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.roster_integrity_audit TO anon;

-- roster_integrity_audit.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.roster_integrity_audit TO authenticated;

-- roster_integrity_audit.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.roster_integrity_audit TO service_role;

-- roster_integrity_overrides.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.roster_integrity_overrides TO anon;

-- roster_integrity_overrides.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.roster_integrity_overrides TO authenticated;

-- roster_integrity_overrides.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.roster_integrity_overrides TO service_role;

-- roster_integrity_reviews.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.roster_integrity_reviews TO anon;

-- roster_integrity_reviews.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.roster_integrity_reviews TO authenticated;

-- roster_integrity_reviews.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.roster_integrity_reviews TO service_role;

-- scoring_profiles.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.scoring_profiles TO anon;

-- scoring_profiles.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.scoring_profiles TO authenticated;

-- scoring_profiles.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.scoring_profiles TO service_role;

-- season_franchises.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.season_franchises TO anon;

-- season_franchises.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.season_franchises TO authenticated;

-- season_franchises.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.season_franchises TO service_role;

-- share_links.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.share_links TO anon;

-- share_links.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.share_links TO authenticated;

-- share_links.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.share_links TO service_role;

-- social_oauth_connections.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.social_oauth_connections TO service_role;

-- social_oauth_states.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.social_oauth_states TO service_role;

-- social_publication_jobs.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.social_publication_jobs TO service_role;

-- social_publication_registrations.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.social_publication_registrations TO service_role;

-- social_scheduler_cohort_items.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.social_scheduler_cohort_items TO service_role;

-- social_scheduler_cohorts.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.social_scheduler_cohorts TO service_role;

-- social_scheduler_events.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.social_scheduler_events TO service_role;

-- sports.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.sports TO anon;

-- sports.authenticated
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.sports TO authenticated;

-- sports.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sports TO service_role;

-- stadium_features.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.stadium_features TO anon;

-- stadium_features.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.stadium_features TO authenticated;

-- stadium_features.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stadium_features TO service_role;

-- stadiums.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.stadiums TO anon;

-- stadiums.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.stadiums TO authenticated;

-- stadiums.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stadiums TO service_role;

-- standings.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.standings TO anon;

-- standings.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.standings TO authenticated;

-- standings.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.standings TO service_role;

-- story_events.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.story_events TO anon;

-- story_events.authenticated
GRANT INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.story_events TO authenticated;

-- story_events.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.story_events TO service_role;

-- trade_items.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.trade_items TO anon;

-- trade_items.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.trade_items TO authenticated;

-- trade_items.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.trade_items TO service_role;

-- trade_messages.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.trade_messages TO anon;

-- trade_messages.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.trade_messages TO authenticated;

-- trade_messages.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.trade_messages TO service_role;

-- trades.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.trades TO anon;

-- trades.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.trades TO authenticated;

-- trades.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.trades TO service_role;

-- user_profiles.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.user_profiles TO anon;

-- user_profiles.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.user_profiles TO authenticated;

-- user_profiles.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_profiles TO service_role;

-- waiver_claims.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.waiver_claims TO anon;

-- waiver_claims.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.waiver_claims TO authenticated;

-- waiver_claims.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.waiver_claims TO service_role;

-- waiver_holds.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.waiver_holds TO anon;

-- waiver_holds.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.waiver_holds TO authenticated;

-- waiver_holds.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.waiver_holds TO service_role;

-- weekly_awards.anon
GRANT REFERENCES, TRIGGER, TRUNCATE ON public.weekly_awards TO anon;

-- weekly_awards.authenticated
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.weekly_awards TO authenticated;

-- weekly_awards.service_role
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.weekly_awards TO service_role;

-- ===== grants_columns: 0 object(s) =====
-- Query:
--   select (cp.table_name || '.' || cp.grantee || '.' || cp.privilege_type)::text as ord,
--          format('GRANT %s (%s) ON public.%I TO %I;', cp.privilege_type, string_agg(quote_ident(cp.column_name), ', ' order by cp.column_name), cp.table_name, cp.grantee) as text
--   from information_schema.column_privileges cp
--   where cp.table_schema = 'public' and cp.grantee in ('anon', 'authenticated', 'service_role')
--     and not has_table_privilege(cp.grantee, format('public.%I', cp.table_name)::regclass, cp.privilege_type)
--   group by cp.table_name, cp.grantee, cp.privilege_type

-- ===== grants_functions: 86 object(s) =====
-- Query:
--   select (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text as ord,
--          case when g.grantees = ''
--               then format('-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
--               else format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO %s;', p.proname, pg_get_function_identity_arguments(p.oid), g.grantees) end as text
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral (select concat_ws(', ',
--            case when p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'PUBLIC' end,
--            case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
--            case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end,
--            case when has_function_privilege('service_role', p.oid, 'EXECUTE') then 'service_role' end) as grantees) g
--   where n.nspname = 'public' and p.prokind in ('f','p')

-- accept_league_invite(p_invite_token uuid, p_franchise_name text, p_abbreviation text, p_primary_color text, p_secondary_color text, p_avatar_key text)
GRANT EXECUTE ON FUNCTION public.accept_league_invite(p_invite_token uuid, p_franchise_name text, p_abbreviation text, p_primary_color text, p_secondary_color text, p_avatar_key text) TO authenticated;

-- activate_league_season(p_league_season_id uuid)
GRANT EXECUTE ON FUNCTION public.activate_league_season(p_league_season_id uuid) TO authenticated;

-- add_draft_queue_item(p_draft_id uuid, p_athlete_id uuid, p_real_team_id uuid)
GRANT EXECUTE ON FUNCTION public.add_draft_queue_item(p_draft_id uuid, p_athlete_id uuid, p_real_team_id uuid) TO authenticated;

-- assert_late_entry_open(p_league_season_id uuid, p_context text)
GRANT EXECUTE ON FUNCTION public.assert_late_entry_open(p_league_season_id uuid, p_context text) TO service_role;

-- award_matchup_achievements(p_matchup_id uuid)
GRANT EXECUTE ON FUNCTION public.award_matchup_achievements(p_matchup_id uuid) TO service_role;

-- build_matchup_recap(p_matchup_id uuid)
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.build_matchup_recap(p_matchup_id uuid)

-- calculate_pro_football_dst_scores(p_league_season_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.calculate_pro_football_dst_scores(p_league_season_id uuid, p_week integer) TO authenticated, service_role;

-- calculate_pro_football_player_scores(p_league_season_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.calculate_pro_football_player_scores(p_league_season_id uuid, p_week integer) TO authenticated, service_role;

-- calculate_pro_football_week_scores(p_league_season_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.calculate_pro_football_week_scores(p_league_season_id uuid, p_week integer) TO authenticated, service_role;

-- claim_free_agent(p_season_franchise_id uuid, p_athlete_id uuid, p_real_team_id uuid, p_drop_roster_entry_id uuid)
GRANT EXECUTE ON FUNCTION public.claim_free_agent(p_season_franchise_id uuid, p_athlete_id uuid, p_real_team_id uuid, p_drop_roster_entry_id uuid) TO authenticated;

-- claim_recap_render(p_worker_id text, p_provider text)
GRANT EXECUTE ON FUNCTION public.claim_recap_render(p_worker_id text, p_provider text) TO service_role;

-- claim_share_league_invite(p_invite_token uuid)
GRANT EXECUTE ON FUNCTION public.claim_share_league_invite(p_invite_token uuid) TO authenticated;

-- close_league_season(p_league_id uuid)
GRANT EXECUTE ON FUNCTION public.close_league_season(p_league_id uuid) TO PUBLIC, anon, authenticated, service_role;

-- commissioner_remove_pre_draft_franchise(p_league_id uuid, p_franchise_id uuid)
GRANT EXECUTE ON FUNCTION public.commissioner_remove_pre_draft_franchise(p_league_id uuid, p_franchise_id uuid) TO authenticated;

-- complete_recap_render(p_render_id uuid, p_storage_key text, p_bytes bigint, p_duration_ms integer, p_provider_job_id text)
GRANT EXECUTE ON FUNCTION public.complete_recap_render(p_render_id uuid, p_storage_key text, p_bytes bigint, p_duration_ms integer, p_provider_job_id text) TO service_role;

-- consume_roster_integrity_override(p_roster_entry_id uuid)
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.consume_roster_integrity_override(p_roster_entry_id uuid)

-- create_circuit_schedule_after_draft()
GRANT EXECUTE ON FUNCTION public.create_circuit_schedule_after_draft() TO service_role;

-- create_league_invite(p_league_id uuid, p_email text)
GRANT EXECUTE ON FUNCTION public.create_league_invite(p_league_id uuid, p_email text) TO authenticated;

-- create_league_share_invite(p_league_id uuid)
GRANT EXECUTE ON FUNCTION public.create_league_share_invite(p_league_id uuid) TO authenticated;

-- create_pro_football_league(p_name text, p_franchise_name text, p_abbreviation text, p_primary_color text, p_secondary_color text, p_avatar_key text)
GRANT EXECUTE ON FUNCTION public.create_pro_football_league(p_name text, p_franchise_name text, p_abbreviation text, p_primary_color text, p_secondary_color text, p_avatar_key text) TO authenticated;

-- create_trade_proposal(p_league_season_id uuid, p_to_season_franchise_id uuid, p_offer_athlete_ids uuid[], p_request_athlete_ids uuid[], p_offer_team_ids uuid[], p_request_team_ids uuid[])
GRANT EXECUTE ON FUNCTION public.create_trade_proposal(p_league_season_id uuid, p_to_season_franchise_id uuid, p_offer_athlete_ids uuid[], p_request_athlete_ids uuid[], p_offer_team_ids uuid[], p_request_team_ids uuid[]) TO authenticated;

-- current_league_season_id(p_league_id uuid)
GRANT EXECUTE ON FUNCTION public.current_league_season_id(p_league_id uuid) TO PUBLIC, anon, authenticated, service_role;

-- designate_rivalry(p_league_id uuid, p_franchise_a uuid, p_franchise_b uuid)
GRANT EXECUTE ON FUNCTION public.designate_rivalry(p_league_id uuid, p_franchise_a uuid, p_franchise_b uuid) TO authenticated;

-- draft_autopick_candidate(p_draft_id uuid, p_competition_id uuid, p_positions text[])
GRANT EXECUTE ON FUNCTION public.draft_autopick_candidate(p_draft_id uuid, p_competition_id uuid, p_positions text[]) TO service_role;

-- draft_roster_needs(p_season_franchise_id uuid)
GRANT EXECUTE ON FUNCTION public.draft_roster_needs(p_season_franchise_id uuid) TO authenticated, service_role;

-- effective_late_entry_cutoff(p_league_season_id uuid)
GRANT EXECUTE ON FUNCTION public.effective_late_entry_cutoff(p_league_season_id uuid) TO authenticated, service_role;

-- enforce_roster_integrity_drop()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.enforce_roster_integrity_drop()

-- evaluate_roster_integrity_drop(p_roster_entry_id uuid, p_context text)
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.evaluate_roster_integrity_drop(p_roster_entry_id uuid, p_context text)

-- fail_recap_render(p_render_id uuid, p_error text)
GRANT EXECUTE ON FUNCTION public.fail_recap_render(p_render_id uuid, p_error text) TO service_role;

-- generate_chaos_week(p_league_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.generate_chaos_week(p_league_id uuid, p_week integer) TO PUBLIC, anon, authenticated, service_role;

-- generate_circuit_schedule(p_league_id uuid)
GRANT EXECUTE ON FUNCTION public.generate_circuit_schedule(p_league_id uuid) TO authenticated;

-- generate_judgment_week(p_league_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.generate_judgment_week(p_league_id uuid, p_week integer) TO PUBLIC, anon, authenticated, service_role;

-- generate_position_week(p_league_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.generate_position_week(p_league_id uuid, p_week integer) TO authenticated;

-- generate_postseason_week16(p_league_id uuid)
GRANT EXECUTE ON FUNCTION public.generate_postseason_week16(p_league_id uuid) TO PUBLIC, anon, authenticated, service_role;

-- generate_postseason_week17(p_league_id uuid)
GRANT EXECUTE ON FUNCTION public.generate_postseason_week17(p_league_id uuid) TO PUBLIC, anon, authenticated, service_role;

-- generate_revenge_week(p_league_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.generate_revenge_week(p_league_id uuid, p_week integer) TO authenticated;

-- generate_rivalry_week(p_league_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.generate_rivalry_week(p_league_id uuid, p_week integer) TO authenticated;

-- generate_weekly_awards(p_league_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.generate_weekly_awards(p_league_id uuid, p_week integer) TO PUBLIC, anon, authenticated, service_role;

-- get_public_league_invite(p_invite_token uuid)
GRANT EXECUTE ON FUNCTION public.get_public_league_invite(p_invite_token uuid) TO anon, authenticated, service_role;

-- get_public_league_invite_v2(p_invite_token uuid)
GRANT EXECUTE ON FUNCTION public.get_public_league_invite_v2(p_invite_token uuid) TO PUBLIC, anon, authenticated, service_role;

-- handle_new_user_profile()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.handle_new_user_profile()

-- initialize_postseason(p_league_id uuid)
GRANT EXECUTE ON FUNCTION public.initialize_postseason(p_league_id uuid) TO PUBLIC, anon, authenticated, service_role;

-- initialize_snake_draft(p_league_id uuid, p_pick_seconds integer, p_starts_at timestamp with time zone)
GRANT EXECUTE ON FUNCTION public.initialize_snake_draft(p_league_id uuid, p_pick_seconds integer, p_starts_at timestamp with time zone) TO authenticated;

-- internal_import_athletes(p_competition_code text, p_rows jsonb)
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.internal_import_athletes(p_competition_code text, p_rows jsonb)

-- invite_matches_current_user(p_invite_token uuid)
GRANT EXECUTE ON FUNCTION public.invite_matches_current_user(p_invite_token uuid) TO PUBLIC, anon, authenticated, service_role;

-- is_league_member(target_league_id uuid)
GRANT EXECUTE ON FUNCTION public.is_league_member(target_league_id uuid) TO authenticated;

-- make_draft_pick(p_draft_id uuid, p_athlete_id uuid, p_real_team_id uuid, p_auto boolean)
GRANT EXECUTE ON FUNCTION public.make_draft_pick(p_draft_id uuid, p_athlete_id uuid, p_real_team_id uuid, p_auto boolean) TO authenticated;

-- mark_late_start_after_draft(p_league_season_id uuid)
GRANT EXECUTE ON FUNCTION public.mark_late_start_after_draft(p_league_season_id uuid) TO service_role;

-- move_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid, p_direction text)
GRANT EXECUTE ON FUNCTION public.move_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid, p_direction text) TO authenticated;

-- pause_draft(p_draft_id uuid)
GRANT EXECUTE ON FUNCTION public.pause_draft(p_draft_id uuid) TO authenticated;

-- post_draft_completion_letter()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.post_draft_completion_letter()

-- post_generated_message(p_message_id uuid, p_body text)
GRANT EXECUTE ON FUNCTION public.post_generated_message(p_message_id uuid, p_body text) TO PUBLIC, anon, authenticated, service_role;

-- post_locker_room_message(p_league_id uuid, p_body text)
GRANT EXECUTE ON FUNCTION public.post_locker_room_message(p_league_id uuid, p_body text) TO PUBLIC, anon, authenticated, service_role;

-- post_trade_message(p_trade_id uuid, p_body text)
GRANT EXECUTE ON FUNCTION public.post_trade_message(p_trade_id uuid, p_body text) TO PUBLIC, anon, authenticated, service_role;

-- prevent_beta_feedback_submission_changes()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.prevent_beta_feedback_submission_changes()

-- prevent_started_roster_asset_drop()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.prevent_started_roster_asset_drop()

-- process_all_due_waivers()
GRANT EXECUTE ON FUNCTION public.process_all_due_waivers() TO service_role;

-- process_due_waivers(p_league_season_id uuid)
GRANT EXECUTE ON FUNCTION public.process_due_waivers(p_league_season_id uuid) TO service_role;

-- process_expired_draft_picks(p_draft_id uuid, p_limit integer)
GRANT EXECUTE ON FUNCTION public.process_expired_draft_picks(p_draft_id uuid, p_limit integer) TO authenticated, service_role;

-- provision_franchise_stadium()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.provision_franchise_stadium()

-- publish_finalized_league_week(p_league_season_id uuid, p_week integer)
GRANT EXECUTE ON FUNCTION public.publish_finalized_league_week(p_league_season_id uuid, p_week integer) TO service_role;

-- rebuild_five_season_history_lab(p_owner_user_id uuid)
GRANT EXECUTE ON FUNCTION public.rebuild_five_season_history_lab(p_owner_user_id uuid) TO service_role;

-- recompute_matchup(p_matchup_id uuid, p_finalize boolean)
GRANT EXECUTE ON FUNCTION public.recompute_matchup(p_matchup_id uuid, p_finalize boolean) TO authenticated, service_role;

-- record_generated_message(p_matchup_id uuid, p_tone text, p_body text, p_provider text)
GRANT EXECUTE ON FUNCTION public.record_generated_message(p_matchup_id uuid, p_tone text, p_body text, p_provider text) TO PUBLIC, anon, authenticated, service_role;

-- record_late_start_draft_completion()
GRANT EXECUTE ON FUNCTION public.record_late_start_draft_completion() TO service_role;

-- remove_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid)
GRANT EXECUTE ON FUNCTION public.remove_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid) TO authenticated;

-- remove_drafted_asset_from_queues()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.remove_drafted_asset_from_queues()

-- request_roster_integrity_review(p_roster_entry_id uuid, p_manager_note text)
GRANT EXECUTE ON FUNCTION public.request_roster_integrity_review(p_roster_entry_id uuid, p_manager_note text) TO authenticated;

-- resolve_late_start_activation(p_league_season_id uuid)
GRANT EXECUTE ON FUNCTION public.resolve_late_start_activation(p_league_season_id uuid) TO authenticated, service_role;

-- resolve_roster_integrity_review(p_review_id uuid, p_approve boolean, p_note text)
GRANT EXECUTE ON FUNCTION public.resolve_roster_integrity_review(p_review_id uuid, p_approve boolean, p_note text) TO authenticated;

-- resolve_trade(p_trade_id uuid, p_action text)
GRANT EXECUTE ON FUNCTION public.resolve_trade(p_trade_id uuid, p_action text) TO authenticated;

-- rls_auto_enable()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.rls_auto_enable()

-- roster_asset_game_has_started(p_roster_entry_id uuid)
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.roster_asset_game_has_started(p_roster_entry_id uuid)

-- roster_integrity_asset_is_protected(p_roster_entry_id uuid)
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.roster_integrity_asset_is_protected(p_roster_entry_id uuid)

-- set_franchise_roster_lock(p_season_franchise_id uuid, p_locked boolean, p_reason text)
GRANT EXECUTE ON FUNCTION public.set_franchise_roster_lock(p_season_franchise_id uuid, p_locked boolean, p_reason text) TO authenticated;

-- set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_athlete_id uuid, p_real_team_id uuid)
GRANT EXECUTE ON FUNCTION public.set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_athlete_id uuid, p_real_team_id uuid) TO authenticated;

-- set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_slot_index integer, p_athlete_id uuid, p_real_team_id uuid)
GRANT EXECUTE ON FUNCTION public.set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_slot_index integer, p_athlete_id uuid, p_real_team_id uuid) TO authenticated;

-- set_trade_deadline(p_league_id uuid, p_deadline timestamp with time zone)
GRANT EXECUTE ON FUNCTION public.set_trade_deadline(p_league_id uuid, p_deadline timestamp with time zone) TO authenticated;

-- start_draft(p_draft_id uuid)
GRANT EXECUTE ON FUNCTION public.start_draft(p_draft_id uuid) TO authenticated;

-- submit_waiver_claim(p_waiver_hold_id uuid, p_season_franchise_id uuid, p_drop_roster_entry_id uuid)
GRANT EXECUTE ON FUNCTION public.submit_waiver_claim(p_waiver_hold_id uuid, p_season_franchise_id uuid, p_drop_roster_entry_id uuid) TO authenticated;

-- sync_franchise_stadium_features(p_franchise_id uuid)
GRANT EXECUTE ON FUNCTION public.sync_franchise_stadium_features(p_franchise_id uuid) TO service_role;

-- toggle_feed_reaction(p_event_id uuid, p_reaction text)
GRANT EXECUTE ON FUNCTION public.toggle_feed_reaction(p_event_id uuid, p_reaction text) TO PUBLIC, anon, authenticated, service_role;

-- touch_draft_queue_updated_at()
-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.touch_draft_queue_updated_at()

-- undo_last_draft_pick(p_draft_id uuid)
GRANT EXECUTE ON FUNCTION public.undo_last_draft_pick(p_draft_id uuid) TO authenticated;

-- update_roster_integrity_settings(p_league_season_id uuid, p_mode text, p_bulk_drop_limit integer, p_bulk_window_hours integer, p_protect_core_assets boolean, p_lock_eliminated boolean)
GRANT EXECUTE ON FUNCTION public.update_roster_integrity_settings(p_league_season_id uuid, p_mode text, p_bulk_drop_limit integer, p_bulk_window_hours integer, p_protect_core_assets boolean, p_lock_eliminated boolean) TO authenticated;

-- withdraw_waiver_claim(p_waiver_claim_id uuid)
GRANT EXECUTE ON FUNCTION public.withdraw_waiver_claim(p_waiver_claim_id uuid) TO authenticated;
