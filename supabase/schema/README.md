# supabase/schema — production schema baseline

This directory is a human-readable snapshot of the **current production `public` schema** of
Supabase project `njjiqdqhmcbxblwhfade`, taken from the Postgres catalog at
**2026-10-04T04:56:57Z (UTC)**.

It exists because `supabase/migrations/` cannot rebuild the database: production's migration
history starts on 2026-08-20 and the repo's starts on 2026-08-23, so the base schema was defined
nowhere in version control. See "Migration history reconciliation" below.

**These files are a reference, not migrations. Do not apply them.** Nothing here is picked up by
`supabase db push` or `npm run db:apply`.

## Files

| File | Contents | Objects at snapshot time |
|---|---|---|
| `types.sql` | enum types | 5 |
| `tables.sql` | tables (columns, defaults, NOT NULL, PK, UNIQUE, CHECK, FK) and views | 77 tables, 1 view |
| `indexes.sql` | every index, including the ones backing PK/UNIQUE constraints | 184 |
| `functions.sql` | every function, via `pg_get_functiondef`, ordered by name and argument list | 86 |
| `triggers.sql` | triggers on public tables, plus triggers elsewhere that run a public function | 10 + 1 (`auth.users`) |
| `policies.sql` | RLS enabled flag per table, then every policy | 77 flags, 88 policies |
| `grants.sql` | effective table/function privileges of `anon`, `authenticated`, `service_role` | 203 table lines, 86 function lines |
| `cron.sql` | pg_cron jobs | 2 |
| `extensions.sql` | installed extensions | 7 |
| `migration-reconciliation.json` | machine-readable form of the reconciliation table below | 80 production rows |

Each `.sql` file starts with the generation timestamp and, per section, the exact catalog query
that produced it.

Not captured: row data, anything in `auth` / `storage` / `vault` / `cron` internals, sequences as
standalone objects (1 exists: `social_scheduler_events_id_seq`, visible as a column default),
realtime publication membership, storage buckets, edge functions, and database roles.

`grants.sql` reports **effective** privileges (`has_table_privilege` / `has_function_privilege`),
so a privilege inherited through `PUBLIC` shows up on each role. It is not a replay of the
original `GRANT` statements.

## How it was generated

`scripts/db-schema-snapshot.mjs` holds every query. It only sends `SELECT` statements against the
catalog.

```sh
# direct (needs psql on PATH; connection string only ever comes from the environment)
SUPABASE_DB_URL='postgres://...' node scripts/db-schema-snapshot.mjs
SUPABASE_DB_URL='postgres://...' node scripts/db-schema-snapshot.mjs --recover-migrations

# or: fetch rows some other way, then assemble
node scripts/db-schema-snapshot.mjs --print-query tables
node scripts/db-schema-snapshot.mjs --from-json rows.json [--recover-migrations]
```

Regenerate and `git diff supabase/schema` to see drift.

**This snapshot was produced through the second path.** No connection string was available, so
the queries printed by `--print-query` were run through the Supabase MCP server (read-only
`execute_sql`), the raw JSON results were collected mechanically from the saved tool output, and
the script assembled the files with `--from-json`. No SQL was typed by hand. The direct `psql`
path of the script has **not** been run.

The script refuses to write if a section's row count differs from the catalog count taken in the
same session (types, tables, views, indexes, functions, triggers, policies, extensions), so a
truncated fetch fails instead of producing a short file. Recovered migrations are checked the
same way: the character count of each retrieved body must equal `length()` computed in Postgres.

### Secret handling

Text matching a JWT, a Supabase secret/access key, a bearer token, a provider API key, or any
quoted opaque literal of 48+ characters is replaced with `<REDACTED>`.

- `supabase/schema/*`: nothing matched. No function body, policy or cron command contains a
  credential-shaped string.
- `supabase/migrations_recovered/20260916092635_threads_controlled_scheduler.sql`: 6 values
  redacted. All six are the `approved_copy_hash` column of seed rows inserted into
  `social_scheduler_cohort_items` (64-character hex strings, LIKELY SHA-256 content hashes rather
  than credentials; redacted because they match the generic long-literal rule).

