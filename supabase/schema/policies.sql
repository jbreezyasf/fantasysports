-- policies.sql — Row level security flags for every public table, then every policy.
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== rls: 77 object(s) =====
-- Query:
--   select c.relname::text as ord,
--          case when c.relrowsecurity
--               then format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname)
--               else format('-- RLS DISABLED on public.%I', c.relname) end
--          || case when c.relforcerowsecurity then format(E'\nALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', c.relname) else '' end as text
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind in ('r','p')

-- achievements
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- athlete_game_stats
ALTER TABLE public.athlete_game_stats ENABLE ROW LEVEL SECURITY;

-- athlete_provider_ids
ALTER TABLE public.athlete_provider_ids ENABLE ROW LEVEL SECURITY;

-- athletes
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;

-- beta_feedback_analysis
ALTER TABLE public.beta_feedback_analysis ENABLE ROW LEVEL SECURITY;

-- beta_feedback_review_events
ALTER TABLE public.beta_feedback_review_events ENABLE ROW LEVEL SECURITY;

-- beta_feedback_submissions
ALTER TABLE public.beta_feedback_submissions ENABLE ROW LEVEL SECURITY;

-- championships
ALTER TABLE public.championships ENABLE ROW LEVEL SECURITY;

-- competition_seasons
ALTER TABLE public.competition_seasons ENABLE ROW LEVEL SECURITY;

-- competitions
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

-- draft_corrections
ALTER TABLE public.draft_corrections ENABLE ROW LEVEL SECURITY;

-- draft_historical_values
ALTER TABLE public.draft_historical_values ENABLE ROW LEVEL SECURITY;

-- draft_picks
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;

-- draft_queues
ALTER TABLE public.draft_queues ENABLE ROW LEVEL SECURITY;

-- drafts
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

-- fantasy_leagues
ALTER TABLE public.fantasy_leagues ENABLE ROW LEVEL SECURITY;

-- fantasy_player_market_values
ALTER TABLE public.fantasy_player_market_values ENABLE ROW LEVEL SECURITY;

-- fantasy_player_scores
ALTER TABLE public.fantasy_player_scores ENABLE ROW LEVEL SECURITY;

-- fantasy_team_scores
ALTER TABLE public.fantasy_team_scores ENABLE ROW LEVEL SECURITY;

-- feed_reactions
ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

-- franchise_achievements
ALTER TABLE public.franchise_achievements ENABLE ROW LEVEL SECURITY;

-- franchise_owners
ALTER TABLE public.franchise_owners ENABLE ROW LEVEL SECURITY;

-- franchise_stadium_features
ALTER TABLE public.franchise_stadium_features ENABLE ROW LEVEL SECURITY;

-- franchises
ALTER TABLE public.franchises ENABLE ROW LEVEL SECURITY;

-- generated_messages
ALTER TABLE public.generated_messages ENABLE ROW LEVEL SECURITY;

-- historical_backfill_runs
ALTER TABLE public.historical_backfill_runs ENABLE ROW LEVEL SECURITY;

-- historical_dst_score_validation
ALTER TABLE public.historical_dst_score_validation ENABLE ROW LEVEL SECURITY;

-- historical_fantasy_score_validation
ALTER TABLE public.historical_fantasy_score_validation ENABLE ROW LEVEL SECURITY;

-- historical_lineups
ALTER TABLE public.historical_lineups ENABLE ROW LEVEL SECURITY;

-- league_feed_events
ALTER TABLE public.league_feed_events ENABLE ROW LEVEL SECURITY;

-- league_invites
ALTER TABLE public.league_invites ENABLE ROW LEVEL SECURITY;

-- league_members
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

-- league_news_stories
ALTER TABLE public.league_news_stories ENABLE ROW LEVEL SECURITY;

-- league_seasons
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;

-- lineup_move_audit
ALTER TABLE public.lineup_move_audit ENABLE ROW LEVEL SECURITY;

-- lineups
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;

