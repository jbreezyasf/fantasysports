# Big Exec Authoritative Gate Status

> **CANONICAL STATUS DOCUMENT**
>
> Gate numbering is controlled by `docs/PRODUCT_PRD.md`. The older Gate 1–5 numbering is retired.
>
> A gate may only be marked **PASS** using current supporting evidence. Historical PASS labels do not transfer automatically into this gate model.
>
> **Current posture:** CURRENTLY RECONCILED THROUGH READ-ONLY INSPECTION. Codex/development must still execute actual user flows before marking any gameplay gate PASS.

## Current Evidence Baseline — 2026-08-26

**Environment / deployment inspected**

- **PROVEN:** Local `main` and `origin/main` are both `70a73984a6644830942b364de4a727b7b564f6f0`.
- **PROVEN:** Active Vercel production deployment for project `fantasysports` is `dpl_2XQuGA9UMuGYkzzCq7yCFyisVEHC`, target `production`, state `READY`, commit `70a73984a6644830942b364de4a727b7b564f6f0`.
- **PROVEN:** `https://bigexecfs.com` redirects to `https://www.bigexecfs.com/`; the served HTML references deployment `dpl_2XQuGA9UMuGYkzzCq7yCFyisVEHC`.
- **PROVEN:** Production database project is Supabase `njjiqdqhmcbxblwhfade`, status `ACTIVE_HEALTHY`, Postgres `17.6.1.155`.

**Repository / CI inspected**