Some recovered migrations contain seed `INSERT`s (reference data such as sports, achievements and
stadium features, and the Threads scheduler cohort above, which includes a numeric Threads
account id). They were kept because they are part of the migration text. No email addresses or
user ids appear in any written file.

## Migration history reconciliation

Source: `supabase_migrations.schema_migrations` (80 rows, 2026-08-20 to 2026-09-18) compared with
`supabase/migrations/` (41 files). Matching is **by name**, ignoring a trailing `_20260823`.

- 24 production migrations have a repo file. 19 of those carry a different timestamp in the repo
  than production's version, and 4 differ by the `_20260823` suffix. File contents were **not**
  compared with production's stored statements.
- 56 production migrations have no repo file. All 56 were recovered, intact, into
  `supabase/migrations_recovered/<version>_<name>.sql`. None was too large to retrieve.
- 17 repo files have no production history entry (second table).

`supabase/migrations_recovered/` is a separate directory on purpose so that nothing tries to
re-apply SQL that is already live.

| Production version | Production name | Repo file (matched by name) | Recovered copy |
|---|---|---|---|
| 20260820043923 | core_foundation | **MISSING FROM REPO** | `20260820043923_core_foundation.sql` |
| 20260820043931 | team_fantasy_assets | **MISSING FROM REPO** | `20260820043931_team_fantasy_assets.sql` |
| 20260820043949 | supabase_app_foundation | **MISSING FROM REPO** | `20260820043949_supabase_app_foundation.sql` |
| 20260820044102 | security_hardening_helpers | **MISSING FROM REPO** | `20260820044102_security_hardening_helpers.sql` |
| 20260820044246 | season_one_gameplay | **MISSING FROM REPO** | `20260820044246_season_one_gameplay.sql` |
| 20260820045510 | league_creation_rpc | **MISSING FROM REPO** | `20260820045510_league_creation_rpc.sql` |
| 20260820045518 | user_profile_trigger | **MISSING FROM REPO** | `20260820045518_user_profile_trigger.sql` |
| 20260820053250 | secure_auth_helpers_and_invites | **MISSING FROM REPO** | `20260820053250_secure_auth_helpers_and_invites.sql` |
| 20260820054624 | league_invite_workflow | **MISSING FROM REPO** | `20260820054624_league_invite_workflow.sql` |
| 20260820054638 | fix_invite_season_resolution | **MISSING FROM REPO** | `20260820054638_fix_invite_season_resolution.sql` |
| 20260820055012 | snake_draft_engine | **MISSING FROM REPO** | `20260820055012_snake_draft_engine.sql` |
| 20260820055507 | circuit_schedule_and_lineup_engine | **MISSING FROM REPO** | `20260820055507_circuit_schedule_and_lineup_engine.sql` |
| 20260820055546 | indexed_lineup_slots | **MISSING FROM REPO** | `20260820055546_indexed_lineup_slots.sql` |
| 20260820060312 | matchup_scoring_and_standings | **MISSING FROM REPO** | `20260820060312_matchup_scoring_and_standings.sql` |
| 20260820060533 | second_half_event_engine | **MISSING FROM REPO** | `20260820060533_second_half_event_engine.sql` |
| 20260820060848 | internal_athlete_json_importer | **MISSING FROM REPO** | `20260820060848_internal_athlete_json_importer.sql` |
| 20260820061201 | enable_internal_http_for_bootstrap | **MISSING FROM REPO** | `20260820061201_enable_internal_http_for_bootstrap.sql` |
| 20260820061247 | restore_service_role_backend_privileges | **MISSING FROM REPO** | `20260820061247_restore_service_role_backend_privileges.sql` |
| 20260820072817 | pro_football_player_scoring_worker | **MISSING FROM REPO** | `20260820072817_pro_football_player_scoring_worker.sql` |
| 20260820074758 | pro_football_dst_scoring_worker | **MISSING FROM REPO** | `20260820074758_pro_football_dst_scoring_worker.sql` |
| 20260820075905 | historical_half_ppr_validation | **MISSING FROM REPO** | `20260820075905_historical_half_ppr_validation.sql` |
| 20260820080321 | gate1_kicker_dst_validation | **MISSING FROM REPO** | `20260820080321_gate1_kicker_dst_validation.sql` |
| 20260820082610 | fix_create_pro_football_league_scoring_lookup | **MISSING FROM REPO** | `20260820082610_fix_create_pro_football_league_scoring_lookup.sql` |
| 20260820121435 | fix_league_read_policy | **MISSING FROM REPO** | `20260820121435_fix_league_read_policy.sql` |
| 20260820134534 | fix_recursive_league_member_rls | **MISSING FROM REPO** | `20260820134534_fix_recursive_league_member_rls.sql` |
| 20260820134616 | grant_authenticated_core_read_access | **MISSING FROM REPO** | `20260820134616_grant_authenticated_core_read_access.sql` |
| 20260820141529 | configurable_draft_min_franchises | **MISSING FROM REPO** | `20260820141529_configurable_draft_min_franchises.sql` |
| 20260820145027 | public_invite_lookup | **MISSING FROM REPO** | `20260820145027_public_invite_lookup.sql` |
| 20260820145942 | invite_account_match_check | **MISSING FROM REPO** | `20260820145942_invite_account_match_check.sql` |
| 20260820155624 | grant_authenticated_draft_pool_reads | **MISSING FROM REPO** | `20260820155624_grant_authenticated_draft_pool_reads.sql` |
| 20260820160006 | grant_authenticated_competition_season_reads | **MISSING FROM REPO** | `20260820160006_grant_authenticated_competition_season_reads.sql` |
| 20260820162027 | allow_completed_draft_status | **MISSING FROM REPO** | `20260820162027_allow_completed_draft_status.sql` |
| 20260820210542 | grant_gate2_authenticated_reads | **MISSING FROM REPO** | `20260820210542_grant_gate2_authenticated_reads.sql` |
| 20260820210732 | enforce_commissioner_matchup_finalization | **MISSING FROM REPO** | `20260820210732_enforce_commissioner_matchup_finalization.sql` |
| 20260820210848 | separate_league_capacity_from_draft_minimum | **MISSING FROM REPO** | `20260820210848_separate_league_capacity_from_draft_minimum.sql` |
| 20260820212949 | gate3_postseason_engine | **MISSING FROM REPO** | `20260820212949_gate3_postseason_engine.sql` |
| 20260820213025 | gate3_chaos_achievement_on_finalize | **MISSING FROM REPO** | `20260820213025_gate3_chaos_achievement_on_finalize.sql` |
| 20260820213332 | gate3_deterministic_matchup_achievements | **MISSING FROM REPO** | `20260820213332_gate3_deterministic_matchup_achievements.sql` |
| 20260820213502 | gate3_idempotent_season_close | **MISSING FROM REPO** | `20260820213502_gate3_idempotent_season_close.sql` |
| 20260820213900 | gate4_social_trade_engine | **MISSING FROM REPO** | `20260820213900_gate4_social_trade_engine.sql` |
| 20260820214513 | gate4_generated_talk_flow | **MISSING FROM REPO** | `20260820214513_gate4_generated_talk_flow.sql` |
| 20260821022656 | gate5_stadium_and_recap_foundation | **MISSING FROM REPO** | `20260821022656_gate5_stadium_and_recap_foundation.sql` |
| 20260821022738 | fix_gate5_recap_dst_label | **MISSING FROM REPO** | `20260821022738_fix_gate5_recap_dst_label.sql` |
| 20260821042602 | grant_authenticated_stadium_read_access | **MISSING FROM REPO** | `20260821042602_grant_authenticated_stadium_read_access.sql` |
| 20260821121218 | recap_renderer_provider_queue | **MISSING FROM REPO** | `20260821121218_recap_renderer_provider_queue.sql` |
| 20260823033722 | provision_stadiums_and_secure_autopick | **MISSING FROM REPO** | `20260823033722_provision_stadiums_and_secure_autopick.sql` |
| 20260823041404 | add_secure_free_agent_claim | **MISSING FROM REPO** | `20260823041404_add_secure_free_agent_claim.sql` |
| 20260823164234 | core_integrity_trade_deadline_20260823 | `20260823170000_core_integrity_trade_deadline.sql` (timestamp differs, name lacks `_20260823`) | n/a |
| 20260823164650 | six_point_passing_touchdowns_20260823 | `20260823174500_six_point_passing_touchdowns.sql` (timestamp differs, name lacks `_20260823`) | n/a |
| 20260823165548 | inverse_standings_waivers_20260823 | `20260823183000_inverse_standings_waivers.sql` (timestamp differs, name lacks `_20260823`) | n/a |
| 20260823165606 | waiver_cutoff_and_drop_lock_20260823 | `20260823183500_waiver_cutoff_and_drop_lock.sql` (timestamp differs, name lacks `_20260823`) | n/a |
| 20260823214933 | multi_season_foundation | **MISSING FROM REPO** | `20260823214933_multi_season_foundation.sql` |
| 20260823215333 | five_season_history_lab | **MISSING FROM REPO** | `20260823215333_five_season_history_lab.sql` |
| 20260823215408 | fix_stadium_history_sync | **MISSING FROM REPO** | `20260823215408_fix_stadium_history_sync.sql` |
| 20260823215847 | unique_provider_game_ids | **MISSING FROM REPO** | `20260823215847_unique_provider_game_ids.sql` |
| 20260823220133 | normalize_locker_room_messages | **MISSING FROM REPO** | `20260823220133_normalize_locker_room_messages.sql` |
| 20260823220243 | cascade_achievement_stadium_links | **MISSING FROM REPO** | `20260823220243_cascade_achievement_stadium_links.sql` |
| 20260830225835 | roster_integrity_mode | `20260830225835_roster_integrity_mode.sql` | n/a |
| 20260830230104 | roster_integrity_rpc_privileges | `20260830230104_roster_integrity_rpc_privileges.sql` | n/a |
| 20260830230309 | commissioner_review_mode_behavior | `20260830230309_commissioner_review_mode_behavior.sql` | n/a |
| 20260905043133 | autopick_member_expiry_ranked_fallback | `20260905043133_autopick_member_expiry_ranked_fallback.sql` | n/a |
| 20260905044021 | autopick_historical_average_rankings | `20260905044021_autopick_historical_average_rankings.sql` | n/a |
| 20260905050336 | draft_historical_values | `20260905045611_draft_historical_values.sql` (timestamp differs) | n/a |
| 20260905050746 | draft_value_over_replacement | `20260905050608_draft_value_over_replacement.sql` (timestamp differs) | n/a |
| 20260905080656 | draft_value_provider_priority | `20260905080407_draft_value_provider_priority.sql` (timestamp differs) | n/a |
| 20260909064515 | beta_feedback_intelligence | `20260909062000_beta_feedback_intelligence.sql` (timestamp differs) | n/a |
| 20260909064528 | beta_feedback_support_triage | `20260909063500_beta_feedback_support_triage.sql` (timestamp differs) | n/a |
| 20260913102004 | fantasy_player_market_values | `20260913085852_fantasy_player_market_values.sql` (timestamp differs) | n/a |
| 20260913102014 | draft_completion_letter | `20260913100734_draft_completion_letter.sql` (timestamp differs) | n/a |
| 20260913180642 | auto_schedule_after_draft | `20260913175906_auto_schedule_after_draft.sql` (timestamp differs) | n/a |
| 20260913183249 | grant_live_scoring_recompute | `20260913183226_grant_live_scoring_recompute.sql` (timestamp differs) | n/a |
| 20260916004339 | add_social_oauth_threads_connection_store | **MISSING FROM REPO** | `20260916004339_add_social_oauth_threads_connection_store.sql` |
| 20260916092635 | threads_controlled_scheduler | **MISSING FROM REPO** | `20260916092635_threads_controlled_scheduler.sql` |
| 20260916122349 | threads_scheduler_store_approved_copy | **MISSING FROM REPO** | `20260916122349_threads_scheduler_store_approved_copy.sql` |
| 20260917234017 | automatic_weekly_recap_news_v2 | `20260917233606_automatic_weekly_recap_news_v2.sql` (timestamp differs) | n/a |
| 20260917234307 | revoke_manual_matchup_recap | `20260917234248_revoke_manual_matchup_recap.sql` (timestamp differs) | n/a |
| 20260918005741 | bidirectional_lineup_lock_and_audit | `20260918005608_bidirectional_lineup_lock_and_audit.sql` (timestamp differs) | n/a |
| 20260918010225 | lineup_move_audit_indexes | `20260918010158_lineup_move_audit_indexes.sql` (timestamp differs) | n/a |
| 20260918014556 | enforce_full_player_game_lock | `20260918013839_enforce_full_player_game_lock.sql` (timestamp differs) | n/a |
| 20260918042128 | grant_authenticated_real_games_read | `20260918042101_grant_authenticated_real_games_read.sql` (timestamp differs) | n/a |

