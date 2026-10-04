-- tables.sql — Tables (columns, defaults, NOT NULL, then PK / UNIQUE / CHECK / EXCLUDE / FK constraints) and views in schema public.
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== tables: 77 object(s) =====
-- Query:
--   select c.relname::text as ord,
--          format(E'CREATE TABLE public.%I (\n%s\n);', c.relname,
--            (select string_agg(
--                      format('  %I %s%s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
--                        case when a.attidentity <> '' then ' GENERATED ' || case a.attidentity when 'a' then 'ALWAYS' else 'BY DEFAULT' end || ' AS IDENTITY' else '' end,
--                        case when a.attgenerated <> '' then ' GENERATED ALWAYS AS (' || pg_get_expr(d.adbin, d.adrelid) || ') STORED'
--                             when d.adbin is not null then ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid)
--                             else '' end,
--                        case when a.attnotnull then ' NOT NULL' else '' end),
--                      E',\n' order by a.attnum)
--               from pg_attribute a
--               left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
--              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped))
--          || coalesce(E'\n' || (
--               select string_agg(
--                        format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', c.relname, con.conname, pg_get_constraintdef(con.oid)),
--                        E'\n' order by array_position(array['p','u','c','x','f'], con.contype::text), con.conname)
--                 from pg_constraint con
--                where con.conrelid = c.oid and con.contype::text in ('p','u','c','x','f')), '') as text
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind in ('r','p')

-- achievements
CREATE TABLE public.achievements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  description text,
  category text NOT NULL,
  unlock_rule jsonb DEFAULT '{}'::jsonb NOT NULL,
  active boolean DEFAULT true NOT NULL
);
ALTER TABLE public.achievements ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);
ALTER TABLE public.achievements ADD CONSTRAINT achievements_code_key UNIQUE (code);

-- athlete_game_stats
CREATE TABLE public.athlete_game_stats (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  athlete_id uuid NOT NULL,
  game_id uuid NOT NULL,
  raw_stats jsonb DEFAULT '{}'::jsonb NOT NULL,
  source_provider text NOT NULL,
  source_updated_at timestamp with time zone,
  ingested_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.athlete_game_stats ADD CONSTRAINT athlete_game_stats_pkey PRIMARY KEY (id);
ALTER TABLE public.athlete_game_stats ADD CONSTRAINT athlete_game_stats_athlete_id_game_id_source_provider_key UNIQUE (athlete_id, game_id, source_provider);
ALTER TABLE public.athlete_game_stats ADD CONSTRAINT athlete_game_stats_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.athlete_game_stats ADD CONSTRAINT athlete_game_stats_game_id_fkey FOREIGN KEY (game_id) REFERENCES real_games(id);

-- athlete_provider_ids
CREATE TABLE public.athlete_provider_ids (
  athlete_id uuid NOT NULL,
  provider text NOT NULL,
  provider_athlete_id text NOT NULL
);
ALTER TABLE public.athlete_provider_ids ADD CONSTRAINT athlete_provider_ids_pkey PRIMARY KEY (provider, provider_athlete_id);
ALTER TABLE public.athlete_provider_ids ADD CONSTRAINT athlete_provider_ids_athlete_id_provider_key UNIQUE (athlete_id, provider);
ALTER TABLE public.athlete_provider_ids ADD CONSTRAINT athlete_provider_ids_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;

-- athletes
CREATE TABLE public.athletes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  competition_id uuid NOT NULL,
  real_team_id uuid,
  display_name text NOT NULL,
  "position" text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  injury_status text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.athletes ADD CONSTRAINT athletes_pkey PRIMARY KEY (id);
ALTER TABLE public.athletes ADD CONSTRAINT athletes_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id);
ALTER TABLE public.athletes ADD CONSTRAINT athletes_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);

-- beta_feedback_analysis
CREATE TABLE public.beta_feedback_analysis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  submission_id uuid NOT NULL,
  category text NOT NULL,
  problem_statement text NOT NULL,
  user_requested_solution text,
  proposed_action text NOT NULL,
  severity smallint NOT NULL,
  churn_risk_score smallint NOT NULL,
  confidence numeric(4,3) NOT NULL,
  feature_candidate boolean DEFAULT false NOT NULL,
  cluster_key text NOT NULL,
  cluster_count integer DEFAULT 1 NOT NULL,
  review_status text DEFAULT 'pending'::text NOT NULL,
  implementation_proposal jsonb,
  analysis_version text DEFAULT 'heuristic-v1'::text NOT NULL,
  analyzed_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  support_recommended boolean DEFAULT false NOT NULL,
  support_reason text,
  support_summary text,
  support_response_draft text,
  support_disposition text DEFAULT 'none'::text NOT NULL
);
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_pkey PRIMARY KEY (id);
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_submission_id_key UNIQUE (submission_id);
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_category_check CHECK ((category = ANY (ARRAY['bug'::text, 'ux_confusion'::text, 'accessibility'::text, 'performance'::text, 'missing_feature'::text, 'feature_request'::text, 'data_scoring'::text, 'assistant_gm'::text, 'positive'::text, 'other'::text])));
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_churn_risk_score_check CHECK (((churn_risk_score >= 1) AND (churn_risk_score <= 5)));
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_cluster_count_check CHECK ((cluster_count > 0));
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'deferred'::text, 'investigate'::text])));
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_severity_check CHECK (((severity >= 1) AND (severity <= 5)));
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_support_disposition_check CHECK ((support_disposition = ANY (ARRAY['none'::text, 'recommended'::text, 'send_to_support'::text, 'resolved'::text])));
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.beta_feedback_analysis ADD CONSTRAINT beta_feedback_analysis_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES beta_feedback_submissions(id) ON DELETE CASCADE;

-- beta_feedback_review_events
CREATE TABLE public.beta_feedback_review_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  analysis_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.beta_feedback_review_events ADD CONSTRAINT beta_feedback_review_events_pkey PRIMARY KEY (id);
ALTER TABLE public.beta_feedback_review_events ADD CONSTRAINT beta_feedback_review_events_new_status_check CHECK ((new_status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'deferred'::text, 'investigate'::text])));
ALTER TABLE public.beta_feedback_review_events ADD CONSTRAINT beta_feedback_review_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.beta_feedback_review_events ADD CONSTRAINT beta_feedback_review_events_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES beta_feedback_analysis(id) ON DELETE CASCADE;

-- beta_feedback_submissions
CREATE TABLE public.beta_feedback_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  task_area text NOT NULL,
  outcome text NOT NULL,
  ease_rating smallint NOT NULL,
  happened text NOT NULL,
  expected text NOT NULL,
  frustration text,
  liked text,
  improvement text,
  missing_capability text,
  churn_risk text NOT NULL,
  disappointment text NOT NULL,
  nps_score smallint NOT NULL,
  page_path text,
  client_context jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_churn_risk_check CHECK ((churn_risk = ANY (ARRAY['definitely'::text, 'maybe'::text, 'probably_not'::text, 'no'::text])));
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_disappointment_check CHECK ((disappointment = ANY (ARRAY['very'::text, 'somewhat'::text, 'not'::text])));
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_ease_rating_check CHECK (((ease_rating >= 1) AND (ease_rating <= 5)));
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_nps_score_check CHECK (((nps_score >= 0) AND (nps_score <= 10)));
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_outcome_check CHECK ((outcome = ANY (ARRAY['easy_success'::text, 'confusing_success'::text, 'partial'::text, 'failed'::text])));
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_task_area_check CHECK ((task_area = ANY (ARRAY['create_join_league'::text, 'invite_people'::text, 'draft'::text, 'lineup'::text, 'matchup_score'::text, 'waivers'::text, 'trade'::text, 'assistant_gm'::text, 'standings'::text, 'locker_room'::text, 'accessibility'::text, 'other'::text])));
ALTER TABLE public.beta_feedback_submissions ADD CONSTRAINT beta_feedback_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- championships
CREATE TABLE public.championships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  bracket text NOT NULL,
  winner_season_franchise_id uuid NOT NULL,
  runner_up_season_franchise_id uuid,
  final_matchup_id uuid,
  awarded_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.championships ADD CONSTRAINT championships_pkey PRIMARY KEY (id);
ALTER TABLE public.championships ADD CONSTRAINT championships_league_season_id_bracket_key UNIQUE (league_season_id, bracket);
ALTER TABLE public.championships ADD CONSTRAINT championships_bracket_check CHECK ((bracket = ANY (ARRAY['championship'::text, 'redemption'::text])));
ALTER TABLE public.championships ADD CONSTRAINT championships_final_matchup_id_fkey FOREIGN KEY (final_matchup_id) REFERENCES matchups(id);
ALTER TABLE public.championships ADD CONSTRAINT championships_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.championships ADD CONSTRAINT championships_runner_up_season_franchise_id_fkey FOREIGN KEY (runner_up_season_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.championships ADD CONSTRAINT championships_winner_season_franchise_id_fkey FOREIGN KEY (winner_season_franchise_id) REFERENCES season_franchises(id);

-- competition_seasons
CREATE TABLE public.competition_seasons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  competition_id uuid NOT NULL,
  season_year integer NOT NULL,
  starts_on date,
  ends_on date,
  late_entry_cutoff_at timestamp with time zone
);
ALTER TABLE public.competition_seasons ADD CONSTRAINT competition_seasons_pkey PRIMARY KEY (id);
ALTER TABLE public.competition_seasons ADD CONSTRAINT competition_seasons_competition_id_season_year_key UNIQUE (competition_id, season_year);
ALTER TABLE public.competition_seasons ADD CONSTRAINT competition_seasons_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id);

