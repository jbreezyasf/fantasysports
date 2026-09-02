# Big Exec Accessibility + Voice Assistant GM Repo Inventory

Task: BE-A11Y-000  
Date: 2026-08-31  
Change type: Audit only  
Production code changed: No

## Scope Boundary

This document inventories the actual repository for the Accessibility + Voice Assistant GM beta backlog. The backlog file at `/Users/harmonyclawcole/Desktop/big-exec-codex-accessibility-voice-gm-implementation-backlog.md` was treated as implementation guidance, not as proof that any architecture already exists.

Evidence labels:

- **PROVEN**: verified in current repository files inspected for this task.
- **LIKELY / INFERRED**: strongly indicated by repository evidence but not fully proven by running production-equivalent flows in this task.
- **UNVERIFIED**: not found or not executed during this audit.

## Repository Shape

**PROVEN:** The repo is an npm workspace/Turborepo project.

Relevant files:

- `package.json`
- `package-lock.json`
- `turbo.json`
- `apps/web/package.json`
- `packages/fantasy-core/package.json`
- `packages/competition-engine/package.json`
- `packages/story-engine/package.json`
- `packages/sports-data/package.json`
- `services/recap-renderer/package.json`

Tree excerpt:

```text
apps/web/                 Next.js web application
packages/fantasy-core/    deterministic fantasy scoring package
packages/competition-engine/ deterministic matchup/event helpers
packages/story-engine/    deterministic narration-context guardrails
packages/sports-data/     provider-neutral sports-data types/config
services/recap-renderer/  separate recap video renderer worker/service
supabase/migrations/      checked-in database/RPC migrations
tests/e2e/                Playwright e2e harness
scripts/                  QA/reset/browser automation scripts
.github/workflows/        GitHub Actions CI
```

## Stack Inventory

### Frontend Stack

**PROVEN:** `apps/web` uses Next.js App Router, React, TypeScript, and Supabase SSR/client helpers.

Relevant files:

- `apps/web/package.json`: `next ^15.5.2`, `react ^19.1.1`, `react-dom ^19.1.1`, `@supabase/ssr`, `@supabase/supabase-js`.
- `apps/web/app/layout.tsx`: root HTML/body, global CSS imports.
- `apps/web/app/globals.css`, `apps/web/app/brand.css`, `apps/web/app/brand-polish.css`, `apps/web/app/dashboard.css`, `apps/web/app/gate5.css`, `apps/web/app/mobile-nav.css`, `apps/web/app/forms-gate5.css`, `apps/web/app/stadium-gate5.css`: global CSS design system.

**PROVEN:** There is no separate native mobile app framework in this repo. Mobile is responsive web.

Relevant files:

- `apps/web/app/mobile-nav.css`
- `apps/web/app/components/BigExecMobileNav.tsx`
- `playwright.config.ts`: mobile Chromium project uses Pixel 5 viewport.

### Backend/API Stack

**PROVEN:** The primary application backend is Supabase plus Next.js Server Actions/Server Components. The web app calls Supabase tables and RPCs directly from server-rendered pages and server actions.

Relevant files:

- `apps/web/lib/supabase/server.ts`: creates SSR Supabase client from cookies.
- `apps/web/lib/supabase/client.ts`: creates browser Supabase client.
- `apps/web/lib/supabase/admin.ts`: creates service-role admin client for server-only use.
- `apps/web/middleware.ts`: refreshes Supabase auth session for SSR/server actions.
- `supabase/migrations/*.sql`: database functions, policies, triggers, cron wiring.

**PROVEN:** There is also a separate recap renderer service, not the main app backend.

Relevant files:

- `services/recap-renderer/src/worker.ts`
- `services/recap-renderer/src/server.ts`
- `services/recap-renderer/src/browser/render.ts`
- `services/recap-renderer/package.json`
- `.github/workflows/recap-renderer.yml`

### Auth/Session

**PROVEN:** Supabase Auth is the identity/session system.

Relevant files:

- `apps/web/app/auth/actions.ts`: sign in, sign up, sign out, safe `next` redirect, friendly auth errors.
- `apps/web/app/login/page.tsx`: sign-in/sign-up UI.
- `apps/web/app/auth/confirm/route.ts`: auth confirmation route.
- `apps/web/middleware.ts`: session refresh.
- `apps/web/lib/supabase/server.ts`

### State Management

**PROVEN:** There is no dedicated global client state library. State is mostly server-loaded from Supabase, submitted through Server Actions, refreshed by redirect/revalidation, and lightly managed with component-local React state.

Relevant files:

- `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`: local `useState` and `useDeferredValue` for draft search/filter UI.
- `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`: Supabase realtime subscription then `router.refresh()`.
- `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`: Supabase realtime subscription then `router.refresh()`.

### Feature Flags

**PROVEN:** No feature-flag system was found in the inspected repository files.

Search evidence:

- `rg` for `feature flag`, `feature_flag`, `FEATURE`, and `flag` found provider/config references and documentation language, but no implementation module or runtime flag registry.
- `.env.example` contains provider/API keys but no Assistant GM or accessibility feature flags.
- `turbo.json` passes environment variables for Supabase, sports data, OpenAI, and Resend, but not feature flags.

Backlog conflict:

- The backlog requires feature flags for new Assistant GM voice/write capabilities. A feature-flag foundation appears to be missing and should be created before enabling Voice GM read/write beta behavior.

### Analytics/Telemetry

**PROVEN:** No dedicated analytics or telemetry implementation was found in app code.

Search evidence:

- `rg` for `analytics`, `telemetry`, `Sentry`, and `PostHog` did not identify an application telemetry integration.
- `package-lock.json` includes transitive OpenTelemetry package references, but no app-level telemetry code was found.

### Speech-to-Text / Text-to-Speech

**PROVEN:** No speech-to-text or text-to-speech implementation was found.

Search evidence:

- `rg` for `voice`, `speech`, `stt`, and `tts` found backlog/product-document language only, not runtime code.

## Routing and Navigation Architecture

**PROVEN:** Routing uses Next.js App Router filesystem routes under `apps/web/app`.

Core route files:

- `apps/web/app/page.tsx`: public marketing/home page.
- `apps/web/app/login/page.tsx`: auth UI.
- `apps/web/app/dashboard/page.tsx`: authenticated Front Office/dashboard.
- `apps/web/app/leagues/new/page.tsx`: league creation.
- `apps/web/app/leagues/[leagueId]/page.tsx`: League HQ/standings/draft/invite command page.
- `apps/web/app/leagues/[leagueId]/schedule/page.tsx`: schedule, standings, postseason controls.
- `apps/web/app/leagues/[leagueId]/players/page.tsx`: player search, free agency, waivers.
- `apps/web/app/leagues/[leagueId]/trades/page.tsx`: trade center.
- `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`: league chat/feed.
- `apps/web/app/leagues/[leagueId]/settings/roster-integrity/page.tsx`: commissioner roster integrity settings.
- `apps/web/app/franchises/[franchiseId]/team/page.tsx`: roster and lineup management.
- `apps/web/app/franchises/[franchiseId]/stadium/page.tsx`: stadium/legacy.
- `apps/web/app/drafts/[draftId]/page.tsx`: draft room.
- `apps/web/app/matchups/[matchupId]/page.tsx`: matchup/live scoring/postgame talk/recap entry.
- `apps/web/app/trades/[tradeId]/page.tsx`: private trade room.
- `apps/web/app/recaps/[recapId]/page.tsx`: recap playback.
- `apps/web/app/admin/data/page.tsx`: data sync/admin surface.

**PROVEN:** League, franchise, draft, and matchup route groups wrap pages with a shared top header plus mobile bottom nav.

Relevant files:

- `apps/web/app/leagues/[leagueId]/layout.tsx`
- `apps/web/app/franchises/[franchiseId]/layout.tsx`
- `apps/web/app/drafts/[draftId]/layout.tsx`
- `apps/web/app/matchups/[matchupId]/layout.tsx`
- `apps/web/app/components/BigExecAppHeader.tsx`
- `apps/web/app/components/BigExecMobileNav.tsx`

Current navigation implementation:

- Desktop/header navigation in `BigExecAppHeader.tsx`: `League HQ`, `Locker Room`, `Schedule`, `Trades`, `Players`, plus optional `Roster Integrity` and `Front Office`.
- Mobile navigation in `BigExecMobileNav.tsx`: `Home`, `Team`, `Matchup`, `League`, `Players`.

Backlog/product architecture mismatch:

- **PROVEN:** `docs/UX_UI_PAGE_SPEC.md` requires persistent primary destinations: `Front Office`, `Matchup`, `Locker Room`, `League`, `Stadium`, with desktop left rail and mobile left drawer/sheet.
- **PROVEN:** Current code uses a sticky top header on desktop and fixed bottom nav on mobile, with `Players` and `Team` as primary mobile destinations and no primary `Stadium` destination.
- Recommendation for later tasks: accessibility remediation should account for the current header/bottom-nav architecture but should not harden it further without resolving the canonical navigation mismatch.

## Core Fantasy Feature Locations

### Roster Implementation

**PROVEN:** Roster display is in the team page and reads `roster_entries`.

Relevant files:

- `apps/web/app/franchises/[franchiseId]/team/page.tsx`
- `apps/web/app/franchises/[franchiseId]/team/actions.ts`
- `apps/web/app/leagues/[leagueId]/players/actions.ts`
- `apps/web/app/leagues/[leagueId]/settings/roster-integrity/page.tsx`
- `apps/web/app/leagues/[leagueId]/settings/roster-integrity/actions.ts`
- `docs/ROSTER_INTEGRITY.md`

How it works:

- `team/page.tsx` loads the authenticated user, franchise, current league season, season franchise, active owner record, active `roster_entries`, current-week `lineups`, stadium, and pending roster integrity reviews.
- Active roster assets are rows from `roster_entries` where `dropped_at` is null.
- Individual athletes and D/ST assets are both supported through `athlete_id` and `real_team_id`.
- Bench/roster section displays assets not currently used in the loaded week lineup.
- Roster Integrity review requests call `request_roster_integrity_review` via `apps/web/app/franchises/[franchiseId]/team/actions.ts`.
- Free agent and waiver add/drop flows mutate rosters through Supabase RPCs in `players/actions.ts`, not direct table writes.

Canonical backend/RPC locations:

- `supabase/migrations/20260823183000_inverse_standings_waivers.sql`: `claim_free_agent`, waiver tables/functions.
- `supabase/migrations/20260830225835_roster_integrity_mode.sql`: Roster Integrity tables, triggers, `claim_free_agent`, `process_due_waivers`, `request_roster_integrity_review`, `resolve_roster_integrity_review`, `update_roster_integrity_settings`, `set_franchise_roster_lock`.
- `supabase/migrations/20260830230104_roster_integrity_rpc_privileges.sql`
- `supabase/migrations/20260830230309_commissioner_review_mode_behavior.sql`

Do not duplicate:

- Any Assistant GM roster write must call the canonical RPCs instead of writing `roster_entries` directly.

### Lineup Implementation

**PROVEN:** Lineup UI and roster UI are currently combined on the same team page.

Relevant files:

- `apps/web/app/franchises/[franchiseId]/team/page.tsx`
- `apps/web/app/team/actions.ts`
- `supabase/migrations/20260823183500_waiver_cutoff_and_drop_lock.sql`

How it works:

- `team/page.tsx` defines fixed slots: QB, RB1, RB2, WR1, WR2, TE, FLEX, K, D/ST.
- It loads `lineups` for `season_franchise_id` and selected week.
- It builds eligible player choices per slot from active `roster_entries`.
- Each starter choice posts a form to `setLineup`.
- `apps/web/app/team/actions.ts` calls Supabase RPC `set_lineup_slot` with `season_franchise_id`, `week`, `slot`, `slot_index`, `athlete_id`, and/or `real_team_id`.
- `supabase/migrations/20260823183500_waiver_cutoff_and_drop_lock.sql` contains a table-boundary trigger preventing drops of started roster assets when `lineups.locked_at` is set.

Gap:

- **UNVERIFIED:** The checked-in migrations inspected here did not include the original definition of `set_lineup_slot` or the base `lineups` table. `docs/GATE_STATUS.md` says production contains lineups, but this BE-A11Y-000 task did not query production.

### Player Search

**PROVEN:** Player search exists in the free agency/player page and draft room.

Relevant files:

- `apps/web/app/leagues/[leagueId]/players/page.tsx`
- `apps/web/lib/fantasy/athletePool.ts`
- `apps/web/lib/fantasy/athletePoolCore.ts`
- `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`

How it works:

- Free agency/player index reads all fantasy-eligible active athletes through `loadFantasyEligibleAthletes`.
- `athletePoolCore.ts` pages Supabase `athletes` in 1,000-row chunks with filters `active = true` and positions `QB`, `RB`, `WR`, `TE`, `K`.
- Player page filters server-loaded athletes by query string `q` and `position`.
- D/ST search comes from `real_teams` for the competition.
- Draft room search/filter is client-side local state over server-loaded ranked athletes and defenses.

Tests:

- `apps/web/lib/fantasy/athletePoolCore.test.ts`: verifies pagination and error behavior.

### Waiver System

**PROVEN:** Waivers are implemented through Supabase tables/RPCs and exposed in the Players page.

Relevant files:

- `apps/web/app/leagues/[leagueId]/players/page.tsx`
- `apps/web/app/leagues/[leagueId]/players/actions.ts`
- `supabase/migrations/20260823183000_inverse_standings_waivers.sql`
- `supabase/migrations/20260823183500_waiver_cutoff_and_drop_lock.sql`
- `supabase/migrations/20260830225835_roster_integrity_mode.sql`
- `docs/ROSTER_INTEGRITY.md`

How it works:

- Player page loads open `waiver_holds` for the current league season.
- It loads the current user's `waiver_claims` for those holds.
- It renders claim forms that can require a drop when the roster is full.
- `submitWaiverClaim` calls RPC `submit_waiver_claim`.
- `withdrawWaiverClaim` calls RPC `withdraw_waiver_claim`.
- `claimFreeAgent` blocks open waivers and calls RPC `claim_free_agent`.
- Database function `process_due_waivers` resolves due holds by inverse standings priority and validates roster capacity, ownership, game locks, and Roster Integrity.
- `process_all_due_waivers` loops due league seasons.
- `20260823183000_inverse_standings_waivers.sql` schedules `big-exec-process-waivers` through `pg_cron` when available.

Do not duplicate:

- Assistant GM waiver claims must call `submit_waiver_claim` and use the same confirmation constraints as the UI.

### Draft Room and Draft Engine

**PROVEN:** Draft room UI and draft server actions exist.

Relevant files:

- `apps/web/app/drafts/[draftId]/page.tsx`
- `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
- `apps/web/app/drafts/[draftId]/DraftClock.tsx`
- `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`
- `apps/web/app/drafts/actions.ts`
- `apps/web/lib/fantasy/athletePool.ts`
- `apps/web/lib/fantasy/draftRankings.ts`
- `supabase/migrations/20260826043010_draft_queue.sql`
- `supabase/migrations/20260826043918_draft_timer_autopick.sql`
- `supabase/migrations/20260826044414_draft_realtime_publication.sql`
- `supabase/migrations/20260826044536_draft_pause_resume.sql`
- `supabase/migrations/20260826044713_draft_correction_undo.sql`

How it works:

- League page commissioner form calls `initializeDraft`, which calls RPC `initialize_snake_draft`.
- Draft page loads `drafts`, `draft_picks`, `season_franchises`, owner franchise, eligible athletes, D/ST teams, player/team fantasy scores, and the current user's `draft_queues`.
- `buildDraftRankings` ranks available athletes and D/ST by accumulated fantasy score when available, otherwise deterministic fallback position/name ordering.
- `DraftPlayerPool.tsx` provides local search/filter, queue controls, and draft buttons.
- `apps/web/app/drafts/actions.ts` calls RPCs: `start_draft`, `pause_draft`, `make_draft_pick`, `add_draft_queue_item`, `remove_draft_queue_item`, `move_draft_queue_item`, `process_expired_draft_picks`, `undo_last_draft_pick`.
- `DraftClock.tsx` renders a client countdown from `drafts.current_pick_deadline_at`.
- `DraftRoomLive.tsx` subscribes to `drafts`, `draft_picks`, and current user's `draft_queues`, then calls `router.refresh()`, with 15-second polling fallback.
- Draft autopick/queue logic lives in `process_expired_draft_picks` in SQL.

Tests:

- `apps/web/lib/fantasy/draftRankings.test.ts`
- `apps/web/lib/fantasy/athletePoolCore.test.ts`
- `scripts/qa-full-draft.mjs`

Do not duplicate:

- Assistant GM draft reads/actions should use `drafts`, `draft_picks`, `draft_queues`, and the existing draft RPCs.
- Beta write actions must require explicit confirmation before calling `make_draft_pick`.

### Matchup / Live Scoring

**PROVEN:** Matchup UI exists and reads matchup, lineup, and fantasy score tables.

Relevant files:

- `apps/web/app/matchups/[matchupId]/page.tsx`
- `apps/web/app/matchups/actions.ts`
- `packages/fantasy-core/src/scoring.ts`
- `packages/fantasy-core/src/scoring.test.ts`
- `packages/competition-engine/src/index.ts`
- `supabase/migrations/20260823174500_six_point_passing_touchdowns.sql`
- `supabase/migrations/20260823170000_core_integrity_trade_deadline.sql`

How it works:

- Matchup page loads a `matchups` row, home/away season franchise identities, lineups for both teams, `fantasy_player_scores`, `fantasy_team_scores`, optional generated messages, and recap script.
- It computes display rows by mapping lineup assets to score rows.
- `refreshMatchup` and `finalizeMatchup` call RPC `recompute_matchup`.
- `buildArcadeRecap` calls RPC `build_matchup_recap`.
- `packages/fantasy-core/src/scoring.ts` has deterministic half-PPR football and D/ST scoring helpers.
- SQL migration `20260823174500_six_point_passing_touchdowns.sql` defines `calculate_pro_football_player_scores` with six-point passing touchdowns.

Gaps:

- **UNVERIFIED:** This task did not prove current live game ingestion, latency, stat corrections, or realtime matchup refresh.
- **PROVEN:** No client realtime subscription was found for matchup scores analogous to Draft Room or Locker Room.

### Standings

**PROVEN:** Standings are rendered in League HQ and Schedule pages from the `standings` table.

Relevant files:

- `apps/web/app/leagues/[leagueId]/page.tsx`
- `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
- `packages/competition-engine/src/index.ts`
- `supabase/migrations/20260823170000_core_integrity_trade_deadline.sql`
- `apps/web/app/matchups/actions.ts`

How it works:

- League page loads `standings` for current league season ordered by wins and points for.
- Schedule page loads `standings`, `matchups`, `postseason_seeds`, and `championships`.
- Matchup finalization calls `recompute_matchup`, which is expected to update matchup/standings state at the database layer.
- `competition-engine` provides deterministic `resolveMatchup`, but current web pages call Supabase RPCs for authoritative updates.

Gap:

- **UNVERIFIED:** The checked-in migrations inspected here do not include the base schema/function body for `recompute_matchup` or all standings updates.

### League Chat / Locker Room

**PROVEN:** Locker Room is the league chat and public event feed.

Relevant files:

- `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`
- `apps/web/app/social/actions.ts`
- `supabase/migrations/20260823170000_core_integrity_trade_deadline.sql`

How it works:

- Locker Room page loads `league_feed_events`, `feed_reactions`, and `user_profiles`.
- Human messages are events with `event_type === 'locker_room_message'`.
- System/deterministic league events share the same feed table.
- Composer posts through `postLockerMessage`, which calls RPC `post_locker_room_message`.
- Reactions call `toggleReaction`, which calls RPC `toggle_feed_reaction`.
- Commissioner weekly awards call `generate_weekly_awards`.
- `LockerRoomLive.tsx` subscribes to Supabase realtime `league_feed_events` and refreshes the route, with 20-second polling fallback.

### Notifications

**PROVEN:** Transactional email support exists for invites and email templates; in-app status notices exist as per-page `role="status"`/`role="alert"` messages.

Relevant files:

- `apps/web/lib/email/resend.ts`
- `apps/web/lib/email/templates.ts`
- `apps/web/app/leagues/actions.ts`
- `docs/EMAIL_SYSTEM.md`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/leagues/[leagueId]/players/page.tsx`
- `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- `apps/web/app/matchups/[matchupId]/page.tsx`