### Repo files with no production history entry

`scripts/db-apply-migration.mjs` applies SQL without recording it in the history table, so "no
entry" does not mean "not applied". Each file was therefore checked against this snapshot by the
names of the tables and functions it creates.

| Repo file | Check against this snapshot |
|---|---|
| `20260826043010_draft_queue.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260826043918_draft_timer_autopick.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260826044414_draft_realtime_publication.sql` | UNVERIFIED: creates no table or function, so name matching proves nothing |
| `20260826044536_draft_pause_resume.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260826044713_draft_correction_undo.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260901090000_ops_portal_phase1.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260902065522_executive_entitlement_foundation.sql` | PROVEN: table `league_season_entitlements` and function `set_league_season_entitlements_updated_at` are **absent** from production |
| `20260902070954_assistant_gm_conversation_retention.sql` | PROVEN: table `assistant_gm_conversations` and function `set_assistant_gm_conversations_updated_at` are **absent** from production |
| `20260904100000_autopick_roster_requirements.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260909040752_league_share_invites.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260909041522_reusable_share_invites_and_commissioner_remove.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260909043603_franchise_avatar_options.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260909044749_harden_share_invite_execute_grants.sql` | UNVERIFIED: creates no table or function, so name matching proves nothing |
| `20260909065000_ops_it_staff_role.sql` | UNVERIFIED: creates no table or function, so name matching proves nothing |
| `20260909070139_immutable_beta_feedback_submissions.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20260913081229_default_draft_clock_sixty_seconds.sql` | PROVEN: every table and function name it creates exists in production (bodies not compared) |
| `20261003030000_lineup_week_integrity.sql` | PROVEN: functions `lineup_week_is_closed` and `roster_asset_week_game_has_started` are **absent** from production |