-- competitions
CREATE TABLE public.competitions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sport_id uuid NOT NULL,
  level competition_level NOT NULL,
  gender text,
  code text NOT NULL,
  display_name text NOT NULL,
  active boolean DEFAULT true NOT NULL
);
ALTER TABLE public.competitions ADD CONSTRAINT competitions_pkey PRIMARY KEY (id);
ALTER TABLE public.competitions ADD CONSTRAINT competitions_code_key UNIQUE (code);
ALTER TABLE public.competitions ADD CONSTRAINT competitions_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES sports(id);

-- draft_corrections
CREATE TABLE public.draft_corrections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  draft_id uuid NOT NULL,
  draft_pick_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,
  before_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.draft_corrections ADD CONSTRAINT draft_corrections_pkey PRIMARY KEY (id);
ALTER TABLE public.draft_corrections ADD CONSTRAINT draft_corrections_action_check CHECK ((action = 'undo_pick'::text));
ALTER TABLE public.draft_corrections ADD CONSTRAINT draft_corrections_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
ALTER TABLE public.draft_corrections ADD CONSTRAINT draft_corrections_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE;
ALTER TABLE public.draft_corrections ADD CONSTRAINT draft_corrections_draft_pick_id_fkey FOREIGN KEY (draft_pick_id) REFERENCES draft_picks(id) ON DELETE CASCADE;

-- draft_historical_values
CREATE TABLE public.draft_historical_values (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  competition_id uuid NOT NULL,
  season_year integer NOT NULL,
  asset_type text NOT NULL,
  athlete_id uuid,
  real_team_id uuid,
  asset_key text GENERATED ALWAYS AS (COALESCE((athlete_id)::text, (real_team_id)::text)) STORED,
  "position" text NOT NULL,
  points numeric NOT NULL,
  games_played numeric,
  games_started numeric,
  source text NOT NULL,
  source_version text DEFAULT 'unknown'::text NOT NULL,
  raw_stats jsonb DEFAULT '{}'::jsonb NOT NULL,
  imported_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.draft_historical_values ADD CONSTRAINT draft_historical_values_pkey PRIMARY KEY (id);
ALTER TABLE public.draft_historical_values ADD CONSTRAINT draft_historical_values_asset_type_check CHECK ((asset_type = ANY (ARRAY['athlete'::text, 'team_defense'::text])));
ALTER TABLE public.draft_historical_values ADD CONSTRAINT draft_historical_values_one_asset CHECK ((((asset_type = 'athlete'::text) AND (athlete_id IS NOT NULL) AND (real_team_id IS NULL)) OR ((asset_type = 'team_defense'::text) AND (athlete_id IS NULL) AND (real_team_id IS NOT NULL))));
ALTER TABLE public.draft_historical_values ADD CONSTRAINT draft_historical_values_season_year_check CHECK (((season_year >= 1900) AND (season_year <= 2200)));
ALTER TABLE public.draft_historical_values ADD CONSTRAINT draft_historical_values_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE public.draft_historical_values ADD CONSTRAINT draft_historical_values_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;
ALTER TABLE public.draft_historical_values ADD CONSTRAINT draft_historical_values_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id) ON DELETE CASCADE;

-- draft_picks
CREATE TABLE public.draft_picks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  draft_id uuid NOT NULL,
  pick_number integer NOT NULL,
  round_number integer NOT NULL,
  round_pick integer NOT NULL,
  season_franchise_id uuid NOT NULL,
  athlete_id uuid,
  real_team_id uuid,
  is_auto_pick boolean DEFAULT false NOT NULL,
  picked_at timestamp with time zone
);
ALTER TABLE public.draft_picks ADD CONSTRAINT draft_picks_pkey PRIMARY KEY (id);
ALTER TABLE public.draft_picks ADD CONSTRAINT draft_picks_draft_id_pick_number_key UNIQUE (draft_id, pick_number);
ALTER TABLE public.draft_picks ADD CONSTRAINT draft_picks_check CHECK (((((athlete_id IS NOT NULL))::integer + ((real_team_id IS NOT NULL))::integer) <= 1));
ALTER TABLE public.draft_picks ADD CONSTRAINT draft_picks_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.draft_picks ADD CONSTRAINT draft_picks_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE;
ALTER TABLE public.draft_picks ADD CONSTRAINT draft_picks_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.draft_picks ADD CONSTRAINT draft_picks_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id);

-- draft_queues
CREATE TABLE public.draft_queues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  draft_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  athlete_id uuid,
  real_team_id uuid,
  queue_rank integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.draft_queues ADD CONSTRAINT draft_queues_pkey PRIMARY KEY (id);
ALTER TABLE public.draft_queues ADD CONSTRAINT draft_queues_check CHECK (((((athlete_id IS NOT NULL))::integer + ((real_team_id IS NOT NULL))::integer) = 1));
ALTER TABLE public.draft_queues ADD CONSTRAINT draft_queues_queue_rank_check CHECK ((queue_rank > 0));
ALTER TABLE public.draft_queues ADD CONSTRAINT draft_queues_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.draft_queues ADD CONSTRAINT draft_queues_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE;
ALTER TABLE public.draft_queues ADD CONSTRAINT draft_queues_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.draft_queues ADD CONSTRAINT draft_queues_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- drafts
CREATE TABLE public.drafts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  status text DEFAULT 'scheduled'::text NOT NULL,
  draft_type text DEFAULT 'snake'::text NOT NULL,
  rounds integer DEFAULT 15 NOT NULL,
  pick_seconds integer DEFAULT 90 NOT NULL,
  current_pick integer DEFAULT 0 NOT NULL,
  starts_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  current_pick_deadline_at timestamp with time zone,
  paused_at timestamp with time zone,
  paused_remaining_seconds integer
);
ALTER TABLE public.drafts ADD CONSTRAINT drafts_pkey PRIMARY KEY (id);
ALTER TABLE public.drafts ADD CONSTRAINT drafts_league_season_id_key UNIQUE (league_season_id);
ALTER TABLE public.drafts ADD CONSTRAINT drafts_draft_type_check CHECK ((draft_type = 'snake'::text));
ALTER TABLE public.drafts ADD CONSTRAINT drafts_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'paused'::text, 'complete'::text, 'completed'::text])));
ALTER TABLE public.drafts ADD CONSTRAINT drafts_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;