How it works:

- `createLeagueInvite` calls `create_league_invite`, builds a league invite email, and sends it through Resend when `RESEND_BIGEXEC_API_KEY` is configured.
- `resend.ts` returns `{ sent: false, reason: 'not_configured' }` if the API key is absent.
- Email templates include league invite, draft announcement, and matchup final templates.
- Per-page notices use query-string state and CSS classes such as `successNotice`/`errorNotice`.

Gaps:

- **PROVEN:** No dedicated in-app notifications table/service/page was found in app code.
- **UNVERIFIED:** Draft announcement and matchup-final templates are not proven wired to sending flows in inspected app code.

## Current AI / Assistant GM Implementation

**PROVEN:** There is current AI integration for postgame Locker Room line generation, but no general Assistant GM architecture was found.

Relevant files:

- `apps/web/app/matchups/actions.ts`
- `apps/web/app/matchups/[matchupId]/page.tsx`
- `packages/story-engine/src/index.ts`
- `.env.example`
- `turbo.json`

How current AI works:

- Matchup page exposes a final-matchup `POSTGAME MIC` UI with tones: `respect`, `playful`, `petty`, `savage`.
- `generatePostgameTalk` loads authoritative final matchup facts from Supabase and verifies the requester owns a participating franchise.
- `aiOptions` calls OpenAI Responses API only if `OPENAI_API_KEY` is configured.
- The prompt instructs the model to return exactly three short strings and not invent scores, records, injuries, rivalry history, player facts, or private trade info.
- If OpenAI is unavailable or invalid, `fallbackOptions` returns deterministic template options.
- Generated options are stored through RPC `record_generated_message`.
- Posting a selected/edited option calls RPC `post_generated_message`, which posts to Locker Room.
- `packages/story-engine/src/index.ts` contains `buildNarrationContext` with an explicit instruction to narrate only supplied authoritative facts.

Backlog conflict:

- The backlog refers to Voice Assistant GM capabilities, structured read layer, speech, and safe transactions. **PROVEN:** none of those exist as a current architecture in the inspected code.
- Next implementation should introduce Assistant GM as a structured server-side read/write layer over existing Supabase tables/RPCs, not as DOM/screenshot/screen-reading logic.

## Fantasy Rules and Transaction Services

### Deterministic Rules Packages

**PROVEN:** Rules packages exist but are small.

Relevant files:

- `packages/fantasy-core/src/scoring.ts`: half-PPR football and D/ST scoring.
- `packages/fantasy-core/src/index.ts`
- `packages/competition-engine/src/index.ts`: event types and deterministic matchup resolution helper.
- `packages/story-engine/src/index.ts`: narration-context guardrail over authoritative facts.
- `packages/sports-data/src/index.ts`: provider-neutral sports-data types/config readiness.
- `apps/web/lib/sports-data/sportradar.ts`: Sportradar provider implementation/config.

### Transaction Boundaries

**PROVEN:** Current user-facing transaction services are mostly Next.js Server Actions that call Supabase RPCs.

Relevant files:

- `apps/web/app/team/actions.ts`: `setLineup` -> `set_lineup_slot`.
- `apps/web/app/leagues/[leagueId]/players/actions.ts`: `claimFreeAgent` -> `claim_free_agent`; `submitWaiverClaim` -> `submit_waiver_claim`; `withdrawWaiverClaim` -> `withdraw_waiver_claim`.
- `apps/web/app/drafts/actions.ts`: draft lifecycle, pick, queue, autopick, pause, undo RPCs.
- `apps/web/app/social/actions.ts`: locker messages, reactions, trades, awards.
- `apps/web/app/leagues/actions.ts`: league creation, invite, schedule, special weeks, postseason RPCs.
- `apps/web/app/matchups/actions.ts`: recompute/finalize matchup, postgame talk, recap build.
- `apps/web/app/leagues/[leagueId]/settings/roster-integrity/actions.ts`: roster integrity policy/review/lock RPCs.

Do not duplicate:

- Voice GM write actions should reuse these RPC boundaries and add confirmation/feature flags around them.

## Data Access Layer

**PROVEN:** Data access is direct Supabase table/RPC calls embedded in pages/actions plus a few thin helper modules.

Relevant files:

- `apps/web/lib/supabase/server.ts`
- `apps/web/lib/supabase/client.ts`
- `apps/web/lib/supabase/admin.ts`
- `apps/web/lib/supabase/publicConfig.ts`
- `apps/web/lib/fantasy/athletePool.ts`
- `apps/web/lib/fantasy/athletePoolCore.ts`
- `apps/web/lib/fantasy/draftRankings.ts`

Implication for backlog:

- A structured Assistant GM read layer can either be added as a new server-only library under `apps/web/lib/assistant-gm/` or equivalent, but it must read Supabase authoritative state directly and call existing RPCs for writes.

## Existing Accessibility Support

**PROVEN:** Accessibility support exists in scattered markup and CSS, not as a centralized utility/test framework.

Relevant files:

- `apps/web/app/layout.tsx`: `<html lang="en">`.
- `apps/web/app/gate5.css`: `.srOnly` utility.
- `apps/web/app/components/BigExecAppHeader.tsx`: nav `aria-label`, active `aria-current`, brand `aria-label`.
- `apps/web/app/components/BigExecMobileNav.tsx`: primary nav `aria-label`, decorative icon `aria-hidden`, disabled spans `aria-disabled`.
- `apps/web/app/components/FranchiseCrest.tsx`: non-decorative SVG role/label and decorative hidden mode.
- `apps/web/app/components/SportIdentity.tsx`: role image/aria label, decorative ball hidden.
- `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`: `aria-labelledby`, `aria-live`, button `aria-label`, filter `aria-pressed`, `role="group"`, `srOnly` search label.
- `apps/web/app/drafts/[draftId]/DraftClock.tsx`: `aria-live="polite"`.
- `apps/web/app/leagues/[leagueId]/players/page.tsx`: search input `aria-label`, status/error roles.
- `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`: conversation `aria-label`, message list `aria-live`, composer `srOnly` label, reaction buttons `aria-label`/`aria-pressed`.
- `apps/web/app/matchups/[matchupId]/page.tsx`: error alert role.
- `apps/web/app/login/page.tsx`: field labels, `aria-describedby` for password help, alert/status notices.
- `apps/web/app/forms-gate5.css`: focus styling for inputs/selects/textareas.

Gaps:

- **PROVEN:** No axe, jest-axe, Playwright accessibility-tree assertions, or dedicated accessibility test command was found.
- **PROVEN:** No central Button/IconButton/Dialog/Tabs/Toast primitives were found; pages use raw HTML elements and CSS classes.
- **LIKELY / INFERRED:** Later accessibility work will need shared primitives or at least shared conventions before fixing every page one-by-one.

## Automated Tests

**PROVEN:** Unit tests use Vitest. Browser QA uses Playwright and custom scripts.

Commands:

- Root: `npm test`, `npm run typecheck`, `npm run build`, `npm run qa:playwright`.
- Web workspace: `npm test --workspace @fantasy-all-sports/web`, `npm run typecheck --workspace @fantasy-all-sports/web`, `npm run build --workspace @fantasy-all-sports/web`.
- QA scripts: `npm run qa:league:reset`, `npm run qa:auth:save`, `npm run qa:draft:run`, `npm run qa:transactions:run`, `npm run qa:roster-integrity:audit`, `npm run qa:roster-integrity:visual`.

Relevant files:

- `apps/web/lib/fantasy/athletePoolCore.test.ts`
- `apps/web/lib/fantasy/draftRankings.test.ts`
- `packages/fantasy-core/src/scoring.test.ts`
- `tests/e2e/big-exec-qa.spec.ts`
- `tests/e2e/global-setup.ts`
- `playwright.config.ts`
- `scripts/qa-full-draft.mjs`
- `scripts/qa-transactions-run.mjs`
- `scripts/qa-roster-integrity-audit.mjs`
- `scripts/qa-roster-integrity-visual.mjs`
- `scripts/qa-league-reset.mjs`
- `scripts/qa-auth-save.mjs`

Coverage observed:

- Athlete pool pagination.
- Draft ranking deterministic ordering.
- Half-PPR football and D/ST scoring.
- Playwright e2e/visual QA harness for front office, league, draft room, free agency, trade room, stadium/history surfaces.
- Roster Integrity QA scripts and documented visual evidence from 2026-08-31 in `docs/ROSTER_INTEGRITY.md`.

Gaps:

- **PROVEN:** No dedicated accessibility automated tests were found.
- **PROVEN:** No Voice GM or Assistant GM tests were found.

## CI/CD Configuration

**PROVEN:** GitHub Actions CI exists for app verification and recap renderer.

Relevant files:

- `.github/workflows/ci.yml`: on push to main and pull request; runs Node 22, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- `.github/workflows/recap-renderer.yml`: service-scoped CI for recap renderer; Node 24, `npm ci`, `npm run build`, Docker build, GHCR publish on main.
- `turbo.json`: build/test/typecheck task graph and env pass-through.

Deployment:

- **LIKELY / INFERRED:** Vercel is used for production app deployment based on `docs/GATE_STATUS.md`, but no `.vercel/project.json`, `vercel.json`, or `.openai/hosting.json` was found in the repository root during this audit.

## Backlog Architecture Conflicts / Mismatches

1. **PROVEN:** Backlog requires feature flags for Assistant GM voice/write capabilities; no current feature-flag system was found.
2. **PROVEN:** Backlog assumes future Voice Assistant GM architecture; current repo has only postgame talk generation, not Assistant GM read/write/speech layers.
3. **PROVEN:** Backlog requires no AI screen-reading; current code has no Assistant GM, so future implementation must use Supabase authoritative state and existing RPCs.
4. **PROVEN:** Canonical UX spec requires desktop left rail and mobile left drawer/sheet; current navigation is desktop sticky top header plus mobile fixed bottom nav.
5. **PROVEN:** Roster and lineup share one Team HQ page; backlog lists roster and lineup as separate core screens. Future tasks should map both to `apps/web/app/franchises/[franchiseId]/team/page.tsx` unless/until product routes change.
6. **PROVEN:** Player search appears in both Players page and Draft Player Pool. Future audit/remediation must cover both contexts.
7. **PROVEN:** Notifications are not a dedicated in-app system; only transactional email templates/sending and per-page status messages were found.
8. **PROVEN:** Accessibility utilities/tests are scattered/minimal; no central primitive or automated a11y harness exists.
9. **UNVERIFIED:** Some canonical DB objects used by app code, including `set_lineup_slot` and `recompute_matchup`, were not defined in checked-in migrations inspected here. `docs/GATE_STATUS.md` says production has broader schema history than version control. Do not infer missing implementation solely from local migration files.