-- live_scoring_runs
ALTER TABLE public.live_scoring_runs ENABLE ROW LEVEL SECURITY;

-- matchups
ALTER TABLE public.matchups ENABLE ROW LEVEL SECURITY;

-- ops_audit_events
ALTER TABLE public.ops_audit_events ENABLE ROW LEVEL SECURITY;

-- ops_staff_roles
ALTER TABLE public.ops_staff_roles ENABLE ROW LEVEL SECURITY;

-- postseason_seeds
ALTER TABLE public.postseason_seeds ENABLE ROW LEVEL SECURITY;

-- qa_fixture_leagues
ALTER TABLE public.qa_fixture_leagues ENABLE ROW LEVEL SECURITY;

-- qa_fixture_users
ALTER TABLE public.qa_fixture_users ENABLE ROW LEVEL SECURITY;

-- real_games
ALTER TABLE public.real_games ENABLE ROW LEVEL SECURITY;

-- real_team_game_stats
ALTER TABLE public.real_team_game_stats ENABLE ROW LEVEL SECURITY;

-- real_teams
ALTER TABLE public.real_teams ENABLE ROW LEVEL SECURITY;

-- recap_matchup_moments
ALTER TABLE public.recap_matchup_moments ENABLE ROW LEVEL SECURITY;

-- recap_renders
ALTER TABLE public.recap_renders ENABLE ROW LEVEL SECURITY;

-- recap_scenes
ALTER TABLE public.recap_scenes ENABLE ROW LEVEL SECURITY;

-- recap_scripts
ALTER TABLE public.recap_scripts ENABLE ROW LEVEL SECURITY;

-- rivalries
ALTER TABLE public.rivalries ENABLE ROW LEVEL SECURITY;

-- roster_entries
ALTER TABLE public.roster_entries ENABLE ROW LEVEL SECURITY;

-- roster_integrity_audit
ALTER TABLE public.roster_integrity_audit ENABLE ROW LEVEL SECURITY;

-- roster_integrity_overrides
ALTER TABLE public.roster_integrity_overrides ENABLE ROW LEVEL SECURITY;

-- roster_integrity_reviews
ALTER TABLE public.roster_integrity_reviews ENABLE ROW LEVEL SECURITY;

-- scoring_profiles
ALTER TABLE public.scoring_profiles ENABLE ROW LEVEL SECURITY;

-- season_franchises
ALTER TABLE public.season_franchises ENABLE ROW LEVEL SECURITY;

-- share_links
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- social_oauth_connections
ALTER TABLE public.social_oauth_connections ENABLE ROW LEVEL SECURITY;

-- social_oauth_states
ALTER TABLE public.social_oauth_states ENABLE ROW LEVEL SECURITY;

-- social_publication_jobs
ALTER TABLE public.social_publication_jobs ENABLE ROW LEVEL SECURITY;

-- social_publication_registrations
ALTER TABLE public.social_publication_registrations ENABLE ROW LEVEL SECURITY;

-- social_scheduler_cohort_items
ALTER TABLE public.social_scheduler_cohort_items ENABLE ROW LEVEL SECURITY;

-- social_scheduler_cohorts
ALTER TABLE public.social_scheduler_cohorts ENABLE ROW LEVEL SECURITY;

-- social_scheduler_events
ALTER TABLE public.social_scheduler_events ENABLE ROW LEVEL SECURITY;

-- sports
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;

-- stadium_features
ALTER TABLE public.stadium_features ENABLE ROW LEVEL SECURITY;

-- stadiums
ALTER TABLE public.stadiums ENABLE ROW LEVEL SECURITY;

-- standings
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;

-- story_events
ALTER TABLE public.story_events ENABLE ROW LEVEL SECURITY;

-- trade_items
ALTER TABLE public.trade_items ENABLE ROW LEVEL SECURITY;

-- trade_messages
ALTER TABLE public.trade_messages ENABLE ROW LEVEL SECURITY;

-- trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- waiver_claims
ALTER TABLE public.waiver_claims ENABLE ROW LEVEL SECURITY;

-- waiver_holds
ALTER TABLE public.waiver_holds ENABLE ROW LEVEL SECURITY;

-- weekly_awards
ALTER TABLE public.weekly_awards ENABLE ROW LEVEL SECURITY;

-- ===== policies: 88 object(s) =====
-- Query:
--   select (pol.tablename || '.' || pol.policyname)::text as ord,
--          format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
--                 pol.policyname, pol.tablename, pol.permissive, pol.cmd, array_to_string(pol.roles, ', '),
--                 case when pol.qual is not null then E'\n  USING (' || pol.qual || ')' else '' end,
--                 case when pol.with_check is not null then E'\n  WITH CHECK (' || pol.with_check || ')' else '' end) as text
--   from pg_policies pol
--   where pol.schemaname = 'public'

-- achievements.authenticated_read_achievements
CREATE POLICY authenticated_read_achievements ON public.achievements AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- athlete_game_stats.authenticated_read_athlete_stats
CREATE POLICY authenticated_read_athlete_stats ON public.athlete_game_stats AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- athlete_provider_ids.authenticated_read_provider_ids
CREATE POLICY authenticated_read_provider_ids ON public.athlete_provider_ids AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- athletes.authenticated_read_athletes
CREATE POLICY authenticated_read_athletes ON public.athletes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- championships.member_read_championships
CREATE POLICY member_read_championships ON public.championships AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = championships.league_season_id) AND is_league_member(ls.league_id)))));

-- competition_seasons.authenticated_read_competition_seasons
CREATE POLICY authenticated_read_competition_seasons ON public.competition_seasons AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- competitions.authenticated_read_competitions
CREATE POLICY authenticated_read_competitions ON public.competitions AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- draft_corrections.draft_corrections_member_read
CREATE POLICY draft_corrections_member_read ON public.draft_corrections AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((drafts d
     JOIN league_seasons ls ON ((ls.id = d.league_season_id)))
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((d.id = draft_corrections.draft_id) AND (lm.user_id = auth.uid())))));

-- draft_historical_values.Members can read draft historical values
CREATE POLICY "Members can read draft historical values" ON public.draft_historical_values AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- draft_picks.league_members_read_draft_picks
CREATE POLICY league_members_read_draft_picks ON public.draft_picks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((drafts d
     JOIN league_seasons ls ON ((ls.id = d.league_season_id)))
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((d.id = draft_picks.draft_id) AND (lm.user_id = auth.uid())))));

-- draft_picks.member_read_draft_picks
CREATE POLICY member_read_draft_picks ON public.draft_picks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (drafts d
     JOIN league_seasons ls ON ((ls.id = d.league_season_id)))
  WHERE ((d.id = draft_picks.draft_id) AND is_league_member(ls.league_id)))));

-- draft_queues.draft_queue_owner_read
CREATE POLICY draft_queue_owner_read ON public.draft_queues AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (season_franchises sf
     JOIN franchise_owners fo ON ((fo.franchise_id = sf.franchise_id)))
  WHERE ((sf.id = draft_queues.season_franchise_id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))));

-- drafts.league_members_read_drafts
CREATE POLICY league_members_read_drafts ON public.drafts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = drafts.league_season_id) AND (lm.user_id = auth.uid())))));

-- drafts.member_read_drafts
CREATE POLICY member_read_drafts ON public.drafts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = drafts.league_season_id) AND is_league_member(ls.league_id)))));

-- fantasy_leagues.creator_delete_league
CREATE POLICY creator_delete_league ON public.fantasy_leagues AS PERMISSIVE FOR DELETE TO authenticated
  USING ((created_by = auth.uid()));

-- fantasy_leagues.creator_update_league
CREATE POLICY creator_update_league ON public.fantasy_leagues AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()))
  WITH CHECK ((created_by = auth.uid()));

-- fantasy_leagues.league_member_read_leagues
CREATE POLICY league_member_read_leagues ON public.fantasy_leagues AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_league_member(id));