-- fantasy_leagues
CREATE TABLE public.fantasy_leagues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  draft_min_franchises integer DEFAULT 10 NOT NULL,
  max_franchises integer DEFAULT 10 NOT NULL
);
ALTER TABLE public.fantasy_leagues ADD CONSTRAINT fantasy_leagues_pkey PRIMARY KEY (id);
ALTER TABLE public.fantasy_leagues ADD CONSTRAINT fantasy_leagues_draft_min_franchises_check CHECK (((draft_min_franchises >= 2) AND (draft_min_franchises <= 20)));
ALTER TABLE public.fantasy_leagues ADD CONSTRAINT fantasy_leagues_max_franchises_check CHECK (((max_franchises >= 2) AND (max_franchises <= 20)));
ALTER TABLE public.fantasy_leagues ADD CONSTRAINT fantasy_leagues_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- fantasy_player_market_values
CREATE TABLE public.fantasy_player_market_values (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  competition_id uuid NOT NULL,
  season_year integer NOT NULL,
  athlete_id uuid NOT NULL,
  source text NOT NULL,
  scoring_format text NOT NULL,
  overall_rank integer,
  position_rank integer,
  adp numeric,
  projected_points numeric,
  percent_rostered numeric,
  percent_started numeric,
  raw_ranking jsonb DEFAULT '{}'::jsonb NOT NULL,
  raw_adp jsonb DEFAULT '{}'::jsonb NOT NULL,
  raw_projection jsonb DEFAULT '{}'::jsonb NOT NULL,
  imported_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_pkey PRIMARY KEY (id);
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_competition_id_season_year_ath_key UNIQUE (competition_id, season_year, athlete_id, source, scoring_format);
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_adp_check CHECK (((adp IS NULL) OR (adp > (0)::numeric)));
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_overall_rank_check CHECK (((overall_rank IS NULL) OR (overall_rank > 0)));
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_percent_rostered_check CHECK (((percent_rostered IS NULL) OR ((percent_rostered >= (0)::numeric) AND (percent_rostered <= (100)::numeric))));
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_percent_started_check CHECK (((percent_started IS NULL) OR ((percent_started >= (0)::numeric) AND (percent_started <= (100)::numeric))));
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_position_rank_check CHECK (((position_rank IS NULL) OR (position_rank > 0)));
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_season_year_check CHECK (((season_year >= 1900) AND (season_year <= 2200)));
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE public.fantasy_player_market_values ADD CONSTRAINT fantasy_player_market_values_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;

-- fantasy_player_scores
CREATE TABLE public.fantasy_player_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  game_id uuid NOT NULL,
  week integer NOT NULL,
  points numeric(8,2) NOT NULL,
  breakdown jsonb NOT NULL,
  calculated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.fantasy_player_scores ADD CONSTRAINT fantasy_player_scores_pkey PRIMARY KEY (id);
ALTER TABLE public.fantasy_player_scores ADD CONSTRAINT fantasy_player_scores_league_season_id_athlete_id_game_id_key UNIQUE (league_season_id, athlete_id, game_id);
ALTER TABLE public.fantasy_player_scores ADD CONSTRAINT fantasy_player_scores_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.fantasy_player_scores ADD CONSTRAINT fantasy_player_scores_game_id_fkey FOREIGN KEY (game_id) REFERENCES real_games(id);
ALTER TABLE public.fantasy_player_scores ADD CONSTRAINT fantasy_player_scores_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;

-- fantasy_team_scores
CREATE TABLE public.fantasy_team_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  real_team_id uuid NOT NULL,
  game_id uuid NOT NULL,
  week integer NOT NULL,
  points numeric(8,2) NOT NULL,
  breakdown jsonb NOT NULL,
  calculated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.fantasy_team_scores ADD CONSTRAINT fantasy_team_scores_pkey PRIMARY KEY (id);
ALTER TABLE public.fantasy_team_scores ADD CONSTRAINT fantasy_team_scores_league_season_id_real_team_id_game_id_key UNIQUE (league_season_id, real_team_id, game_id);
ALTER TABLE public.fantasy_team_scores ADD CONSTRAINT fantasy_team_scores_game_id_fkey FOREIGN KEY (game_id) REFERENCES real_games(id);
ALTER TABLE public.fantasy_team_scores ADD CONSTRAINT fantasy_team_scores_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.fantasy_team_scores ADD CONSTRAINT fantasy_team_scores_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);

-- feed_reactions
CREATE TABLE public.feed_reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reaction text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.feed_reactions ADD CONSTRAINT feed_reactions_pkey PRIMARY KEY (id);
ALTER TABLE public.feed_reactions ADD CONSTRAINT feed_reactions_event_id_user_id_reaction_key UNIQUE (event_id, user_id, reaction);
ALTER TABLE public.feed_reactions ADD CONSTRAINT feed_reactions_reaction_check CHECK (((char_length(reaction) >= 1) AND (char_length(reaction) <= 16)));
ALTER TABLE public.feed_reactions ADD CONSTRAINT feed_reactions_event_id_fkey FOREIGN KEY (event_id) REFERENCES league_feed_events(id) ON DELETE CASCADE;
ALTER TABLE public.feed_reactions ADD CONSTRAINT feed_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- franchise_achievements
CREATE TABLE public.franchise_achievements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  franchise_id uuid NOT NULL,
  league_season_id uuid,
  achievement_id uuid NOT NULL,
  week integer,
  earned_at timestamp with time zone DEFAULT now() NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.franchise_achievements ADD CONSTRAINT franchise_achievements_pkey PRIMARY KEY (id);
ALTER TABLE public.franchise_achievements ADD CONSTRAINT franchise_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES achievements(id);
ALTER TABLE public.franchise_achievements ADD CONSTRAINT franchise_achievements_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE CASCADE;
ALTER TABLE public.franchise_achievements ADD CONSTRAINT franchise_achievements_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE SET NULL;

-- franchise_owners
CREATE TABLE public.franchise_owners (
  franchise_id uuid NOT NULL,
  user_id uuid NOT NULL,
  starts_on date DEFAULT CURRENT_DATE NOT NULL,
  ends_on date
);
ALTER TABLE public.franchise_owners ADD CONSTRAINT franchise_owners_pkey PRIMARY KEY (franchise_id, user_id, starts_on);
ALTER TABLE public.franchise_owners ADD CONSTRAINT franchise_owners_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE CASCADE;
ALTER TABLE public.franchise_owners ADD CONSTRAINT franchise_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- franchise_stadium_features
CREATE TABLE public.franchise_stadium_features (
  stadium_id uuid NOT NULL,
  stadium_feature_id uuid NOT NULL,
  unlocked_at timestamp with time zone DEFAULT now() NOT NULL,
  source_achievement_id uuid
);
ALTER TABLE public.franchise_stadium_features ADD CONSTRAINT franchise_stadium_features_pkey PRIMARY KEY (stadium_id, stadium_feature_id);
ALTER TABLE public.franchise_stadium_features ADD CONSTRAINT franchise_stadium_features_source_achievement_id_fkey FOREIGN KEY (source_achievement_id) REFERENCES franchise_achievements(id) ON DELETE CASCADE;
ALTER TABLE public.franchise_stadium_features ADD CONSTRAINT franchise_stadium_features_stadium_feature_id_fkey FOREIGN KEY (stadium_feature_id) REFERENCES stadium_features(id);
ALTER TABLE public.franchise_stadium_features ADD CONSTRAINT franchise_stadium_features_stadium_id_fkey FOREIGN KEY (stadium_id) REFERENCES stadiums(id) ON DELETE CASCADE;

-- franchises
CREATE TABLE public.franchises (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  name text NOT NULL,
  abbreviation text,
  primary_color text,
  secondary_color text,
  established_year integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  avatar_key text DEFAULT 'classic'::text NOT NULL
);
ALTER TABLE public.franchises ADD CONSTRAINT franchises_pkey PRIMARY KEY (id);
ALTER TABLE public.franchises ADD CONSTRAINT franchises_league_id_name_key UNIQUE (league_id, name);
ALTER TABLE public.franchises ADD CONSTRAINT franchises_avatar_key_check CHECK ((avatar_key = ANY (ARRAY['classic'::text, 'crown'::text, 'tower'::text, 'orbit'::text])));
ALTER TABLE public.franchises ADD CONSTRAINT franchises_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;

-- generated_messages
CREATE TABLE public.generated_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  league_season_id uuid,
  source_event_id uuid,
  requested_by uuid,
  tone text NOT NULL,
  body text NOT NULL,
  provider text DEFAULT 'template'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  matchup_id uuid
);
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1200)));
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_tone_check CHECK ((tone = ANY (ARRAY['respect'::text, 'playful'::text, 'petty'::text, 'savage'::text, 'system'::text])));
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_matchup_id_fkey FOREIGN KEY (matchup_id) REFERENCES matchups(id) ON DELETE CASCADE;
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.generated_messages ADD CONSTRAINT generated_messages_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES story_events(id) ON DELETE SET NULL;

-- historical_backfill_runs
CREATE TABLE public.historical_backfill_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  simulated_weeks integer[] DEFAULT '{}'::integer[] NOT NULL,
  activation_week integer,
  algorithm_version text DEFAULT 'late_start_optimal_v1'::text NOT NULL,
  scoring_version text DEFAULT 'big_exec_half_ppr_6pt_pass_td_v1'::text NOT NULL,
  source_stat_version text,
  status text DEFAULT 'pending'::text NOT NULL,
  error text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);
ALTER TABLE public.historical_backfill_runs ADD CONSTRAINT historical_backfill_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.historical_backfill_runs ADD CONSTRAINT historical_backfill_runs_league_season_id_idempotency_key_key UNIQUE (league_season_id, idempotency_key);
ALTER TABLE public.historical_backfill_runs ADD CONSTRAINT historical_backfill_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'validation_failed'::text, 'complete'::text, 'cancelled'::text])));
ALTER TABLE public.historical_backfill_runs ADD CONSTRAINT historical_backfill_runs_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;

-- historical_dst_score_validation
CREATE TABLE public.historical_dst_score_validation (
  real_team_id uuid NOT NULL,
  game_id uuid NOT NULL,
  scoring_profile_id uuid NOT NULL,
  points_allowed integer NOT NULL,
  calculated_points numeric(10,2) NOT NULL,
  breakdown jsonb NOT NULL,
  validated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.historical_dst_score_validation ADD CONSTRAINT historical_dst_score_validation_pkey PRIMARY KEY (real_team_id, game_id, scoring_profile_id);
ALTER TABLE public.historical_dst_score_validation ADD CONSTRAINT historical_dst_score_validation_game_id_fkey FOREIGN KEY (game_id) REFERENCES real_games(id) ON DELETE CASCADE;
ALTER TABLE public.historical_dst_score_validation ADD CONSTRAINT historical_dst_score_validation_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id) ON DELETE CASCADE;
ALTER TABLE public.historical_dst_score_validation ADD CONSTRAINT historical_dst_score_validation_scoring_profile_id_fkey FOREIGN KEY (scoring_profile_id) REFERENCES scoring_profiles(id);