## Recommended Mapping for Next Backlog Tasks

### BE-A11Y-001 Accessibility Baseline Audit

Map core screens to these current files:

- Sign-in: `apps/web/app/login/page.tsx`, `apps/web/app/auth/actions.ts`.
- League home / Front Office: `apps/web/app/dashboard/page.tsx`.
- League HQ / standings: `apps/web/app/leagues/[leagueId]/page.tsx`.
- Roster + lineup: `apps/web/app/franchises/[franchiseId]/team/page.tsx`, `apps/web/app/team/actions.ts`.
- Player search / free agency / waivers: `apps/web/app/leagues/[leagueId]/players/page.tsx`, `apps/web/app/leagues/[leagueId]/players/actions.ts`.
- Draft room: `apps/web/app/drafts/[draftId]/page.tsx`, `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`, `apps/web/app/drafts/[draftId]/DraftClock.tsx`, `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`, `apps/web/app/drafts/actions.ts`.
- Matchup/live scoring: `apps/web/app/matchups/[matchupId]/page.tsx`, `apps/web/app/matchups/actions.ts`.
- Standings/schedule/postseason: `apps/web/app/leagues/[leagueId]/page.tsx`, `apps/web/app/leagues/[leagueId]/schedule/page.tsx`.
- League chat: `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`, `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`, `apps/web/app/social/actions.ts`.
- Trades: `apps/web/app/leagues/[leagueId]/trades/page.tsx`, `apps/web/app/trades/[tradeId]/page.tsx`, `apps/web/app/social/actions.ts`.
- Notifications: `apps/web/lib/email/resend.ts`, `apps/web/lib/email/templates.ts`, page-level notices in the screen files above.
- Existing AI/postgame talk: `apps/web/app/matchups/actions.ts`, `apps/web/app/matchups/[matchupId]/page.tsx`.

### BE-A11Y-002 Accessibility Test Matrix

Use current Playwright structure:

- `playwright.config.ts`
- `tests/e2e/big-exec-qa.spec.ts`
- `scripts/qa-auth-save.mjs`
- `scripts/qa-league-reset.mjs`

Add new docs only until remediation is authorized:

- `docs/accessibility/baseline-audit.md`
- `docs/accessibility/test-matrix.md`

### BE-A11Y-010 Accessible Primitive Inventory

Start with current shared components and CSS utilities:

- `apps/web/app/components/BigExecAppHeader.tsx`
- `apps/web/app/components/BigExecMobileNav.tsx`
- `apps/web/app/components/BigExecBrand.tsx`
- `apps/web/app/components/FranchiseCrest.tsx`
- `apps/web/app/components/FranchiseIdentityFields.tsx`
- `apps/web/app/components/SportIdentity.tsx`
- `apps/web/app/gate5.css`
- `apps/web/app/forms-gate5.css`
- `apps/web/app/mobile-nav.css`

Expected conflict:

- There are no current shared Button/Dialog/Tabs/Toast primitives. Decide whether to centralize before broad remediation.

### M4-M6 Assistant GM / Voice GM Future Mapping

Do not create duplicate fantasy engines. Build around:

- Reads: Supabase authoritative tables already used by current pages: `franchises`, `season_franchises`, `roster_entries`, `lineups`, `athletes`, `real_teams`, `waiver_holds`, `waiver_claims`, `drafts`, `draft_picks`, `draft_queues`, `matchups`, `standings`, `league_feed_events`, `trades`, `trade_items`.
- Writes: existing server action/RPC boundaries in `apps/web/app/team/actions.ts`, `apps/web/app/leagues/[leagueId]/players/actions.ts`, `apps/web/app/drafts/actions.ts`, `apps/web/app/social/actions.ts`, `apps/web/app/matchups/actions.ts`, `apps/web/app/leagues/actions.ts`.
- AI precedent: `apps/web/app/matchups/actions.ts` and `packages/story-engine/src/index.ts`.
- Feature flags: add a new feature-flag foundation before exposing voice/read/write surfaces.
- Speech: no current implementation; select/add only after BE-A11Y-001/002 and feature-flag foundation are done.

## Files Inspected

Primary product/guardrail/backlog docs:

- `/Users/harmonyclawcole/Desktop/big-exec-codex-accessibility-voice-gm-implementation-backlog.md`
- `AGENTS.md`
- `docs/PRODUCT_PRD.md`
- `docs/OPERATING_GUARDRAILS.md`
- `docs/GATE_STATUS.md`
- `docs/CURRENT_WORK.md`
- `docs/UX_UI_PAGE_SPEC.md`
- `docs/guardrails/GUARDRAILS_01_TRUTH_TIME_SCOPE.md`
- `docs/guardrails/GUARDRAILS_02_AUTONOMY_QA_CANON.md`
- `docs/guardrails/GUARDRAILS_03_DELIVERY_CORRECTIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/ROSTER_INTEGRITY.md`
- `docs/EMAIL_SYSTEM.md`