-- fantasy_leagues.user_create_league
CREATE POLICY user_create_league ON public.fantasy_leagues AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()));

-- fantasy_player_market_values.fantasy_player_market_values_authenticated_read
CREATE POLICY fantasy_player_market_values_authenticated_read ON public.fantasy_player_market_values AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- fantasy_player_scores.member_read_player_scores
CREATE POLICY member_read_player_scores ON public.fantasy_player_scores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = fantasy_player_scores.league_season_id) AND is_league_member(ls.league_id)))));

-- fantasy_team_scores.member_read_team_scores
CREATE POLICY member_read_team_scores ON public.fantasy_team_scores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = fantasy_team_scores.league_season_id) AND is_league_member(ls.league_id)))));

-- feed_reactions.member_read_feed_reactions
CREATE POLICY member_read_feed_reactions ON public.feed_reactions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_feed_events e
  WHERE ((e.id = feed_reactions.event_id) AND is_league_member(e.league_id)))));

-- feed_reactions.own_manage_feed_reactions
CREATE POLICY own_manage_feed_reactions ON public.feed_reactions AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM league_feed_events e
  WHERE ((e.id = feed_reactions.event_id) AND is_league_member(e.league_id))))));

-- franchise_achievements.member_read_franchise_achievements
CREATE POLICY member_read_franchise_achievements ON public.franchise_achievements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM franchises f
  WHERE ((f.id = franchise_achievements.franchise_id) AND is_league_member(f.league_id)))));

-- franchise_owners.member_read_franchise_owners
CREATE POLICY member_read_franchise_owners ON public.franchise_owners AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM franchises f
  WHERE ((f.id = franchise_owners.franchise_id) AND is_league_member(f.league_id)))));

-- franchise_stadium_features.member_read_franchise_stadium_features
CREATE POLICY member_read_franchise_stadium_features ON public.franchise_stadium_features AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (stadiums s
     JOIN franchises f ON ((f.id = s.franchise_id)))
  WHERE ((s.id = franchise_stadium_features.stadium_id) AND is_league_member(f.league_id)))));

-- franchises.creator_create_franchise
CREATE POLICY creator_create_franchise ON public.franchises AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_league_member(league_id));

-- franchises.league_member_read_franchises
CREATE POLICY league_member_read_franchises ON public.franchises AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM league_members me
  WHERE ((me.league_id = franchises.league_id) AND (me.user_id = auth.uid())))));

-- franchises.owner_update_franchise
CREATE POLICY owner_update_franchise ON public.franchises AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM franchise_owners fo
  WHERE ((fo.franchise_id = franchises.id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))) OR (EXISTS ( SELECT 1
   FROM fantasy_leagues fl
  WHERE ((fl.id = franchises.league_id) AND (fl.created_by = auth.uid()))))));

-- generated_messages.member_read_generated_messages
CREATE POLICY member_read_generated_messages ON public.generated_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_league_member(league_id));

-- generated_messages.requester_insert_generated_messages
CREATE POLICY requester_insert_generated_messages ON public.generated_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((requested_by = auth.uid()) AND is_league_member(league_id)));

-- historical_backfill_runs.league members can read historical backfill runs
CREATE POLICY "league members can read historical backfill runs" ON public.historical_backfill_runs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = historical_backfill_runs.league_season_id) AND (lm.user_id = auth.uid())))));

-- historical_lineups.league members can read historical lineups
CREATE POLICY "league members can read historical lineups" ON public.historical_lineups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = historical_lineups.league_season_id) AND (lm.user_id = auth.uid())))));

-- league_feed_events.league_member_read_feed
CREATE POLICY league_member_read_feed ON public.league_feed_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM league_members me
  WHERE ((me.league_id = league_feed_events.league_id) AND (me.user_id = auth.uid())))));

-- league_feed_events.member_post_feed
CREATE POLICY member_post_feed ON public.league_feed_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((actor_user_id = auth.uid()) AND is_league_member(league_id)));