-- historical_fantasy_score_validation
CREATE TABLE public.historical_fantasy_score_validation (
  athlete_id uuid NOT NULL,
  game_id uuid NOT NULL,
  scoring_profile_id uuid NOT NULL,
  calculated_points numeric(10,2) NOT NULL,
  provider_standard_points numeric(10,2),
  provider_ppr_points numeric(10,2),
  expected_half_ppr_points numeric(10,2),
  delta numeric(10,2),
  breakdown jsonb NOT NULL,
  validated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.historical_fantasy_score_validation ADD CONSTRAINT historical_fantasy_score_validation_pkey PRIMARY KEY (athlete_id, game_id, scoring_profile_id);
ALTER TABLE public.historical_fantasy_score_validation ADD CONSTRAINT historical_fantasy_score_validation_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE public.historical_fantasy_score_validation ADD CONSTRAINT historical_fantasy_score_validation_game_id_fkey FOREIGN KEY (game_id) REFERENCES real_games(id) ON DELETE CASCADE;
ALTER TABLE public.historical_fantasy_score_validation ADD CONSTRAINT historical_fantasy_score_validation_scoring_profile_id_fkey FOREIGN KEY (scoring_profile_id) REFERENCES scoring_profiles(id);

-- historical_lineups
CREATE TABLE public.historical_lineups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  week integer NOT NULL,
  source text DEFAULT 'LATE_START_OPTIMAL'::text NOT NULL,
  algorithm_version text DEFAULT 'late_start_optimal_v1'::text NOT NULL,
  scoring_version text DEFAULT 'big_exec_half_ppr_6pt_pass_td_v1'::text NOT NULL,
  source_stat_version text,
  starters jsonb DEFAULT '[]'::jsonb NOT NULL,
  bench jsonb DEFAULT '[]'::jsonb NOT NULL,
  total_points numeric DEFAULT 0 NOT NULL,
  finalized_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.historical_lineups ADD CONSTRAINT historical_lineups_pkey PRIMARY KEY (id);
ALTER TABLE public.historical_lineups ADD CONSTRAINT historical_lineups_league_season_id_season_franchise_id_wee_key UNIQUE (league_season_id, season_franchise_id, week, source);
ALTER TABLE public.historical_lineups ADD CONSTRAINT historical_lineups_source_check CHECK ((source = 'LATE_START_OPTIMAL'::text));
ALTER TABLE public.historical_lineups ADD CONSTRAINT historical_lineups_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.historical_lineups ADD CONSTRAINT historical_lineups_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- league_feed_events
CREATE TABLE public.league_feed_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  season_id uuid,
  actor_user_id uuid,
  event_type text NOT NULL,
  body text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.league_feed_events ADD CONSTRAINT league_feed_events_pkey PRIMARY KEY (id);
ALTER TABLE public.league_feed_events ADD CONSTRAINT league_feed_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
ALTER TABLE public.league_feed_events ADD CONSTRAINT league_feed_events_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;
ALTER TABLE public.league_feed_events ADD CONSTRAINT league_feed_events_season_id_fkey FOREIGN KEY (season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;

-- league_invites
CREATE TABLE public.league_invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  email text,
  invite_token uuid DEFAULT gen_random_uuid() NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
  accepted_by uuid,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.league_invites ADD CONSTRAINT league_invites_pkey PRIMARY KEY (id);
ALTER TABLE public.league_invites ADD CONSTRAINT league_invites_invite_token_key UNIQUE (invite_token);
ALTER TABLE public.league_invites ADD CONSTRAINT league_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])));
ALTER TABLE public.league_invites ADD CONSTRAINT league_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id);
ALTER TABLE public.league_invites ADD CONSTRAINT league_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
ALTER TABLE public.league_invites ADD CONSTRAINT league_invites_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;

-- league_members
CREATE TABLE public.league_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role member_role DEFAULT 'manager'::member_role NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.league_members ADD CONSTRAINT league_members_pkey PRIMARY KEY (id);
ALTER TABLE public.league_members ADD CONSTRAINT league_members_league_id_user_id_key UNIQUE (league_id, user_id);
ALTER TABLE public.league_members ADD CONSTRAINT league_members_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;
ALTER TABLE public.league_members ADD CONSTRAINT league_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- league_news_stories
CREATE TABLE public.league_news_stories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  league_season_id uuid,
  week integer,
  source_type text NOT NULL,
  source_key text NOT NULL,
  prominence text DEFAULT 'brief'::text NOT NULL,
  headline text NOT NULL,
  dek text NOT NULL,
  href text,
  facts jsonb DEFAULT '{}'::jsonb NOT NULL,
  published_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.league_news_stories ADD CONSTRAINT league_news_stories_pkey PRIMARY KEY (id);
ALTER TABLE public.league_news_stories ADD CONSTRAINT league_news_stories_league_id_source_type_source_key_key UNIQUE (league_id, source_type, source_key);
ALTER TABLE public.league_news_stories ADD CONSTRAINT league_news_stories_prominence_check CHECK ((prominence = ANY (ARRAY['headline'::text, 'brief'::text])));
ALTER TABLE public.league_news_stories ADD CONSTRAINT league_news_stories_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;
ALTER TABLE public.league_news_stories ADD CONSTRAINT league_news_stories_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;

-- league_seasons
CREATE TABLE public.league_seasons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  competition_season_id uuid NOT NULL,
  status text DEFAULT 'setup'::text NOT NULL,
  roster_config jsonb NOT NULL,
  scoring_profile_id uuid,
  trade_deadline_at timestamp with time zone,
  waiver_period_hours integer DEFAULT 48 NOT NULL,
  is_current boolean DEFAULT true NOT NULL,
  roster_integrity_mode text DEFAULT 'automatic'::text NOT NULL,
  roster_integrity_bulk_drop_limit integer DEFAULT 3 NOT NULL,
  roster_integrity_bulk_window_hours integer DEFAULT 24 NOT NULL,
  roster_integrity_protect_core_assets boolean DEFAULT true NOT NULL,
  roster_integrity_lock_eliminated boolean DEFAULT true NOT NULL,
  activation_week integer,
  late_start_status text DEFAULT 'FORMING'::text NOT NULL,
  backfill_started_at timestamp with time zone,
  backfill_completed_at timestamp with time zone
);
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_pkey PRIMARY KEY (id);
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_league_id_competition_season_id_key UNIQUE (league_id, competition_season_id);
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_late_start_status_check CHECK ((late_start_status = ANY (ARRAY['FORMING'::text, 'DRAFT_READY'::text, 'DRAFT_IN_PROGRESS'::text, 'BACKFILL_PENDING'::text, 'BACKFILLING'::text, 'BACKFILL_VALIDATION_FAILED'::text, 'READY_FOR_ACTIVATION'::text, 'ACTIVE'::text])));
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_roster_integrity_bulk_drop_limit_check CHECK (((roster_integrity_bulk_drop_limit >= 1) AND (roster_integrity_bulk_drop_limit <= 10)));
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_roster_integrity_bulk_window_hours_check CHECK (((roster_integrity_bulk_window_hours >= 1) AND (roster_integrity_bulk_window_hours <= 168)));
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_roster_integrity_mode_check CHECK ((roster_integrity_mode = ANY (ARRAY['automatic'::text, 'commissioner_review'::text, 'open'::text])));
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_waiver_period_hours_check CHECK (((waiver_period_hours >= 1) AND (waiver_period_hours <= 168)));
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_competition_season_id_fkey FOREIGN KEY (competition_season_id) REFERENCES competition_seasons(id);
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_scoring_profile_fk FOREIGN KEY (scoring_profile_id) REFERENCES scoring_profiles(id);