- **PROVEN:** Repository CI workflow `.github/workflows/ci.yml` uses npm and runs `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.
- **PROVEN:** GitHub Actions run `32928758743` for commit `70a73984a6644830942b364de4a727b7b564f6f0` completed successfully for workflow `CI`.
- **PROVEN:** GitHub Actions run `32928759045` for commit `70a73984a6644830942b364de4a727b7b564f6f0` completed successfully for workflow `Recap Renderer CI`.
- **PROVEN:** Local `npm test`, `npm run typecheck`, and `npm run build` passed after `npm ci`.
- **PROVEN:** After the draft-pool regression test was added, local `npm test`, `npm run typecheck`, and `npm run build` passed again on 2026-08-26.
- **PROVEN:** In the current working tree on 2026-08-26, after draft-ranking, draft-queue, server-authoritative timer/autopick, realtime refresh, pause/resume, and correction/undo implementation work, fresh forced local checks passed: `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`.
- **PROVEN:** A forced combined `npx turbo test typecheck build --force` run is not stable because web typecheck can read `.next/types` while `next build` is regenerating it; sequential forced checks passed.
- **PROVEN:** `npm ci` reports 3 high-severity vulnerabilities. This is dependency-audit evidence, not proof of exploitability.

**Production database inspected**

- **PROVEN:** Production migration history contains many migrations from `20260820043923_core_foundation` through `20260823220243_cascade_achievement_stadium_links`.
- **PROVEN:** The repository currently contains only four Supabase migration SQL files: `20260823170000_core_integrity_trade_deadline.sql`, `20260823174500_six_point_passing_touchdowns.sql`, `20260823183000_inverse_standings_waivers.sql`, and `20260823183500_waiver_cutoff_and_drop_lock.sql`.
- **LIKELY / INFERRED:** Production schema is not fully reconciled into version control because production migration history substantially exceeds checked-in migration files.
- **PROVEN:** All listed public tables returned by Supabase table inspection have RLS enabled.
- **PROVEN:** `pg_cron` and `pg_net` are installed. Cron job `big-exec-process-waivers` is active on `*/15 * * * *` and runs `select public.process_all_due_waivers();`.
- **PROVEN:** Supabase Realtime publication currently contains `public.feed_reactions` and `public.league_feed_events`; it does not contain `drafts` or `draft_picks`.
- **PROVEN:** No `public.draft_queues` table exists.
- **PROVEN:** Later on 2026-08-26, production database schema was updated for Draft Night queue/timer/realtime/pause/undo using direct `npx supabase db query --linked --file ...` execution because `supabase db push --linked --dry-run` was blocked by existing remote/local migration-history drift.
- **PROVEN:** After that update, production contains `draft_queues` and `draft_corrections` with RLS enabled; `drafts.current_pick_deadline_at`, `drafts.paused_at`, and `drafts.paused_remaining_seconds`; active cron `big-exec-process-draft-autopicks`; and Supabase Realtime publication entries for `drafts`, `draft_picks`, and `draft_queues`.
- **PROVEN:** Production no longer has anon EXECUTE privileges on the new Draft Night RPCs checked: `add_draft_queue_item`, `pause_draft`, `process_expired_draft_picks`, and `undo_last_draft_pick`.
- **PROVEN:** `supabase db advisors --linked --level warn --fail-on none` completed and reported existing broader SECURITY DEFINER/RLS performance warnings, including expected authenticated SECURITY DEFINER warnings for new guarded Draft Night RPCs.
- **UNVERIFIED:** `supabase db lint --linked --schema public --fail-on none` hung after login initialization and was stopped; lint output was not obtained.
- **PROVEN:** `waiver_holds` and `waiver_claims` tables exist; production currently contains 2 waiver holds and 0 waiver claims.
- **PROVEN:** `build_matchup_recap(uuid)` now requires `auth.uid()` and calls `is_league_member`; `award_matchup_achievements(uuid)` and `sync_franchise_stadium_features(uuid)` are executable by `service_role` but not by `anon` or `authenticated`.
- **UNVERIFIED:** Sensitive RPC permission boundaries have not yet been exercised with unauthenticated, non-member, member, commissioner, and service-role test actors.

**Production fantasy data inspected**

- **PROVEN:** Production contains 7,409 athletes and 3,012 active athletes.
- **PROVEN:** Active eligible athlete counts are QB 121, RB 202, WR 401, TE 213, K 39.
- **PROVEN:** Production contains 3,012 Sportradar provider IDs and 1,071 nflverse provider IDs.
- **PROVEN:** Production contains 2 drafts, both completed; each has 30 made picks and 10 WR picks.
- **PROVEN:** Production contains 26 lineups, 1 trade, 68 league feed events, 86 final matchups, 5 rivalries, 80 franchise achievements, 46 franchise stadium features, 0 weekly awards, 10 championships, 15 story events, and 6 recap scripts.
- **PROVEN:** Production `real_games` rows are 2025 Week 1 only: 16 final games from 2025-09-04 through 2025-09-08.
- **PROVEN:** The system default `Pro Football Half-PPR` scoring profile has `passing_td = 6`.
- **UNVERIFIED:** Actual end-to-end user flows for draft, roster, lineup, free agency, waivers, trading, live scoring, season automation, and Recap V2 have not been executed in this reconciliation.

---

## Gate 0 — Platform Trust

**STATUS:** NOT PASSED — PARTIAL CURRENT EVIDENCE

### Required PASS evidence

- version-controlled database migrations reconciled with production;
- CI runs the repository's real install/typecheck/test/build path;
- production/staging/preview environment boundaries are explicit;
- secrets and public configuration are handled safely;
- sensitive RPC/auth boundaries are tested;
- unattended scheduler/jobs are proven;
- observability exists for beta-critical failures;
- production deployment verification is part of the release path.

### Evidence log

- **PROVEN:** Current deployed commit, local `main`, and `origin/main` all match `70a73984a6644830942b364de4a727b7b564f6f0`.
- **PROVEN:** GitHub CI and Recap Renderer CI completed successfully for the production commit.
- **PROVEN:** Local `npm test`, `npm run typecheck`, and `npm run build` passed after dependency install.
- **PROVEN:** After the draft-pool regression test was added, local `npm test`, `npm run typecheck`, and `npm run build` passed again on 2026-08-26.
- **PROVEN:** In the current working tree on 2026-08-26, after draft-ranking, draft-queue, server-authoritative timer/autopick, realtime refresh, pause/resume, and correction/undo implementation work, fresh forced local checks passed: `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`.
- **PROVEN:** Production/staging/preview boundaries are only partially explicit: Vercel production target is identified, but no local `.vercel/project.json` exists and environment boundaries still rely on deployment configuration plus `.env.example`.
- **PROVEN:** Production has `pg_cron` installed and one active waiver-processing cron job.
- **PROVEN:** Production database migration history is longer than checked-in migration files, and `supabase db push --linked --dry-run` is blocked by remote migration versions absent from the local migrations directory.
- **LIKELY / INFERRED:** Production schema is not fully captured in version control.
- **PROVEN:** Previously documented public execution exposure for `award_matchup_achievements` and `sync_franchise_stadium_features` has been reduced; neither is executable by `anon` or `authenticated`.
- **UNVERIFIED:** Permission-boundary tests for sensitive RPCs have not been executed with real actor classes.
- **UNVERIFIED:** Observability for beta-critical failures is not proven beyond CI, Vercel deployment status, table data, and the recap renderer CI path.

---

## Gate 1 — Draft Night Works

**STATUS:** NOT PASSED

### Must prove

- complete fantasy-eligible player pool;
- rankings;
- personal queue;
- server-authoritative timer;
- autopick;
- realtime pick propagation;
- reconnect/recovery;
- duplicate-pick protection;
- commissioner pause;
- commissioner correction/undo with audit trail;
- full 10-manager production-equivalent draft;
- complete legal rosters at finish.

### Evidence log

- **PROVEN:** Production contains active eligible player data: QB 121, RB 202, WR 401, TE 213, K 39.
- **PROVEN:** The deployed source matching production uses paged `range()` loading for eligible athletes in `apps/web/lib/fantasy/athletePool.ts`, avoiding the old single 500-row global cap.
- **PROVEN:** A web regression test now verifies the draft-pool loader requests a second page after a full 1,000-row page and preserves 401 WR rows beyond the first page.
- **PROVEN:** The current working tree adds deterministic Big Exec internal draft rankings with overall rank, positional rank, source, version, and regression tests.
- **PROVEN:** The current working tree adds draft-room rendering for ranked athletes/D/ST and a personal queue panel with add, move up/down, and remove server actions.
- **PROVEN:** The current working tree adds migration `supabase/migrations/20260826043010_draft_queue.sql` defining `public.draft_queues`, owner-scoped RLS read policy, authenticated queue RPCs, draft-eligibility checks, duplicate prevention, queue-rank compaction, and drafted-asset cleanup.
- **PROVEN:** The current working tree adds migration `supabase/migrations/20260826043918_draft_timer_autopick.sql` defining `drafts.current_pick_deadline_at`, deadline advancement in `start_draft`/`make_draft_pick`, queue-first `process_expired_draft_picks`, and a pg_cron schedule for expired pick processing when `pg_cron` is installed.
- **PROVEN:** The current working tree renders a server-deadline countdown in the draft room and exposes a commissioner-only expired-pick processor action.
- **PROVEN:** The current working tree adds migration `supabase/migrations/20260826044414_draft_realtime_publication.sql` adding `drafts`, `draft_picks`, and `draft_queues` to Supabase Realtime when the publication exists, plus draft-room client refresh subscriptions and polling fallback.
- **PROVEN:** The current working tree adds migration `supabase/migrations/20260826044536_draft_pause_resume.sql` defining paused clock state and commissioner `pause_draft`, and updates the draft room with pause/resume controls.
- **PROVEN:** The current working tree adds migration `supabase/migrations/20260826044713_draft_correction_undo.sql` defining `draft_corrections` and commissioner `undo_last_draft_pick`, with draft-room undo controls.
- **PROVEN:** The five Draft Night SQL files were applied to production on 2026-08-26 using `npx supabase db query --linked --file ...`.
- **PROVEN:** Production verification after SQL application shows `draft_queues` and `draft_corrections` exist with RLS enabled.
- **PROVEN:** Production verification after SQL application shows `drafts.current_pick_deadline_at`, `drafts.paused_at`, and `drafts.paused_remaining_seconds` exist.
- **PROVEN:** Production verification after SQL application shows `add_draft_queue_item`, `remove_draft_queue_item`, `move_draft_queue_item`, `process_expired_draft_picks`, `pause_draft`, `undo_last_draft_pick`, `make_draft_pick`, and `start_draft` function signatures exist.
- **PROVEN:** Production verification after SQL application shows `drafts`, `draft_picks`, and `draft_queues` are in `supabase_realtime`.
- **PROVEN:** Production verification after SQL application shows active cron `big-exec-process-draft-autopicks` runs `select public.process_expired_draft_picks();` every minute.
- **PROVEN:** Production has two completed drafts, both with 30 made picks and 10 WR picks.
- **PROVEN:** Earlier read-only inspection found no `draft_queues` table, no production draft/autopick function, and no draft realtime publication entries; those observations are superseded by the later 2026-08-26 production SQL application and verification above.
- **UNVERIFIED:** The updated production Draft Night database behavior has not yet been exercised by authenticated users in an actual draft room.
- **UNVERIFIED:** Full 10-manager production-equivalent draft QA has not been executed in this reconciliation.
- **UNVERIFIED:** The authenticated production draft-room UI has not yet been exercised with a valid test session.
- **UNVERIFIED:** Rankings, personal queue, server-authoritative timer, autopick, reconnect/recovery, commissioner pause, and commissioner correction/undo are not proven.

---

## Gate 2 — Team Management Works

**STATUS:** NOT PASSED

### Must prove

- roster management;
- lineup management;
- individual kickoff locks;
- free-agent add/drop;
- inverse-standings waiver processing;
- trade deadline enforcement;
- complete trade state lifecycle;
- atomic ownership changes;
- mobile and desktop usability.

### Evidence log

- **PROVEN:** Production has roster, lineup, free-agent, waiver, and trade-related tables/functions.
- **PROVEN:** `claim_free_agent`, `submit_waiver_claim`, `withdraw_waiver_claim`, `process_due_waivers`, and `process_all_due_waivers` exist in production.
- **PROVEN:** Waiver processing is scheduled by active `pg_cron` job `big-exec-process-waivers`.
- **PROVEN:** `league_seasons.trade_deadline_at` exists; 2026 Pro Football seasons have `2026-11-10 21:00:00+00`.
- **PROVEN:** Production has 2 waiver holds and 0 waiver claims.
- **PROVEN:** Production has 1 trade and trade item/message rows.
- **UNVERIFIED:** Actual roster, lineup, kickoff lock, free-agent add/drop, competing waiver claims, post-deadline transaction behavior, and full trade lifecycle have not been executed end to end in this reconciliation.

---

## Gate 3 — Game Day Works

**STATUS:** NOT PASSED

### Must prove

- current-season game/stat ingestion;
- 6-point touchdown scoring across supported TD categories;
- fantasy-player score calculation;
- D/ST calculation;
- lineup/matchup score calculation;
- acceptable score latency;
- simultaneous games;
- refresh/reconnect behavior;
- finalization;
- stat corrections and audit trail.

### Evidence log

- **PROVEN:** Production scoring tables contain 2025 Week 1 fixture data: 16 final games, 1,071 athlete game-stat rows, 1,071 fantasy player score rows, 32 real-team stat rows, and 32 fantasy team score rows.
- **PROVEN:** Production system scoring profile has 6-point passing touchdowns, and database scoring function `calculate_pro_football_player_scores` uses 6 points for passing touchdowns.
- **PROVEN:** Production has no current 2026 `real_games` rows from database inspection.
- **UNVERIFIED:** Current-season game/stat ingestion, live score latency, simultaneous current games, refresh/reconnect behavior, finalization, stat corrections, and audit behavior have not been executed end to end in this reconciliation.

---

## Gate 4 — Season Runs Itself

**STATUS:** NOT PASSED

### Must prove

- Weeks 1–9 Circuit;
- Rivalry Week;
- Revenge Week;
- Position Week;
- Chaos Week;
- Judgment Week;
- official standings;
- all-play where required;
- weekly awards;
- playoff seeding;
- Redemption tournament;
- championship;
- automatic transitions;
- season close;
- unattended weekly operation.

### Evidence log

- **PROVEN:** Production has season/postseason/history-shaped tables populated, including 86 final matchups, 64 standings rows, 50 postseason seed rows, and 10 championship rows.
- **PROVEN:** Production has one active unattended cron job, but it is limited to waiver processing.
- **UNVERIFIED:** Weeks 1-9 Circuit, special weeks, official standings, all-play where required, weekly awards, playoff seeding, Redemption tournament, championship, automatic transitions, season close, and unattended weekly operation have not been executed as a full season rehearsal in this reconciliation.

---

## Gate 5 — League Feels Alive

**STATUS:** NOT PASSED

### Must prove

- Locker Room;
- public league events;
- rivalry history/context;
- all-play and rankings presentation;
- awards/achievements;
- stadium/franchise progression;
- useful notifications;
- deterministic story events;
- Recap V2 action-first visual quality;
- polished mobile/desktop experience.

### Evidence log

- **PROVEN:** Production has Locker Room/feed tables and realtime publication entries for `league_feed_events` and `feed_reactions`.
- **PROVEN:** Production has 68 league feed events, 5 rivalries, 80 franchise achievements, 46 franchise stadium features, 15 story events, 6 recap scripts, 25 recap scenes, and 2 recap renders.
- **PROVEN:** Current Recap V1 function builds text-forward scene kinds including `stadium_open`, `score_reveal`, `arcade_star`, and `winner_moment`.
- **UNVERIFIED:** Useful notifications, deterministic story-event coverage, all-play/rankings presentation, polished mobile/desktop League Alive experience, and Recap V2 action-first visual quality have not been executed or creatively accepted in this reconciliation.

---

## Gate 6 — Friend Beta

**STATUS:** NOT STARTED

Entry requires Gates 0–5 to satisfy the beta-entry acceptance criteria defined in the PRD.

### Beta measures

- draft completion;
- valid weekly lineup rate;
- weekly active managers;
- transactions;
- social activity;
- eliminated-manager retention;
- recap use/share behavior;
- defect rate;
- enjoyment;
- renewal intent.

---

## Gate 7 — Commercialization

**STATUS:** NOT STARTED

Requires legal/trademark/data-rights/privacy/moderation/app-store review plus a validated cost model and unit economics.

---

# Status Update Rule

When updating any gate, record:

1. date;
2. exact environment/deployment/commit;
3. test performed;
4. expected result;
5. actual result;
6. supporting logs/query/test output;
7. remaining blockers.

Do not use a simulation result as production proof.