-- league_invites.league_invites_commissioner_delete
CREATE POLICY league_invites_commissioner_delete ON public.league_invites AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_members lm
  WHERE ((lm.league_id = league_invites.league_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role)))));

-- league_invites.league_invites_commissioner_insert
CREATE POLICY league_invites_commissioner_insert ON public.league_invites AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((invited_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM league_members lm
  WHERE ((lm.league_id = league_invites.league_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role))))));

-- league_invites.league_invites_commissioner_select
CREATE POLICY league_invites_commissioner_select ON public.league_invites AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM league_members lm
  WHERE ((lm.league_id = league_invites.league_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role)))) OR (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))));

-- league_invites.league_invites_commissioner_update
CREATE POLICY league_invites_commissioner_update ON public.league_invites AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM league_members lm
  WHERE ((lm.league_id = league_invites.league_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role)))) OR (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM league_members lm
  WHERE ((lm.league_id = league_invites.league_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role)))) OR (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))));

-- league_members.creator_add_members
CREATE POLICY creator_add_members ON public.league_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM fantasy_leagues fl
  WHERE ((fl.id = league_members.league_id) AND (fl.created_by = auth.uid())))) OR (user_id = auth.uid())));

-- league_members.creator_manage_members
CREATE POLICY creator_manage_members ON public.league_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM fantasy_leagues fl
  WHERE ((fl.id = league_members.league_id) AND (fl.created_by = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM fantasy_leagues fl
  WHERE ((fl.id = league_members.league_id) AND (fl.created_by = auth.uid())))));

-- league_members.creator_remove_members
CREATE POLICY creator_remove_members ON public.league_members AS PERMISSIVE FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM fantasy_leagues fl
  WHERE ((fl.id = league_members.league_id) AND (fl.created_by = auth.uid()))))));

-- league_members.league_member_read_members
CREATE POLICY league_member_read_members ON public.league_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_league_member(league_id));

-- league_news_stories.league members read editorial news
CREATE POLICY "league members read editorial news" ON public.league_news_stories AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_league_member(league_id));

-- league_seasons.creator_create_league_season
CREATE POLICY creator_create_league_season ON public.league_seasons AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM fantasy_leagues fl
  WHERE ((fl.id = league_seasons.league_id) AND (fl.created_by = auth.uid())))));

-- league_seasons.league_member_read_seasons
CREATE POLICY league_member_read_seasons ON public.league_seasons AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM league_members me
  WHERE ((me.league_id = league_seasons.league_id) AND (me.user_id = auth.uid())))));

-- lineup_move_audit.owners and commissioners read lineup audit
CREATE POLICY "owners and commissioners read lineup audit" ON public.lineup_move_audit AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (season_franchises sf
     JOIN franchise_owners fo ON ((fo.franchise_id = sf.franchise_id)))
  WHERE ((sf.id = lineup_move_audit.season_franchise_id) AND (fo.user_id = ( SELECT auth.uid() AS uid)) AND (fo.ends_on IS NULL)))) OR (EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = lineup_move_audit.league_season_id) AND (lm.user_id = ( SELECT auth.uid() AS uid)) AND (lm.role = 'commissioner'::member_role))))));

-- lineups.league_members_read_lineups
CREATE POLICY league_members_read_lineups ON public.lineups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((season_franchises sf
     JOIN league_seasons ls ON ((ls.id = sf.league_season_id)))
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((sf.id = lineups.season_franchise_id) AND (lm.user_id = auth.uid())))));

-- lineups.member_read_lineups
CREATE POLICY member_read_lineups ON public.lineups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (season_franchises sf
     JOIN league_seasons ls ON ((ls.id = sf.league_season_id)))
  WHERE ((sf.id = lineups.season_franchise_id) AND is_league_member(ls.league_id)))));