-- lineup_move_audit
CREATE TABLE public.lineup_move_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  actor_user_id uuid,
  week integer NOT NULL,
  slot lineup_slot NOT NULL,
  slot_index integer DEFAULT 1 NOT NULL,
  previous_athlete_id uuid,
  previous_real_team_id uuid,
  new_athlete_id uuid,
  new_real_team_id uuid,
  outcome text DEFAULT 'applied'::text NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_outcome_check CHECK ((outcome = ANY (ARRAY['applied'::text, 'restored'::text])));
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_week_check CHECK (((week >= 1) AND (week <= 18)));
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_new_athlete_id_fkey FOREIGN KEY (new_athlete_id) REFERENCES athletes(id);
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_new_real_team_id_fkey FOREIGN KEY (new_real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_previous_athlete_id_fkey FOREIGN KEY (previous_athlete_id) REFERENCES athletes(id);
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_previous_real_team_id_fkey FOREIGN KEY (previous_real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.lineup_move_audit ADD CONSTRAINT lineup_move_audit_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- lineups
CREATE TABLE public.lineups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  season_franchise_id uuid NOT NULL,
  week integer NOT NULL,
  athlete_id uuid,
  slot lineup_slot NOT NULL,
  locked_at timestamp with time zone,
  real_team_id uuid,
  slot_index integer DEFAULT 1 NOT NULL
);
ALTER TABLE public.lineups ADD CONSTRAINT lineups_pkey PRIMARY KEY (id);
ALTER TABLE public.lineups ADD CONSTRAINT lineups_season_franchise_id_week_athlete_id_key UNIQUE (season_franchise_id, week, athlete_id);
ALTER TABLE public.lineups ADD CONSTRAINT lineup_exactly_one_asset CHECK (((((athlete_id IS NOT NULL))::integer + ((real_team_id IS NOT NULL))::integer) = 1));
ALTER TABLE public.lineups ADD CONSTRAINT lineup_slot_index_check CHECK (((slot_index >= 1) AND (slot_index <= 2)));
ALTER TABLE public.lineups ADD CONSTRAINT lineups_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.lineups ADD CONSTRAINT lineups_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.lineups ADD CONSTRAINT lineups_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- live_scoring_runs
CREATE TABLE public.live_scoring_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  trigger_source text DEFAULT 'unknown'::text NOT NULL,
  status text DEFAULT 'running'::text NOT NULL,
  season_year integer,
  weeks integer[] DEFAULT '{}'::integer[] NOT NULL,
  provider_requests integer DEFAULT 0 NOT NULL,
  provider_games integer DEFAULT 0 NOT NULL,
  provider_stats integer DEFAULT 0 NOT NULL,
  real_games_touched integer DEFAULT 0 NOT NULL,
  athlete_stats_touched integer DEFAULT 0 NOT NULL,
  player_scores_touched integer DEFAULT 0 NOT NULL,
  team_scores_touched integer DEFAULT 0 NOT NULL,
  matchups_touched integer DEFAULT 0 NOT NULL,
  finalized_matchups integer DEFAULT 0 NOT NULL,
  unmatched_stats jsonb DEFAULT '[]'::jsonb NOT NULL,
  duplicate_stats jsonb DEFAULT '[]'::jsonb NOT NULL,
  summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  error text,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.live_scoring_runs ADD CONSTRAINT live_scoring_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.live_scoring_runs ADD CONSTRAINT live_scoring_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'complete'::text, 'skipped'::text, 'failed'::text])));
ALTER TABLE public.live_scoring_runs ADD CONSTRAINT live_scoring_runs_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['cron'::text, 'ops'::text, 'manual'::text, 'unknown'::text])));