## Findings

Facts and locations only; nothing was changed. Labels follow `AGENTS.md`: **PROVEN** = read from
the catalog or from the function text in this snapshot; **LIKELY** = inferred; **UNVERIFIED** =
not tested.

### Counts (PROVEN)

77 tables, 1 view, 86 functions (79 `SECURITY DEFINER`, 7 invoker), 88 policies, 10 triggers on
public tables plus 1 on `auth.users`, 184 indexes, 5 enums, 7 extensions, 2 cron jobs.
`service_role` has `BYPASSRLS`; `anon` and `authenticated` do not.

### 1. Migrations merged in the repo but not present in production

- **PROVEN** — `20261003030000_lineup_week_integrity.sql` (merged in PR #52, the tip of `main`)
  is not live. `lineup_week_is_closed` and `roster_asset_week_game_has_started` do not exist in
  production, and no production function body mentions `lineup_week_is_closed`. Production still
  runs the earlier `set_lineup_slot`, `claim_free_agent` and `process_due_waivers`.
- **PROVEN** — `league_season_entitlements` (`20260902065522`) and `assistant_gm_conversations`
  (`20260902070954`) do not exist in production.
- **UNVERIFIED** — whether application code already depends on any of these objects.

### 2. Tables with RLS disabled

- **PROVEN** — none. All 77 public tables have row level security enabled. No table has
  `FORCE ROW LEVEL SECURITY`.

### 3. Tables with RLS enabled and no policies

- **PROVEN** — 14 tables: `beta_feedback_analysis`, `beta_feedback_review_events`,
  `beta_feedback_submissions`, `historical_dst_score_validation`,
  `historical_fantasy_score_validation`, `qa_fixture_leagues`, `qa_fixture_users`,
  `social_oauth_connections`, `social_oauth_states`, `social_publication_jobs`,
  `social_publication_registrations`, `social_scheduler_cohort_items`,
  `social_scheduler_cohorts`, `social_scheduler_events`.
- **PROVEN** — on all 14, `anon` and `authenticated` hold no table privilege at all; only
  `service_role` does. They are reachable only from server code.
- **LIKELY** — this is deliberate (server-only tables), including `social_oauth_connections`,
  which stores encrypted token columns.

### 4. Policies that look broad

- **PROVEN** — `user_profiles.profile_read_authenticated` is `FOR SELECT TO authenticated USING
  (true)`: any signed-in user can read every user's `display_name` and `avatar_key`, in any
  league. **UNVERIFIED** whether that is intended.
- **PROVEN** — 13 more `USING (true)` SELECT policies for `authenticated`, all on shared sports
  reference data: `achievements`, `athlete_game_stats`, `athlete_provider_ids`, `athletes`,
  `competition_seasons`, `competitions`, `draft_historical_values`, `real_games`,
  `real_team_game_stats`, `real_teams`, `scoring_profiles`, `sports`, `stadium_features`.
  `fantasy_player_market_values` uses `auth.uid() IS NOT NULL`, which is equivalent.
- **PROVEN** — 3 policies are granted `TO public` rather than `TO authenticated`:
  `franchises.league_member_read_franchises`, `league_feed_events.league_member_read_feed`,
  `league_seasons.league_member_read_seasons`. Each still requires league membership through
  `auth.uid()`, and `anon` has no SELECT on those tables.
- **PROVEN** — `story_events.member_insert_story_events` and
  `league_feed_events.member_post_feed` let any league member insert rows directly (the
  `authenticated` role holds INSERT on both) with a free-form `event_type` and JSON payload; the
  only checks are membership and, for the feed, `actor_user_id = auth.uid()`. **LIKELY** a member
  can post a feed or story row that looks system-generated. **UNVERIFIED** whether anything
  downstream trusts those rows.
- **PROVEN** — policies and grants disagree, in both directions:
  - 9 tables have a SELECT policy for `authenticated` but no SELECT privilege, so the policy can
    never apply: `athlete_game_stats`, `athlete_provider_ids`, `competitions`,
    `historical_backfill_runs`, `historical_lineups`, `real_team_game_stats`, `rivalries`,
    `scoring_profiles`, `sports`.
  - 17 write policies exist on tables where `authenticated` lacks the matching write privilege
    (`fantasy_leagues`, `franchises`, `league_invites`, `league_members`, `league_seasons`,
    `lineups`, `roster_entries`, `trade_messages`, `user_profiles`, and UPDATE on
    `feed_reactions`). They are inert today. Two would matter if a write privilege were ever
    granted: `league_members.creator_add_members` accepts `user_id = auth.uid()` for any league
    (self-join), and `lineups.owner_manage_lineups` / `roster_entries.owner_manage_roster` are
    `FOR ALL`, which would bypass the lock and roster-integrity logic in the RPCs.
- **PROVEN** — `live_scoring_runs."ops staff can read live scoring runs"` checks for roles
  `owner` and `admin`, which the `ops_staff_roles_role_check` constraint does not allow, and it
  does not check `disabled_at` (the `ops_audit_events` policy does).

### 5. SECURITY DEFINER functions callable by anon/authenticated without `auth.uid()`

**PROVEN** — 8 `SECURITY DEFINER` functions are executable by `anon` or `authenticated` and their
body contains no `auth.uid()`, `auth.role()`, `auth.jwt()` or `is_league_member` call:

| Function | Callable by | What the body does |
|---|---|---|
| `calculate_pro_football_player_scores(uuid, integer)` | authenticated | PROVEN: upserts `fantasy_player_scores` for any league season id passed in |
| `calculate_pro_football_dst_scores(uuid, integer)` | authenticated | PROVEN: upserts `fantasy_team_scores` for any league season id |
| `calculate_pro_football_week_scores(uuid, integer)` | authenticated | PROVEN: calls the two above |
| `resolve_late_start_activation(uuid)` | authenticated | PROVEN: read-only, returns schedule-derived weeks |
| `effective_late_entry_cutoff(uuid)` | authenticated | body not reviewed line by line (UNVERIFIED read-only) |
| `draft_roster_needs(uuid)` | authenticated | returns roster need counts for any franchise id; only the first part of the body was reviewed (UNVERIFIED read-only) |
| `get_public_league_invite(uuid)` | anon, authenticated | token lookup; returned columns not reviewed (UNVERIFIED) |
| `get_public_league_invite_v2(uuid)` | PUBLIC, anon, authenticated | same |

- **LIKELY** — the three scoring functions let any signed-in user trigger a score recompute for a
  league they are not in. Output is derived from stored stats, so the likely impact is load, not
  wrong scores. Not tested.
- **PROVEN** — 15 `SECURITY DEFINER` functions are executable by `anon`, 14 of them through a
  `PUBLIC` grant: `close_league_season`, `generate_chaos_week`, `generate_judgment_week`,
  `generate_postseason_week16`, `generate_postseason_week17`, `generate_weekly_awards`,
  `initialize_postseason`, `invite_matches_current_user`, `post_generated_message`,
  `post_locker_room_message`, `post_trade_message`, `record_generated_message`,
  `toggle_feed_reaction`, plus the two invite lookups. The 13 non-invite functions all read
  `auth.uid()`: the five `post_*` / `record_*` / `toggle_*` functions raise on a null user, `invite_matches_current_user` joins `auth.users` on `auth.uid()`, and
  the seven commissioner functions have no explicit null check but require a
  `league_members` row for `auth.uid()` with role `commissioner`, which a null user cannot match.
  **UNVERIFIED** by execution; nothing was called.
- **PROVEN** — `recompute_matchup` and `process_expired_draft_picks` (authenticated +
  service_role, not anon) apply their membership checks only when `auth.uid()` is not null, which
  is how the cron job and service role get through.

### 6. Functions without a fixed search_path

- **PROVEN** — none. All 86 functions set `search_path` (81 `public`, 4 `public, auth`, 1 `pg_catalog`).

### 7. Unusual table privileges

- **PROVEN** — `anon` holds `TRUNCATE`, `REFERENCES` and `TRIGGER` on 60 of 77 tables, and
  `authenticated` holds `TRUNCATE` on 61, including `lineups`, `roster_entries`, `matchups`,
  `standings`, `draft_picks`, `trades` and `user_profiles` (see `grants.sql`). RLS does not
  restrict `TRUNCATE`.
- **PROVEN** — `anon` has no SELECT/INSERT/UPDATE/DELETE on any public table. `authenticated`
  has write privileges on 4 tables only: `feed_reactions` (INSERT, DELETE), `generated_messages`,
  `league_feed_events`, `story_events` (INSERT).
- **LIKELY** — the TRUNCATE grants are not reachable through the Supabase REST API, which has no
  truncate operation. **UNVERIFIED** — not tested, and not checked for any path that lets these
  roles run arbitrary SQL.

### 8. Smaller observations (PROVEN)

- Cron: `big-exec-process-draft-autopicks` runs `process_expired_draft_picks()` every minute and
  `big-exec-process-waivers` runs `process_all_due_waivers()` every 15 minutes. Neither command
  embeds a URL, header or token.
- `docs/ARCHITECTURE.md` says "RLS enabled on all public-schema tables". That matches.
- Redundant objects: `lineups_team_week_unique` and `lineups_unique_team_week` are identical;
  `league_invites_token_idx` and `draft_picks_draft_pick_idx` duplicate unique indexes; `drafts`,
  `draft_picks`, `lineups`, `matchups` and `standings` each carry two equivalent member-read
  policies.
- `public.rls_auto_enable()` exists and is not executable by any of the three API roles; what
  invokes it was not checked (UNVERIFIED).

### Not verified

- The direct `psql` path of `scripts/db-schema-snapshot.mjs`.
- Whether repo migration files match the SQL production actually ran (names only were matched).
- Any finding's exploitability: no function was executed and no request was made as `anon` or
  `authenticated`.
- Schemas other than `public`, storage policies, auth configuration, edge functions.