-- lineups.owner_manage_lineups
CREATE POLICY owner_manage_lineups ON public.lineups AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((season_franchises sf
     JOIN franchises f ON ((f.id = sf.franchise_id)))
     JOIN franchise_owners fo ON ((fo.franchise_id = f.id)))
  WHERE ((sf.id = lineups.season_franchise_id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((season_franchises sf
     JOIN franchises f ON ((f.id = sf.franchise_id)))
     JOIN franchise_owners fo ON ((fo.franchise_id = f.id)))
  WHERE ((sf.id = lineups.season_franchise_id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))));

-- live_scoring_runs.ops staff can read live scoring runs
CREATE POLICY "ops staff can read live scoring runs" ON public.live_scoring_runs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ops_staff_roles osr
  WHERE ((osr.user_id = auth.uid()) AND (osr.role = ANY (ARRAY['owner'::text, 'admin'::text, 'support'::text, 'it_staff'::text]))))));

-- matchups.league_members_read_matchups
CREATE POLICY league_members_read_matchups ON public.matchups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = matchups.league_season_id) AND (lm.user_id = auth.uid())))));

-- matchups.member_read_matchups
CREATE POLICY member_read_matchups ON public.matchups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = matchups.league_season_id) AND is_league_member(ls.league_id)))));

-- ops_audit_events.ops_audit_events_staff_read
CREATE POLICY ops_audit_events_staff_read ON public.ops_audit_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ops_staff_roles osr
  WHERE ((osr.user_id = auth.uid()) AND (osr.disabled_at IS NULL) AND (osr.role = ANY (ARRAY['super_admin'::text, 'ops_manager'::text, 'support'::text, 'read_only'::text]))))));

-- ops_staff_roles.ops_staff_roles_self_read
CREATE POLICY ops_staff_roles_self_read ON public.ops_staff_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) AND (disabled_at IS NULL)));

-- postseason_seeds.member_read_postseason_seeds
CREATE POLICY member_read_postseason_seeds ON public.postseason_seeds AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = postseason_seeds.league_season_id) AND is_league_member(ls.league_id)))));

-- real_games.authenticated_read_real_games
CREATE POLICY authenticated_read_real_games ON public.real_games AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- real_team_game_stats.authenticated_read_team_stats
CREATE POLICY authenticated_read_team_stats ON public.real_team_game_stats AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- real_teams.authenticated_read_real_teams
CREATE POLICY authenticated_read_real_teams ON public.real_teams AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- recap_matchup_moments.league members read recap moments
CREATE POLICY "league members read recap moments" ON public.recap_matchup_moments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = recap_matchup_moments.league_season_id) AND is_league_member(ls.league_id)))));

-- recap_renders.league_member_read_recap_renders
CREATE POLICY league_member_read_recap_renders ON public.recap_renders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (recap_scripts rs
     JOIN league_seasons ls ON ((ls.id = rs.league_season_id)))
  WHERE ((rs.id = recap_renders.recap_script_id) AND is_league_member(ls.league_id)))));

-- recap_scenes.league_member_read_recap_scenes
CREATE POLICY league_member_read_recap_scenes ON public.recap_scenes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (recap_scripts rs
     JOIN league_seasons ls ON ((ls.id = rs.league_season_id)))
  WHERE ((rs.id = recap_scenes.recap_script_id) AND is_league_member(ls.league_id)))));

-- recap_scripts.league_member_read_recap_scripts
CREATE POLICY league_member_read_recap_scripts ON public.recap_scripts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = recap_scripts.league_season_id) AND is_league_member(ls.league_id)))));

-- rivalries.rivalries_member_read
CREATE POLICY rivalries_member_read ON public.rivalries AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_members lm
  WHERE ((lm.league_id = rivalries.league_id) AND (lm.user_id = auth.uid())))));

-- roster_entries.member_read_roster
CREATE POLICY member_read_roster ON public.roster_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (season_franchises sf
     JOIN league_seasons ls ON ((ls.id = sf.league_season_id)))
  WHERE ((sf.id = roster_entries.season_franchise_id) AND is_league_member(ls.league_id)))));