-- matchups
CREATE TABLE public.matchups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  week integer NOT NULL,
  home_season_franchise_id uuid NOT NULL,
  away_season_franchise_id uuid NOT NULL,
  event_type text DEFAULT 'circuit'::text NOT NULL,
  home_points numeric(8,2) DEFAULT 0 NOT NULL,
  away_points numeric(8,2) DEFAULT 0 NOT NULL,
  winner_season_franchise_id uuid,
  is_final boolean DEFAULT false NOT NULL,
  context jsonb DEFAULT '{}'::jsonb NOT NULL,
  result_source text DEFAULT 'LIVE'::text NOT NULL,
  simulated_reason text,
  result_published_at timestamp with time zone
);
ALTER TABLE public.matchups ADD CONSTRAINT matchups_pkey PRIMARY KEY (id);
ALTER TABLE public.matchups ADD CONSTRAINT matchups_league_season_id_week_away_season_franchise_id_key UNIQUE (league_season_id, week, away_season_franchise_id);
ALTER TABLE public.matchups ADD CONSTRAINT matchups_league_season_id_week_home_season_franchise_id_key UNIQUE (league_season_id, week, home_season_franchise_id);
ALTER TABLE public.matchups ADD CONSTRAINT matchups_result_source_check CHECK ((result_source = ANY (ARRAY['LIVE'::text, 'SIMULATED_LATE_START'::text, 'ADMIN_RESCORE'::text])));
ALTER TABLE public.matchups ADD CONSTRAINT matchups_away_season_franchise_id_fkey FOREIGN KEY (away_season_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.matchups ADD CONSTRAINT matchups_home_season_franchise_id_fkey FOREIGN KEY (home_season_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.matchups ADD CONSTRAINT matchups_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.matchups ADD CONSTRAINT matchups_winner_season_franchise_id_fkey FOREIGN KEY (winner_season_franchise_id) REFERENCES season_franchises(id);

-- ops_audit_events
CREATE TABLE public.ops_audit_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.ops_audit_events ADD CONSTRAINT ops_audit_events_pkey PRIMARY KEY (id);
ALTER TABLE public.ops_audit_events ADD CONSTRAINT ops_audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ops_staff_roles
CREATE TABLE public.ops_staff_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  disabled_at timestamp with time zone
);
ALTER TABLE public.ops_staff_roles ADD CONSTRAINT ops_staff_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.ops_staff_roles ADD CONSTRAINT ops_staff_roles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'ops_manager'::text, 'support'::text, 'content_manager'::text, 'it_staff'::text, 'read_only'::text])));
ALTER TABLE public.ops_staff_roles ADD CONSTRAINT ops_staff_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.ops_staff_roles ADD CONSTRAINT ops_staff_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- postseason_seeds
CREATE TABLE public.postseason_seeds (
  league_season_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  seed integer NOT NULL,
  bracket text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.postseason_seeds ADD CONSTRAINT postseason_seeds_pkey PRIMARY KEY (league_season_id, season_franchise_id);
ALTER TABLE public.postseason_seeds ADD CONSTRAINT postseason_seeds_league_season_id_seed_key UNIQUE (league_season_id, seed);
ALTER TABLE public.postseason_seeds ADD CONSTRAINT postseason_seeds_bracket_check CHECK ((bracket = ANY (ARRAY['championship'::text, 'redemption'::text])));
ALTER TABLE public.postseason_seeds ADD CONSTRAINT postseason_seeds_seed_check CHECK (((seed >= 1) AND (seed <= 10)));
ALTER TABLE public.postseason_seeds ADD CONSTRAINT postseason_seeds_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.postseason_seeds ADD CONSTRAINT postseason_seeds_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- qa_fixture_leagues
CREATE TABLE public.qa_fixture_leagues (
  fixture_key text NOT NULL,
  league_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.qa_fixture_leagues ADD CONSTRAINT qa_fixture_leagues_pkey PRIMARY KEY (fixture_key);
ALTER TABLE public.qa_fixture_leagues ADD CONSTRAINT qa_fixture_leagues_league_id_key UNIQUE (league_id);
ALTER TABLE public.qa_fixture_leagues ADD CONSTRAINT qa_fixture_leagues_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;

-- qa_fixture_users
CREATE TABLE public.qa_fixture_users (
  fixture_key text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.qa_fixture_users ADD CONSTRAINT qa_fixture_users_pkey PRIMARY KEY (user_id);
ALTER TABLE public.qa_fixture_users ADD CONSTRAINT qa_fixture_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- real_games
CREATE TABLE public.real_games (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  competition_season_id uuid NOT NULL,
  provider_game_id text,
  week integer,
  home_team_id uuid,
  away_team_id uuid,
  starts_at timestamp with time zone NOT NULL,
  state game_state DEFAULT 'scheduled'::game_state NOT NULL,
  home_score integer,
  away_score integer,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.real_games ADD CONSTRAINT real_games_pkey PRIMARY KEY (id);
ALTER TABLE public.real_games ADD CONSTRAINT real_games_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES real_teams(id);
ALTER TABLE public.real_games ADD CONSTRAINT real_games_competition_season_id_fkey FOREIGN KEY (competition_season_id) REFERENCES competition_seasons(id);
ALTER TABLE public.real_games ADD CONSTRAINT real_games_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES real_teams(id);

-- real_team_game_stats
CREATE TABLE public.real_team_game_stats (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  real_team_id uuid NOT NULL,
  game_id uuid NOT NULL,
  raw_stats jsonb DEFAULT '{}'::jsonb NOT NULL,
  source_provider text NOT NULL,
  source_updated_at timestamp with time zone,
  ingested_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.real_team_game_stats ADD CONSTRAINT real_team_game_stats_pkey PRIMARY KEY (id);
ALTER TABLE public.real_team_game_stats ADD CONSTRAINT real_team_game_stats_real_team_id_game_id_source_provider_key UNIQUE (real_team_id, game_id, source_provider);
ALTER TABLE public.real_team_game_stats ADD CONSTRAINT real_team_game_stats_game_id_fkey FOREIGN KEY (game_id) REFERENCES real_games(id);
ALTER TABLE public.real_team_game_stats ADD CONSTRAINT real_team_game_stats_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);

-- real_teams
CREATE TABLE public.real_teams (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  competition_id uuid NOT NULL,
  display_name text NOT NULL,
  abbreviation text,
  active boolean DEFAULT true NOT NULL
);
ALTER TABLE public.real_teams ADD CONSTRAINT real_teams_pkey PRIMARY KEY (id);
ALTER TABLE public.real_teams ADD CONSTRAINT real_teams_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id);

-- recap_matchup_moments
CREATE TABLE public.recap_matchup_moments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  matchup_id uuid NOT NULL,
  week integer NOT NULL,
  story_score numeric NOT NULL,
  selection_reason text NOT NULL,
  title text NOT NULL,
  facts jsonb DEFAULT '{}'::jsonb NOT NULL,
  captured_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.recap_matchup_moments ADD CONSTRAINT recap_matchup_moments_pkey PRIMARY KEY (id);
ALTER TABLE public.recap_matchup_moments ADD CONSTRAINT recap_matchup_moments_matchup_id_key UNIQUE (matchup_id);
ALTER TABLE public.recap_matchup_moments ADD CONSTRAINT recap_matchup_moments_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.recap_matchup_moments ADD CONSTRAINT recap_matchup_moments_matchup_id_fkey FOREIGN KEY (matchup_id) REFERENCES matchups(id) ON DELETE CASCADE;

-- recap_renders
CREATE TABLE public.recap_renders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recap_script_id uuid NOT NULL,
  aspect_ratio text DEFAULT '16:9'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  storage_key text,
  bytes bigint,
  duration_ms integer,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  renderer_provider text DEFAULT 'self_hosted'::text NOT NULL,
  provider_job_id text,
  worker_id text,
  attempts integer DEFAULT 0 NOT NULL,
  started_at timestamp with time zone
);
ALTER TABLE public.recap_renders ADD CONSTRAINT recap_renders_pkey PRIMARY KEY (id);
ALTER TABLE public.recap_renders ADD CONSTRAINT recap_renders_recap_script_id_aspect_ratio_key UNIQUE (recap_script_id, aspect_ratio);
ALTER TABLE public.recap_renders ADD CONSTRAINT recap_renders_aspect_ratio_check CHECK ((aspect_ratio = ANY (ARRAY['16:9'::text, '9:16'::text])));
ALTER TABLE public.recap_renders ADD CONSTRAINT recap_renders_renderer_provider_check CHECK ((renderer_provider = ANY (ARRAY['self_hosted'::text, 'managed'::text])));
ALTER TABLE public.recap_renders ADD CONSTRAINT recap_renders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rendering'::text, 'ready'::text, 'failed'::text])));
ALTER TABLE public.recap_renders ADD CONSTRAINT recap_renders_recap_script_id_fkey FOREIGN KEY (recap_script_id) REFERENCES recap_scripts(id) ON DELETE CASCADE;

-- recap_scenes
CREATE TABLE public.recap_scenes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recap_script_id uuid NOT NULL,
  scene_index integer NOT NULL,
  scene_kind text NOT NULL,
  duration_ms integer DEFAULT 5000 NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.recap_scenes ADD CONSTRAINT recap_scenes_pkey PRIMARY KEY (id);
ALTER TABLE public.recap_scenes ADD CONSTRAINT recap_scenes_recap_script_id_scene_index_key UNIQUE (recap_script_id, scene_index);
ALTER TABLE public.recap_scenes ADD CONSTRAINT recap_scenes_duration_ms_check CHECK (((duration_ms >= 1000) AND (duration_ms <= 15000)));
ALTER TABLE public.recap_scenes ADD CONSTRAINT recap_scenes_recap_script_id_fkey FOREIGN KEY (recap_script_id) REFERENCES recap_scripts(id) ON DELETE CASCADE;

-- recap_scripts
CREATE TABLE public.recap_scripts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matchup_id uuid,
  league_season_id uuid NOT NULL,
  winner_season_franchise_id uuid,
  loser_season_franchise_id uuid,
  title text NOT NULL,
  summary text NOT NULL,
  format_version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  recap_kind text DEFAULT 'matchup'::text NOT NULL,
  week integer,
  story_score numeric,
  selection_reason text
);
ALTER TABLE public.recap_scripts ADD CONSTRAINT recap_scripts_pkey PRIMARY KEY (id);
ALTER TABLE public.recap_scripts ADD CONSTRAINT recap_scripts_matchup_id_key UNIQUE (matchup_id);
ALTER TABLE public.recap_scripts ADD CONSTRAINT recap_scripts_recap_kind_check CHECK ((recap_kind = ANY (ARRAY['matchup'::text, 'league_week'::text])));
ALTER TABLE public.recap_scripts ADD CONSTRAINT recap_scripts_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.recap_scripts ADD CONSTRAINT recap_scripts_loser_season_franchise_id_fkey FOREIGN KEY (loser_season_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.recap_scripts ADD CONSTRAINT recap_scripts_matchup_id_fkey FOREIGN KEY (matchup_id) REFERENCES matchups(id) ON DELETE CASCADE;
ALTER TABLE public.recap_scripts ADD CONSTRAINT recap_scripts_winner_season_franchise_id_fkey FOREIGN KEY (winner_season_franchise_id) REFERENCES season_franchises(id);

-- rivalries
CREATE TABLE public.rivalries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  franchise_a_id uuid NOT NULL,
  franchise_b_id uuid NOT NULL,
  designated boolean DEFAULT false NOT NULL,
  rivalry_score numeric(8,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.rivalries ADD CONSTRAINT rivalries_pkey PRIMARY KEY (id);
ALTER TABLE public.rivalries ADD CONSTRAINT rivalries_check CHECK ((franchise_a_id <> franchise_b_id));
ALTER TABLE public.rivalries ADD CONSTRAINT rivalries_franchise_a_id_fkey FOREIGN KEY (franchise_a_id) REFERENCES franchises(id) ON DELETE CASCADE;
ALTER TABLE public.rivalries ADD CONSTRAINT rivalries_franchise_b_id_fkey FOREIGN KEY (franchise_b_id) REFERENCES franchises(id) ON DELETE CASCADE;
ALTER TABLE public.rivalries ADD CONSTRAINT rivalries_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;

-- roster_entries
CREATE TABLE public.roster_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  season_franchise_id uuid NOT NULL,
  athlete_id uuid,
  acquired_via text NOT NULL,
  added_at timestamp with time zone DEFAULT now() NOT NULL,
  dropped_at timestamp with time zone,
  real_team_id uuid
);
ALTER TABLE public.roster_entries ADD CONSTRAINT roster_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.roster_entries ADD CONSTRAINT roster_entries_season_franchise_id_athlete_id_added_at_key UNIQUE (season_franchise_id, athlete_id, added_at);
ALTER TABLE public.roster_entries ADD CONSTRAINT roster_entry_exactly_one_asset CHECK (((((athlete_id IS NOT NULL))::integer + ((real_team_id IS NOT NULL))::integer) = 1));
ALTER TABLE public.roster_entries ADD CONSTRAINT roster_entries_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.roster_entries ADD CONSTRAINT roster_entries_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.roster_entries ADD CONSTRAINT roster_entries_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- roster_integrity_audit
CREATE TABLE public.roster_integrity_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  season_franchise_id uuid,
  roster_entry_id uuid,
  actor_id uuid,
  event_type text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.roster_integrity_audit ADD CONSTRAINT roster_integrity_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.roster_integrity_audit ADD CONSTRAINT roster_integrity_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE public.roster_integrity_audit ADD CONSTRAINT roster_integrity_audit_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.roster_integrity_audit ADD CONSTRAINT roster_integrity_audit_roster_entry_id_fkey FOREIGN KEY (roster_entry_id) REFERENCES roster_entries(id) ON DELETE SET NULL;
ALTER TABLE public.roster_integrity_audit ADD CONSTRAINT roster_integrity_audit_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- roster_integrity_overrides
CREATE TABLE public.roster_integrity_overrides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  roster_entry_id uuid NOT NULL,
  review_id uuid,
  approved_by uuid NOT NULL,
  approved_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
  consumed_at timestamp with time zone,
  note text
);
ALTER TABLE public.roster_integrity_overrides ADD CONSTRAINT roster_integrity_overrides_pkey PRIMARY KEY (id);
ALTER TABLE public.roster_integrity_overrides ADD CONSTRAINT roster_integrity_overrides_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
ALTER TABLE public.roster_integrity_overrides ADD CONSTRAINT roster_integrity_overrides_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.roster_integrity_overrides ADD CONSTRAINT roster_integrity_overrides_review_id_fkey FOREIGN KEY (review_id) REFERENCES roster_integrity_reviews(id) ON DELETE SET NULL;
ALTER TABLE public.roster_integrity_overrides ADD CONSTRAINT roster_integrity_overrides_roster_entry_id_fkey FOREIGN KEY (roster_entry_id) REFERENCES roster_entries(id) ON DELETE CASCADE;
ALTER TABLE public.roster_integrity_overrides ADD CONSTRAINT roster_integrity_overrides_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- roster_integrity_reviews
CREATE TABLE public.roster_integrity_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  roster_entry_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason_code text NOT NULL,
  reason_detail text NOT NULL,
  manager_note text,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  decision_note text
);
ALTER TABLE public.roster_integrity_reviews ADD CONSTRAINT roster_integrity_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.roster_integrity_reviews ADD CONSTRAINT roster_integrity_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.roster_integrity_reviews ADD CONSTRAINT roster_integrity_reviews_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.roster_integrity_reviews ADD CONSTRAINT roster_integrity_reviews_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.roster_integrity_reviews ADD CONSTRAINT roster_integrity_reviews_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
ALTER TABLE public.roster_integrity_reviews ADD CONSTRAINT roster_integrity_reviews_roster_entry_id_fkey FOREIGN KEY (roster_entry_id) REFERENCES roster_entries(id) ON DELETE CASCADE;
ALTER TABLE public.roster_integrity_reviews ADD CONSTRAINT roster_integrity_reviews_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- scoring_profiles
CREATE TABLE public.scoring_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  sport sport_code NOT NULL,
  rules jsonb NOT NULL,
  is_system_default boolean DEFAULT false NOT NULL
);
ALTER TABLE public.scoring_profiles ADD CONSTRAINT scoring_profiles_pkey PRIMARY KEY (id);