Config/package/CI:

- `package.json`
- `package-lock.json`
- `turbo.json`
- `.env.example`
- `.github/workflows/ci.yml`
- `.github/workflows/recap-renderer.yml`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `playwright.config.ts`
- `services/recap-renderer/package.json`

Web app:

- `apps/web/app/layout.tsx`
- `apps/web/app/page.tsx`
- `apps/web/app/login/page.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/leagues/[leagueId]/layout.tsx`
- `apps/web/app/leagues/[leagueId]/page.tsx`
- `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
- `apps/web/app/leagues/[leagueId]/players/page.tsx`
- `apps/web/app/leagues/[leagueId]/players/actions.ts`
- `apps/web/app/leagues/[leagueId]/trades/page.tsx`
- `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`
- `apps/web/app/leagues/[leagueId]/settings/roster-integrity/page.tsx`
- `apps/web/app/leagues/[leagueId]/settings/roster-integrity/actions.ts`
- `apps/web/app/franchises/[franchiseId]/layout.tsx`
- `apps/web/app/franchises/[franchiseId]/team/page.tsx`
- `apps/web/app/franchises/[franchiseId]/team/actions.ts`
- `apps/web/app/franchises/[franchiseId]/stadium/page.tsx`
- `apps/web/app/drafts/[draftId]/layout.tsx`
- `apps/web/app/drafts/[draftId]/page.tsx`
- `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
- `apps/web/app/drafts/[draftId]/DraftClock.tsx`
- `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`
- `apps/web/app/drafts/actions.ts`
- `apps/web/app/matchups/[matchupId]/layout.tsx`
- `apps/web/app/matchups/[matchupId]/page.tsx`
- `apps/web/app/matchups/actions.ts`
- `apps/web/app/trades/[tradeId]/page.tsx`
- `apps/web/app/social/actions.ts`
- `apps/web/app/team/actions.ts`
- `apps/web/app/leagues/actions.ts`
- `apps/web/app/auth/actions.ts`
- `apps/web/app/auth/confirm/route.ts`
- `apps/web/app/admin/data/page.tsx`
- `apps/web/app/recaps/[recapId]/page.tsx`
- `apps/web/app/components/BigExecAppHeader.tsx`
- `apps/web/app/components/BigExecMobileNav.tsx`
- `apps/web/app/components/BigExecBrand.tsx`
- `apps/web/app/components/FranchiseCrest.tsx`
- `apps/web/app/components/FranchiseIdentityFields.tsx`
- `apps/web/app/components/SportIdentity.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/gate5.css`
- `apps/web/app/forms-gate5.css`
- `apps/web/app/mobile-nav.css`
- `apps/web/lib/supabase/server.ts`
- `apps/web/lib/supabase/client.ts`
- `apps/web/lib/supabase/admin.ts`
- `apps/web/lib/supabase/publicConfig.ts`
- `apps/web/lib/fantasy/athletePool.ts`
- `apps/web/lib/fantasy/athletePoolCore.ts`
- `apps/web/lib/fantasy/draftRankings.ts`
- `apps/web/lib/email/resend.ts`
- `apps/web/lib/email/templates.ts`
- `apps/web/lib/sports-data/sportradar.ts`
- `apps/web/middleware.ts`

Packages/services/tests/migrations:

- `packages/fantasy-core/src/index.ts`
- `packages/fantasy-core/src/scoring.ts`
- `packages/fantasy-core/src/scoring.test.ts`
- `packages/competition-engine/src/index.ts`
- `packages/story-engine/src/index.ts`
- `packages/sports-data/src/index.ts`
- `apps/web/lib/fantasy/athletePoolCore.test.ts`
- `apps/web/lib/fantasy/draftRankings.test.ts`
- `tests/e2e/big-exec-qa.spec.ts`
- `tests/e2e/global-setup.ts`
- `scripts/qa-auth-save.mjs`
- `scripts/qa-actors.mjs`
- `scripts/qa-league-reset.mjs`
- `scripts/qa-full-draft.mjs`
- `scripts/qa-transactions-run.mjs`
- `scripts/qa-roster-integrity-audit.mjs`
- `scripts/qa-roster-integrity-visual.mjs`
- `supabase/README.md`
- `supabase/migrations/20260823170000_core_integrity_trade_deadline.sql`
- `supabase/migrations/20260823174500_six_point_passing_touchdowns.sql`
- `supabase/migrations/20260823183000_inverse_standings_waivers.sql`
- `supabase/migrations/20260823183500_waiver_cutoff_and_drop_lock.sql`
- `supabase/migrations/20260826043010_draft_queue.sql`
- `supabase/migrations/20260826043918_draft_timer_autopick.sql`
- `supabase/migrations/20260826044414_draft_realtime_publication.sql`
- `supabase/migrations/20260826044536_draft_pause_resume.sql`
- `supabase/migrations/20260826044713_draft_correction_undo.sql`
- `supabase/migrations/20260830225835_roster_integrity_mode.sql`
- `supabase/migrations/20260830230104_roster_integrity_rpc_privileges.sql`
- `supabase/migrations/20260830230309_commissioner_review_mode_behavior.sql`