-- roster_entries.owner_manage_roster
CREATE POLICY owner_manage_roster ON public.roster_entries AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((season_franchises sf
     JOIN franchises f ON ((f.id = sf.franchise_id)))
     JOIN franchise_owners fo ON ((fo.franchise_id = f.id)))
  WHERE ((sf.id = roster_entries.season_franchise_id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((season_franchises sf
     JOIN franchises f ON ((f.id = sf.franchise_id)))
     JOIN franchise_owners fo ON ((fo.franchise_id = f.id)))
  WHERE ((sf.id = roster_entries.season_franchise_id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))));

-- roster_integrity_audit.roster_integrity_audit_commissioner
CREATE POLICY roster_integrity_audit_commissioner ON public.roster_integrity_audit AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = roster_integrity_audit.league_season_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role)))));

-- roster_integrity_overrides.roster_integrity_overrides_visible
CREATE POLICY roster_integrity_overrides_visible ON public.roster_integrity_overrides AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (season_franchises sf
     JOIN franchise_owners fo ON ((fo.franchise_id = sf.franchise_id)))
  WHERE ((sf.id = roster_integrity_overrides.season_franchise_id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))) OR (EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = roster_integrity_overrides.league_season_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role))))));

-- roster_integrity_reviews.roster_integrity_reviews_visible
CREATE POLICY roster_integrity_reviews_visible ON public.roster_integrity_reviews AS PERMISSIVE FOR SELECT TO authenticated
  USING (((requested_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = roster_integrity_reviews.league_season_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role))))));

-- scoring_profiles.authenticated_read_scoring_profiles
CREATE POLICY authenticated_read_scoring_profiles ON public.scoring_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- season_franchises.member_read_season_franchises
CREATE POLICY member_read_season_franchises ON public.season_franchises AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = season_franchises.league_season_id) AND is_league_member(ls.league_id)))));

-- share_links.owner_read_share_links
CREATE POLICY owner_read_share_links ON public.share_links AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((recap_renders rr
     JOIN recap_scripts rs ON ((rs.id = rr.recap_script_id)))
     JOIN league_seasons ls ON ((ls.id = rs.league_season_id)))
  WHERE ((rr.id = share_links.recap_render_id) AND is_league_member(ls.league_id)))));

-- sports.authenticated_read_sports
CREATE POLICY authenticated_read_sports ON public.sports AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- stadium_features.authenticated_read_stadium_features
CREATE POLICY authenticated_read_stadium_features ON public.stadium_features AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- stadiums.member_read_stadiums
CREATE POLICY member_read_stadiums ON public.stadiums AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM franchises f
  WHERE ((f.id = stadiums.franchise_id) AND is_league_member(f.league_id)))));

-- standings.league_members_read_standings
CREATE POLICY league_members_read_standings ON public.standings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (league_seasons ls
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((ls.id = standings.league_season_id) AND (lm.user_id = auth.uid())))));

-- standings.member_read_standings
CREATE POLICY member_read_standings ON public.standings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = standings.league_season_id) AND is_league_member(ls.league_id)))));

-- story_events.member_insert_story_events
CREATE POLICY member_insert_story_events ON public.story_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_league_member(league_id));

-- story_events.member_read_story_events
CREATE POLICY member_read_story_events ON public.story_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_league_member(league_id));

-- trade_items.trade_participant_read_items
CREATE POLICY trade_participant_read_items ON public.trade_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM trades t
  WHERE ((t.id = trade_items.trade_id) AND ((EXISTS ( SELECT 1
           FROM (season_franchises a
             JOIN franchise_owners fa ON ((fa.franchise_id = a.franchise_id)))
          WHERE ((a.id = t.proposed_by_franchise_id) AND (fa.user_id = auth.uid()) AND (fa.ends_on IS NULL)))) OR (EXISTS ( SELECT 1
           FROM (season_franchises b
             JOIN franchise_owners fb ON ((fb.franchise_id = b.franchise_id)))
          WHERE ((b.id = t.proposed_to_franchise_id) AND (fb.user_id = auth.uid()) AND (fb.ends_on IS NULL)))))))));