-- season_franchises
CREATE TABLE public.season_franchises (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  franchise_id uuid NOT NULL,
  draft_position integer,
  roster_locked_at timestamp with time zone,
  roster_lock_reason text
);
ALTER TABLE public.season_franchises ADD CONSTRAINT season_franchises_pkey PRIMARY KEY (id);
ALTER TABLE public.season_franchises ADD CONSTRAINT season_franchises_league_season_id_franchise_id_key UNIQUE (league_season_id, franchise_id);
ALTER TABLE public.season_franchises ADD CONSTRAINT season_franchises_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE CASCADE;
ALTER TABLE public.season_franchises ADD CONSTRAINT season_franchises_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;

-- share_links
CREATE TABLE public.share_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recap_render_id uuid NOT NULL,
  token text DEFAULT encode(gen_random_bytes(18), 'hex'::text) NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone
);
ALTER TABLE public.share_links ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);
ALTER TABLE public.share_links ADD CONSTRAINT share_links_token_key UNIQUE (token);
ALTER TABLE public.share_links ADD CONSTRAINT share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.share_links ADD CONSTRAINT share_links_recap_render_id_fkey FOREIGN KEY (recap_render_id) REFERENCES recap_renders(id) ON DELETE CASCADE;

-- social_oauth_connections
CREATE TABLE public.social_oauth_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  platform text NOT NULL,
  platform_account_id text NOT NULL,
  username text,
  display_name text,
  connection_status text DEFAULT 'CONNECTED'::text NOT NULL,
  granted_scopes text[] DEFAULT '{}'::text[] NOT NULL,
  token_type text,
  token_ciphertext text NOT NULL,
  token_iv text NOT NULL,
  token_auth_tag text NOT NULL,
  issued_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  last_refresh_at timestamp with time zone,
  safe_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.social_oauth_connections ADD CONSTRAINT social_oauth_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.social_oauth_connections ADD CONSTRAINT social_oauth_connections_provider_platform_platform_account_key UNIQUE (provider, platform, platform_account_id);

-- social_oauth_states
CREATE TABLE public.social_oauth_states (
  state_hash text NOT NULL,
  provider text NOT NULL,
  platform text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.social_oauth_states ADD CONSTRAINT social_oauth_states_pkey PRIMARY KEY (state_hash);

-- social_publication_jobs
CREATE TABLE public.social_publication_jobs (
  publishing_job_id text NOT NULL,
  cohort_id text NOT NULL,
  content_artifact_id text NOT NULL,
  platform text NOT NULL,
  account_reference text NOT NULL,
  scheduled_at_utc timestamp with time zone NOT NULL,
  approved_copy_hash text NOT NULL,
  state text DEFAULT 'prepared'::text NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  provider text DEFAULT 'native_threads'::text NOT NULL,
  provider_job_id text,
  platform_post_id text,
  post_url text,
  last_error text,
  irreversible_request_started_at timestamp with time zone,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.social_publication_jobs ADD CONSTRAINT social_publication_jobs_pkey PRIMARY KEY (publishing_job_id);
ALTER TABLE public.social_publication_jobs ADD CONSTRAINT social_publication_jobs_cohort_id_content_artifact_id_key UNIQUE (cohort_id, content_artifact_id);
ALTER TABLE public.social_publication_jobs ADD CONSTRAINT social_publication_jobs_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES social_scheduler_cohorts(cohort_id);

-- social_publication_registrations
CREATE TABLE public.social_publication_registrations (
  publication_id text NOT NULL,
  publishing_job_id text NOT NULL,
  content_artifact_id text NOT NULL,
  platform text NOT NULL,
  account_reference text NOT NULL,
  provider text DEFAULT 'native_threads'::text NOT NULL,
  platform_post_id text NOT NULL,
  post_url text,
  requested_schedule_at_utc timestamp with time zone NOT NULL,
  published_at timestamp with time zone NOT NULL,
  approved_copy_hash text NOT NULL,
  actually_published_copy text,
  origin text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.social_publication_registrations ADD CONSTRAINT social_publication_registrations_pkey PRIMARY KEY (publication_id);
ALTER TABLE public.social_publication_registrations ADD CONSTRAINT social_publication_registrati_platform_account_reference_co_key UNIQUE (platform, account_reference, content_artifact_id);
ALTER TABLE public.social_publication_registrations ADD CONSTRAINT social_publication_registrations_provider_platform_post_id_key UNIQUE (provider, platform_post_id);
ALTER TABLE public.social_publication_registrations ADD CONSTRAINT social_publication_registrations_publishing_job_id_key UNIQUE (publishing_job_id);
ALTER TABLE public.social_publication_registrations ADD CONSTRAINT social_publication_registrations_publishing_job_id_fkey FOREIGN KEY (publishing_job_id) REFERENCES social_publication_jobs(publishing_job_id);

-- social_scheduler_cohort_items
CREATE TABLE public.social_scheduler_cohort_items (
  cohort_id text NOT NULL,
  content_artifact_id text NOT NULL,
  source_tab text NOT NULL,
  source_row_reference text NOT NULL,
  source_row_number integer NOT NULL,
  approved_copy_hash text NOT NULL,
  approved_copy_source text NOT NULL,
  origin text NOT NULL,
  scheduled_local_datetime text NOT NULL,
  scheduled_at_utc timestamp with time zone NOT NULL,
  platform text NOT NULL,
  account_reference text NOT NULL,
  timezone text NOT NULL,
  status text DEFAULT 'prepared'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  approved_copy_text text
);
ALTER TABLE public.social_scheduler_cohort_items ADD CONSTRAINT social_scheduler_cohort_items_pkey PRIMARY KEY (cohort_id, content_artifact_id);
ALTER TABLE public.social_scheduler_cohort_items ADD CONSTRAINT social_scheduler_cohort_items_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES social_scheduler_cohorts(cohort_id) ON DELETE CASCADE;

-- social_scheduler_cohorts
CREATE TABLE public.social_scheduler_cohorts (
  cohort_id text NOT NULL,
  platform text NOT NULL,
  account_reference text NOT NULL,
  status text DEFAULT 'prepared'::text NOT NULL,
  scheduler_enabled boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.social_scheduler_cohorts ADD CONSTRAINT social_scheduler_cohorts_pkey PRIMARY KEY (cohort_id);

-- social_scheduler_events
CREATE TABLE public.social_scheduler_events (
  id bigint DEFAULT nextval('social_scheduler_events_id_seq'::regclass) NOT NULL,
  event_time timestamp with time zone DEFAULT now() NOT NULL,
  cohort_id text,
  publishing_job_id text,
  content_artifact_id text,
  event_type text NOT NULL,
  normalized_status text NOT NULL,
  safe_account_reference text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.social_scheduler_events ADD CONSTRAINT social_scheduler_events_pkey PRIMARY KEY (id);

-- sports
CREATE TABLE public.sports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code sport_code NOT NULL,
  display_name text NOT NULL
);
ALTER TABLE public.sports ADD CONSTRAINT sports_pkey PRIMARY KEY (id);
ALTER TABLE public.sports ADD CONSTRAINT sports_code_key UNIQUE (code);

-- stadium_features
CREATE TABLE public.stadium_features (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  zone text NOT NULL,
  achievement_code text,
  asset_key text,
  active boolean DEFAULT true NOT NULL
);
ALTER TABLE public.stadium_features ADD CONSTRAINT stadium_features_pkey PRIMARY KEY (id);
ALTER TABLE public.stadium_features ADD CONSTRAINT stadium_features_code_key UNIQUE (code);
ALTER TABLE public.stadium_features ADD CONSTRAINT stadium_features_zone_check CHECK ((zone = ANY (ARRAY['exterior'::text, 'field'::text, 'rafters'::text, 'entrance'::text])));

-- stadiums
CREATE TABLE public.stadiums (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  franchise_id uuid NOT NULL,
  environment_key text DEFAULT 'starter'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.stadiums ADD CONSTRAINT stadiums_pkey PRIMARY KEY (id);
ALTER TABLE public.stadiums ADD CONSTRAINT stadiums_franchise_id_key UNIQUE (franchise_id);
ALTER TABLE public.stadiums ADD CONSTRAINT stadiums_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE CASCADE;

-- standings
CREATE TABLE public.standings (
  league_season_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  wins integer DEFAULT 0 NOT NULL,
  losses integer DEFAULT 0 NOT NULL,
  ties integer DEFAULT 0 NOT NULL,
  points_for numeric(10,2) DEFAULT 0 NOT NULL,
  points_against numeric(10,2) DEFAULT 0 NOT NULL,
  streak integer DEFAULT 0 NOT NULL
);
ALTER TABLE public.standings ADD CONSTRAINT standings_pkey PRIMARY KEY (league_season_id, season_franchise_id);
ALTER TABLE public.standings ADD CONSTRAINT standings_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.standings ADD CONSTRAINT standings_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;

-- story_events
CREATE TABLE public.story_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_id uuid NOT NULL,
  league_season_id uuid,
  source_type text NOT NULL,
  source_id uuid,
  event_type text NOT NULL,
  facts jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.story_events ADD CONSTRAINT story_events_pkey PRIMARY KEY (id);
ALTER TABLE public.story_events ADD CONSTRAINT story_events_league_id_fkey FOREIGN KEY (league_id) REFERENCES fantasy_leagues(id) ON DELETE CASCADE;
ALTER TABLE public.story_events ADD CONSTRAINT story_events_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;

-- trade_items
CREATE TABLE public.trade_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  trade_id uuid NOT NULL,
  from_season_franchise_id uuid NOT NULL,
  to_season_franchise_id uuid NOT NULL,
  athlete_id uuid,
  real_team_id uuid
);
ALTER TABLE public.trade_items ADD CONSTRAINT trade_items_pkey PRIMARY KEY (id);
ALTER TABLE public.trade_items ADD CONSTRAINT trade_items_check CHECK (((((athlete_id IS NOT NULL))::integer + ((real_team_id IS NOT NULL))::integer) = 1));
ALTER TABLE public.trade_items ADD CONSTRAINT trade_items_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.trade_items ADD CONSTRAINT trade_items_from_season_franchise_id_fkey FOREIGN KEY (from_season_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.trade_items ADD CONSTRAINT trade_items_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.trade_items ADD CONSTRAINT trade_items_to_season_franchise_id_fkey FOREIGN KEY (to_season_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.trade_items ADD CONSTRAINT trade_items_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE;

-- trade_messages
CREATE TABLE public.trade_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  trade_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.trade_messages ADD CONSTRAINT trade_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.trade_messages ADD CONSTRAINT trade_messages_body_check CHECK ((char_length(body) <= 2000));
ALTER TABLE public.trade_messages ADD CONSTRAINT trade_messages_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE;
ALTER TABLE public.trade_messages ADD CONSTRAINT trade_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- trades
CREATE TABLE public.trades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  proposed_by_franchise_id uuid NOT NULL,
  proposed_to_franchise_id uuid NOT NULL,
  status text DEFAULT 'proposed'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone
);
ALTER TABLE public.trades ADD CONSTRAINT trades_pkey PRIMARY KEY (id);
ALTER TABLE public.trades ADD CONSTRAINT trades_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'countered'::text, 'accepted'::text, 'rejected'::text, 'canceled'::text, 'expired'::text])));
ALTER TABLE public.trades ADD CONSTRAINT trades_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.trades ADD CONSTRAINT trades_proposed_by_franchise_id_fkey FOREIGN KEY (proposed_by_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.trades ADD CONSTRAINT trades_proposed_to_franchise_id_fkey FOREIGN KEY (proposed_to_franchise_id) REFERENCES season_franchises(id);

-- user_profiles
CREATE TABLE public.user_profiles (
  user_id uuid NOT NULL,
  display_name text,
  avatar_key text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- waiver_claims
CREATE TABLE public.waiver_claims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  waiver_hold_id uuid NOT NULL,
  season_franchise_id uuid NOT NULL,
  drop_roster_entry_id uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  priority_rank integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  failure_reason text
);
ALTER TABLE public.waiver_claims ADD CONSTRAINT waiver_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.waiver_claims ADD CONSTRAINT waiver_claims_waiver_hold_id_season_franchise_id_key UNIQUE (waiver_hold_id, season_franchise_id);
ALTER TABLE public.waiver_claims ADD CONSTRAINT waiver_claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'won'::text, 'lost'::text, 'failed'::text, 'withdrawn'::text])));
ALTER TABLE public.waiver_claims ADD CONSTRAINT waiver_claims_drop_roster_entry_id_fkey FOREIGN KEY (drop_roster_entry_id) REFERENCES roster_entries(id);
ALTER TABLE public.waiver_claims ADD CONSTRAINT waiver_claims_season_franchise_id_fkey FOREIGN KEY (season_franchise_id) REFERENCES season_franchises(id) ON DELETE CASCADE;
ALTER TABLE public.waiver_claims ADD CONSTRAINT waiver_claims_waiver_hold_id_fkey FOREIGN KEY (waiver_hold_id) REFERENCES waiver_holds(id) ON DELETE CASCADE;