-- trade_messages.trade_participant_insert_messages
CREATE POLICY trade_participant_insert_messages ON public.trade_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM trades t
  WHERE ((t.id = trade_messages.trade_id) AND (t.status = 'proposed'::text) AND ((EXISTS ( SELECT 1
           FROM (season_franchises a
             JOIN franchise_owners fa ON ((fa.franchise_id = a.franchise_id)))
          WHERE ((a.id = t.proposed_by_franchise_id) AND (fa.user_id = auth.uid()) AND (fa.ends_on IS NULL)))) OR (EXISTS ( SELECT 1
           FROM (season_franchises b
             JOIN franchise_owners fb ON ((fb.franchise_id = b.franchise_id)))
          WHERE ((b.id = t.proposed_to_franchise_id) AND (fb.user_id = auth.uid()) AND (fb.ends_on IS NULL))))))))));

-- trade_messages.trade_participant_read_messages
CREATE POLICY trade_participant_read_messages ON public.trade_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((((trades t
     JOIN season_franchises a ON ((a.id = t.proposed_by_franchise_id)))
     JOIN season_franchises b ON ((b.id = t.proposed_to_franchise_id)))
     JOIN franchise_owners fa ON ((fa.franchise_id = a.franchise_id)))
     JOIN franchise_owners fb ON ((fb.franchise_id = b.franchise_id)))
  WHERE ((t.id = trade_messages.trade_id) AND (((fa.user_id = auth.uid()) AND (fa.ends_on IS NULL)) OR ((fb.user_id = auth.uid()) AND (fb.ends_on IS NULL)))))));

-- trades.trade_participant_read_trades
CREATE POLICY trade_participant_read_trades ON public.trades AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (season_franchises a
     JOIN franchise_owners fa ON ((fa.franchise_id = a.franchise_id)))
  WHERE ((a.id = trades.proposed_by_franchise_id) AND (fa.user_id = auth.uid()) AND (fa.ends_on IS NULL)))) OR (EXISTS ( SELECT 1
   FROM (season_franchises b
     JOIN franchise_owners fb ON ((fb.franchise_id = b.franchise_id)))
  WHERE ((b.id = trades.proposed_to_franchise_id) AND (fb.user_id = auth.uid()) AND (fb.ends_on IS NULL))))));

-- user_profiles.profile_manage_self
CREATE POLICY profile_manage_self ON public.user_profiles AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

-- user_profiles.profile_read_authenticated
CREATE POLICY profile_read_authenticated ON public.user_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- waiver_claims.claimant_or_commissioner_read_waiver_claims
CREATE POLICY claimant_or_commissioner_read_waiver_claims ON public.waiver_claims AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (season_franchises sf
     JOIN franchise_owners fo ON ((fo.franchise_id = sf.franchise_id)))
  WHERE ((sf.id = waiver_claims.season_franchise_id) AND (fo.user_id = auth.uid()) AND (fo.ends_on IS NULL)))) OR (EXISTS ( SELECT 1
   FROM ((waiver_holds wh
     JOIN league_seasons ls ON ((ls.id = wh.league_season_id)))
     JOIN league_members lm ON ((lm.league_id = ls.league_id)))
  WHERE ((wh.id = waiver_claims.waiver_hold_id) AND (lm.user_id = auth.uid()) AND (lm.role = 'commissioner'::member_role))))));

-- waiver_holds.league_members_read_waiver_holds
CREATE POLICY league_members_read_waiver_holds ON public.waiver_holds AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = waiver_holds.league_season_id) AND is_league_member(ls.league_id)))));

-- weekly_awards.member_read_weekly_awards
CREATE POLICY member_read_weekly_awards ON public.weekly_awards AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM league_seasons ls
  WHERE ((ls.id = weekly_awards.league_season_id) AND is_league_member(ls.league_id)))));