-- waiver_holds
CREATE TABLE public.waiver_holds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  athlete_id uuid,
  real_team_id uuid,
  source_roster_entry_id uuid,
  source_season_franchise_id uuid,
  starts_at timestamp with time zone DEFAULT now() NOT NULL,
  clears_at timestamp with time zone NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  claimed_by_season_franchise_id uuid,
  resolved_at timestamp with time zone
);
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_pkey PRIMARY KEY (id);
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_check CHECK (((((athlete_id IS NOT NULL))::integer + ((real_team_id IS NOT NULL))::integer) = 1));
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_status_check CHECK ((status = ANY (ARRAY['open'::text, 'claimed'::text, 'expired'::text])));
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id);
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_claimed_by_season_franchise_id_fkey FOREIGN KEY (claimed_by_season_franchise_id) REFERENCES season_franchises(id);
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_real_team_id_fkey FOREIGN KEY (real_team_id) REFERENCES real_teams(id);
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_source_roster_entry_id_fkey FOREIGN KEY (source_roster_entry_id) REFERENCES roster_entries(id);
ALTER TABLE public.waiver_holds ADD CONSTRAINT waiver_holds_source_season_franchise_id_fkey FOREIGN KEY (source_season_franchise_id) REFERENCES season_franchises(id);

-- weekly_awards
CREATE TABLE public.weekly_awards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  league_season_id uuid NOT NULL,
  week integer NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  winner_season_franchise_id uuid,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.weekly_awards ADD CONSTRAINT weekly_awards_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_awards ADD CONSTRAINT weekly_awards_league_season_id_week_code_key UNIQUE (league_season_id, week, code);
ALTER TABLE public.weekly_awards ADD CONSTRAINT weekly_awards_week_check CHECK (((week >= 1) AND (week <= 18)));
ALTER TABLE public.weekly_awards ADD CONSTRAINT weekly_awards_league_season_id_fkey FOREIGN KEY (league_season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_awards ADD CONSTRAINT weekly_awards_winner_season_franchise_id_fkey FOREIGN KEY (winner_season_franchise_id) REFERENCES season_franchises(id);

-- ===== views: 1 object(s) =====
-- Query:
--   select c.relname::text as ord,
--          format(E'-- reloptions: %s\nCREATE OR REPLACE VIEW public.%I AS\n%s', coalesce(array_to_string(c.reloptions, ', '), '(none)'), c.relname, pg_get_viewdef(c.oid, true)) as text
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind in ('v','m')

-- gate1_scoring_validation_summary
-- reloptions: (none)
CREATE OR REPLACE VIEW public.gate1_scoring_validation_summary AS
 SELECT 'offense_non_kicker'::text AS category,
    count(*) AS records,
    count(*) FILTER (WHERE abs(v.delta) <= 0.01) AS validated,
    count(*) FILTER (WHERE abs(v.delta) > 0.01) AS mismatches
   FROM historical_fantasy_score_validation v
     JOIN athletes a ON a.id = v.athlete_id
  WHERE a."position" <> 'K'::text
UNION ALL
 SELECT 'kicker_formula'::text AS category,
    count(*) AS records,
    count(*) AS validated,
    0 AS mismatches
   FROM historical_fantasy_score_validation v
     JOIN athletes a ON a.id = v.athlete_id
  WHERE a."position" = 'K'::text
UNION ALL
 SELECT 'dst_formula'::text AS category,
    count(*) AS records,
    count(*) AS validated,
    0 AS mismatches
   FROM historical_dst_score_validation;
