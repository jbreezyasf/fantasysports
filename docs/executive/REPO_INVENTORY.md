# Executive League + Assistant GM Pro+ Repo Inventory

Task: BE-EXEC-000  
Date: 2026-09-02  
Change type: Audit/documentation only  
Production code changed: No  
Production data/schema changed: No

## Evidence Boundary

This inventory maps `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_PRD.md` and `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_TASKS.md` to the actual Big Exec repository and production Supabase schema.

Evidence labels:

- **PROVEN**: verified against current source, GitHub/Vercel metadata, or read-only production Supabase queries on 2026-09-02.
- **LIKELY / INFERRED**: strongly indicated by repository evidence but not fully reproduced in a production-equivalent user flow during this task.
- **UNVERIFIED**: not found, not queried successfully, or not executed during this task.

Supabase note: current Supabase changelog review found the 2026 public-table Data API grant change and extension-version pinning change. Future Executive migrations must explicitly consider grants/RLS and should not rely on implicit public schema exposure.

## Current Version And Deployment

- **PROVEN:** Local `main`, `origin/main`, and `HEAD` are `d0f175cde9342bec5d89a28cd9cf336d82c63a78`.
- **PROVEN:** Latest GitHub deployment metadata for environment `Production` references commit `d0f175cde9342bec5d89a28cd9cf336d82c63a78`, created `2026-09-02T05:32:22Z`.
- **PROVEN:** GitHub Actions CI run `33595010702` for commit `d0f175cde9342bec5d89a28cd9cf336d82c63a78` completed successfully.
- **UNVERIFIED:** This task did not inspect the rendered production website or Vercel runtime logs after the merge.

## Repository Stack

- **PROVEN:** The repo is an npm workspace/Turborepo project.
  - `package.json`
  - `package-lock.json`
  - `turbo.json`
- **PROVEN:** The primary app is a Next.js App Router web app with React 19, TypeScript, `@supabase/ssr`, and `@supabase/supabase-js`.
  - `apps/web/package.json`
  - `apps/web/app/layout.tsx`
  - `apps/web/middleware.ts`
  - `apps/web/lib/supabase/server.ts`
  - `apps/web/lib/supabase/client.ts`
  - `apps/web/lib/supabase/admin.ts`
- **PROVEN:** There is no native mobile app in this repo. Mobile support is responsive web plus Playwright mobile viewport coverage.
  - `apps/web/app/mobile-nav.css`
  - `apps/web/app/components/BigExecMobileNav.tsx`
  - `playwright.config.ts`
- **PROVEN:** Deterministic support packages exist outside the web app.
  - `packages/fantasy-core/src/scoring.ts`
  - `packages/competition-engine/src/index.ts`
  - `packages/story-engine/src/index.ts`
  - `packages/sports-data/src/index.ts`
- **PROVEN:** Recap rendering is a separate service.
  - `services/recap-renderer/src/worker.ts`
  - `services/recap-renderer/src/server.ts`
  - `services/recap-renderer/src/browser/render.ts`
  - `.github/workflows/recap-renderer.yml`

## Auth, Data Access, And Routing

- **PROVEN:** Supabase Auth is the app identity layer.
  - `apps/web/app/auth/actions.ts`
  - `apps/web/app/login/page.tsx`
  - `apps/web/app/auth/confirm/route.ts`
  - `apps/web/middleware.ts`
- **PROVEN:** The backend model is Supabase tables/RPCs plus Next.js Server Components and Server Actions.
  - Server client: `apps/web/lib/supabase/server.ts`
  - Browser client: `apps/web/lib/supabase/client.ts`
  - Service-role admin client: `apps/web/lib/supabase/admin.ts`
  - Versioned local migrations: `supabase/migrations/*.sql`
- **PROVEN:** Core user routes are filesystem routes under `apps/web/app`.
  - Front Office/dashboard: `apps/web/app/dashboard/page.tsx`
  - League HQ: `apps/web/app/leagues/[leagueId]/page.tsx`
  - League schedule/standings: `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
  - Player search/free agency/waivers: `apps/web/app/leagues/[leagueId]/players/page.tsx`
  - Trades: `apps/web/app/leagues/[leagueId]/trades/page.tsx`, `apps/web/app/trades/[tradeId]/page.tsx`
  - Locker Room: `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
  - Team roster/lineup: `apps/web/app/franchises/[franchiseId]/team/page.tsx`
  - Stadium/legacy: `apps/web/app/franchises/[franchiseId]/stadium/page.tsx`
  - Draft Room: `apps/web/app/drafts/[draftId]/page.tsx`
  - Matchup/live scoring: `apps/web/app/matchups/[matchupId]/page.tsx`
  - Recaps: `apps/web/app/recaps/[recapId]/page.tsx`
  - Ops Portal source: `apps/web/app/ops/**`

## Production Supabase Shape

### Naming And Core Tables

- **PROVEN:** Production uses `fantasy_leagues`, `league_members`, and `league_invites`, not `leagues`, `league_memberships`, or `league_invitations`.
- **PROVEN:** Relevant production tables found:
  - League/auth context: `fantasy_leagues`, `league_seasons`, `league_members`, `league_invites`, `user_profiles`, `franchises`, `franchise_owners`, `season_franchises`, `sports`, `scoring_profiles`
  - Draft: `drafts`, `draft_picks`, `draft_queues`, `draft_corrections`
  - Team management: `roster_entries`, `lineups`
  - Players/data: `athletes`, `athlete_provider_ids`, `real_teams`, `real_games`, `athlete_game_stats`
  - Waivers: `waiver_holds`, `waiver_claims`
  - Trades: `trades`, `trade_items`, `trade_messages`
  - Communication/events: `league_feed_events`, `feed_reactions`, `generated_messages`
  - Scoring/season: `matchups`, `standings`, `fantasy_player_scores`, `fantasy_team_scores`, `weekly_awards`, `championships`, `story_events`
  - Recaps: `recap_scripts`, `recap_scenes`, `recap_renders`
- **PROVEN:** Production does not currently contain the planned/new Executive tables checked by this task: `league_season_entitlements`, `assistant_gm_usage_ledger`, `assistant_gm_conversations`, `assistant_gm_messages`, `stripe_events`.
- **PROVEN:** Production also does not currently contain local Ops Portal tables `ops_staff_roles` or `ops_audit_events`; `supabase/migrations/20260901090000_ops_portal_phase1.sql` exists in source but is not recorded in production migration history.

### RLS, Policies, Grants, And RPCs

- **PROVEN:** Production RLS is enabled on checked core tables including `fantasy_leagues`, `league_seasons`, `league_members`, `league_invites`, `franchises`, `season_franchises`, `drafts`, `draft_picks`, `draft_queues`, `roster_entries`, `lineups`, `waiver_holds`, `waiver_claims`, `trades`, `trade_items`, `trade_messages`, `league_feed_events`, `feed_reactions`, and `generated_messages`.
- **PROVEN:** Production policy counts exist for those tables, with examples: `fantasy_leagues` 4, `league_members` 4, `league_invites` 4, `lineups` 3, `drafts` 2, `draft_picks` 2, `draft_queues` 1, `waiver_claims` 1, `waiver_holds` 1.
- **PROVEN:** Production has active cron jobs:
  - `big-exec-process-waivers`: `*/15 * * * *`, `select public.process_all_due_waivers();`
  - `big-exec-process-draft-autopicks`: `* * * * *`, `select public.process_expired_draft_picks();`
- **PROVEN:** Supabase Realtime publication contains `drafts`, `draft_picks`, `draft_queues`, `league_feed_events`, and `feed_reactions`.
- **PROVEN:** Core RPCs present as `SECURITY DEFINER` functions include `start_draft`, `make_draft_pick`, `add_draft_queue_item`, `remove_draft_queue_item`, `move_draft_queue_item`, `process_expired_draft_picks`, `pause_draft`, `undo_last_draft_pick`, `set_lineup_slot`, `claim_free_agent`, `submit_waiver_claim`, `withdraw_waiver_claim`, `process_due_waivers`, `process_all_due_waivers`, and `build_matchup_recap`.
- **PROVEN:** Some social/generated-message RPCs still show public execute in ACL output: `post_locker_room_message`, `post_trade_message`, `toggle_feed_reaction`, `record_generated_message`, `post_generated_message`, and `generate_weekly_awards`.
- **UNVERIFIED:** This task did not execute actor-class permission tests against those RPCs. Do not treat ACL shape alone as proof of exploitable behavior because function bodies may enforce auth.

### Migration Drift

- **PROVEN:** Production migration history remains longer than checked-in migrations. Recent production history ends at:
  - `20260830230309_commissioner_review_mode_behavior`
  - `20260830230104_roster_integrity_rpc_privileges`
  - `20260830225835_roster_integrity_mode`
  - earlier 20260823 multi-season/history/social/scoring migrations not all present locally.
- **PROVEN:** Local migrations include Draft Night and Ops Portal files not all recorded in production history.
- **LIKELY / INFERRED:** Future Executive migrations should be written as idempotent, version-controlled files, but production deployment will still need special care because historical migration drift has blocked normal `supabase db push --linked --dry-run` before.

## Current AI, Assistant GM, Voice, And Accessibility

### Current AI/LLM Usage

- **PROVEN:** Current production app source has a narrow OpenAI usage path only for generated matchup talk.
  - `apps/web/app/matchups/actions.ts`
  - Environment: `OPENAI_API_KEY`
  - Database RPCs: `record_generated_message`, `post_generated_message`
- **PROVEN:** This is not the Executive Assistant GM gateway described by the PRD.
- **PROVEN:** Assistant GM structured helper modules now exist in source after the accessibility/voice backlog work.
  - Read tools: `apps/web/lib/assistant-gm/tools.ts`
  - Grounding: `apps/web/lib/assistant-gm/grounding.ts`
  - Read intent renderers: `rosterLineupIntents.ts`, `matchupStandingsIntents.ts`, `playerSearchIntents.ts`, `draftIntents.ts`, `waiverIntents.ts`, `sundayBriefing.ts`
  - Confirmation/write helpers: `transactionConfirmations.ts`, `lineupTransactions.ts`, `draftTransactions.ts`, `waiverTransactions.ts`, `autonomyGuard.ts`, `actionAuditLog.ts`
- **PROVEN:** Those modules have unit tests, but no browser-facing Assistant GM API/gateway endpoint is implemented.
- **PROVEN:** Static Assistant GM FAQ knowledge base exists.
  - `docs/assistant-gm/knowledge-base/00_READ_THIS_FIRST.md`
  - `docs/assistant-gm/knowledge-base/01_ROUTING_INDEX.md`
  - `docs/assistant-gm/knowledge-base/faq/*.md`
- **UNVERIFIED:** No production prompt routing, model router, usage ledger, conversation retention, or entitlement enforcement exists.

### Voice And Feature Flags

- **PROVEN:** Voice feature flags exist only for the accessibility/voice foundation:
  - `apps/web/lib/feature-flags/voiceFlags.ts`
  - `.env.example`
  - `turbo.json`
- **PROVEN:** Existing flags are `BIG_EXEC_VOICE_GM`, `BIG_EXEC_VOICE_GM_TRANSACTIONS`, `BIG_EXEC_VOICE_DRAFTING`, `BIG_EXEC_VOICE_WAIVERS`, `BIG_EXEC_VOICE_LINEUP`, and `BIG_EXEC_ACCESSIBILITY_SPOKEN_UPDATES`.
- **PROVEN:** Executive backlog flags do not yet exist: `assistant_gm`, `assistant_gm_pro_plus`, `assistant_gm_voice_input`, `assistant_gm_cloud_tts`, `assistant_gm_proactive_briefs`, `assistant_gm_write_tools`, `assistant_gm_draft_actions`, `assistant_gm_lineup_actions`, `assistant_gm_waiver_actions`, and `executive_checkout`.
- **PROVEN:** Push-to-talk UI exists behind `voice_gm` feature flag in app layouts.
  - `apps/web/app/components/AskGmPushToTalk.tsx`
  - `apps/web/app/components/BigExecAppHeader.tsx`
  - `apps/web/app/leagues/[leagueId]/layout.tsx`
  - `apps/web/app/franchises/[franchiseId]/layout.tsx`
  - `apps/web/app/drafts/[draftId]/layout.tsx`
  - `apps/web/app/matchups/[matchupId]/layout.tsx`
- **PROVEN:** Browser STT/TTS adapters exist.
  - `apps/web/lib/voice/speechToText.ts`
  - `apps/web/lib/voice/textToSpeech.ts`
  - `apps/web/lib/voice/voiceErrors.ts`
- **UNVERIFIED:** The Ask GM UI does not call a real Assistant GM server endpoint yet; current processing falls back to an error state.

### Accessibility Foundation

- **PROVEN:** Shared accessibility primitives and announcement/focus utilities exist.
  - `apps/web/app/components/accessibility.tsx`
  - `apps/web/app/components/focusManagement.ts`
  - `apps/web/app/components/announcementQueue.ts`
  - `apps/web/app/components/ScreenReaderAnnouncer.tsx`
- **PROVEN:** Automated accessibility tests exist.
  - `apps/web/app/accessibility-automation/axeTooling.test.ts`
  - `apps/web/app/accessibility-automation/p0ScreenRegression.test.ts`
  - `npm run test:a11y --workspace @fantasy-all-sports/web`
- **PROVEN:** Current accessibility task docs show many M0-M7 accessibility/voice foundations are already implemented or partially implemented under `docs/accessibility/*.md`.
- **UNVERIFIED:** VoiceOver/TalkBack device-matrix testing remains not run.

## Payments And Entitlements

- **PROVEN:** No Stripe dependency, checkout route/action, webhook route, Stripe event table, or entitlement table/service was found in current app source or production schema.
- **PROVEN:** `.env.example` does not contain Stripe product, price, or webhook variables.
- **PROVEN:** PRD requires one paid offer: `Big Exec Executive League Season Pass`, $99 one-time per league/sport/season, includes Assistant GM Pro+ for every manager in the league.
- **NEW MODULE REQUIRED:** Entitlement migration and service for BE-EXEC-010/011.
- **NEW MODULE REQUIRED:** Stripe config validation, checkout session action/route, and webhook fulfillment for BE-EXEC-013/014/015, after real Stripe configuration exists.

## Provider Integrations

- **PROVEN:** Sports data config/provider abstraction exists.
  - `packages/sports-data/src/index.ts`
  - `apps/web/lib/sports-data/sportradar.ts`
  - Env: `SPORTS_DATA_PROVIDER`, `SPORTS_DATA_API_KEY`, `SPORTS_DATA_BASE_URL`, `SPORTS_DATA_WEBHOOK_SECRET`, `SPORTS_DATA_TIMEOUT_MS`, `SPORTRADAR_ACCESS_LEVEL`
- **PROVEN:** Email delivery uses Resend.
  - `apps/web/lib/email/resend.ts`
  - `apps/web/lib/email/templates.ts`
  - Env: `RESEND_BIGEXEC_API_KEY`, `EMAIL_AUTH_FROM`, `EMAIL_LEAGUE_FROM`
- **PROVEN:** OpenAI env exists for current matchup talk only.
  - `apps/web/app/matchups/actions.ts`
  - Env: `OPENAI_API_KEY`
- **UNVERIFIED:** No model router, cost telemetry, cloud TTS provider, STT provider beyond browser Web Speech, or provider failover service exists.

## Observability, Analytics, Ops, And Rate Limits

- **PROVEN:** GitHub Actions and Vercel deployment statuses provide build/deploy evidence.
  - `.github/workflows/ci.yml`
  - `.github/workflows/recap-renderer.yml`
- **PROVEN:** Ops Portal Phase 1 source exists for read-only internal support/data views.
  - `apps/web/app/ops/**`
  - `apps/web/lib/ops/permissions.ts`
  - `apps/web/lib/ops/data.ts`
  - `apps/web/lib/ops/audit.ts`
  - `apps/web/lib/ops/health.ts`
  - `docs/ops-portal-phase1.md`
- **PROVEN:** Ops Portal production backing tables were not found in production during this task.
- **UNVERIFIED:** No app-level analytics provider, Sentry, PostHog, usage/cost ledger, rate limiter, global provider budget, or Assistant GM cost dashboard was found.

## Test And CI Coverage

- **PROVEN:** Web unit/component tests use Vitest.
  - `apps/web/package.json`
  - `apps/web/**/*.test.ts`
  - `apps/web/**/*.test.tsx`
- **PROVEN:** End-to-end and QA harnesses use Playwright and Node scripts.
  - `playwright.config.ts`
  - `tests/e2e/big-exec-qa.spec.ts`
  - `scripts/qa-full-draft.mjs`
  - `scripts/qa-transactions-run.mjs`
  - `scripts/qa-roster-integrity-visual.mjs`
- **PROVEN:** CI runs `npm ci`, `npm run typecheck`, `npm test`, `npm run test:a11y`, and `npm run build`.
  - `.github/workflows/ci.yml`
- **PROVEN:** Recap Renderer CI builds TypeScript and Docker image.
  - `.github/workflows/recap-renderer.yml`
- **UNVERIFIED:** No Executive entitlement, Stripe lifecycle, Assistant GM gateway, model-router, cost-ledger, or voice E2E test suite exists yet.

## Backlog-To-Repo Mapping

| Backlog task | Current mapping |
|---|---|
| BE-EXEC-000 | This file: `docs/executive/REPO_INVENTORY.md` |
| BE-EXEC-001 | New capability matrix module under `apps/web/lib/executive/` plus tests; must reference existing `apps/web/lib/feature-flags/voiceFlags.ts` and preserve free accessibility |
| BE-EXEC-002 | New ADR: `docs/executive/ADR_ASSISTANT_GM.md`; should cite current modules listed in this inventory |
| BE-EXEC-010 | New Supabase migration for league-season entitlements; must use production names `fantasy_leagues`, `league_seasons`, `league_members` |
| BE-EXEC-011 | New server-only entitlement service, likely `apps/web/lib/executive/entitlements.ts`, using Supabase server/admin clients |
| BE-EXEC-012 | Extend or replace narrow voice flags with broader Executive flag service; do not gate accessibility flags behind payment |
| BE-EXEC-013 | New server config validator, likely `apps/web/lib/executive/stripeConfig.ts`; blocked on real Stripe config values |
| BE-EXEC-014 | New commissioner-only checkout server action/route; should live near league/settings or `apps/web/lib/executive/checkout.ts`; blocked on BE-EXEC-013 |
| BE-EXEC-015 | New Stripe webhook route and idempotency table; blocked on BE-EXEC-013 |
| BE-EXEC-016 | UI work in league/settings/front-office context; must follow `docs/UX_UI_PAGE_SPEC.md` |
| BE-GM-100 | New server-only gateway around existing `apps/web/lib/assistant-gm/tools.ts`; browser must not receive provider secrets |
| BE-GM-101 | Extend existing `apps/web/lib/assistant-gm/tools.ts`; add missing invitation/trade/history/entitlement tools |
| BE-GM-102 | Extend existing grounding/result schema in `apps/web/lib/assistant-gm/grounding.ts` and intent renderers |
| BE-GM-103 | New entity-resolution module under `apps/web/lib/assistant-gm/`, reusing player/franchise/slot facts from tools |
| BE-GM-104 | New conversation state/retention modules and tables; no raw audio storage by default |
| BE-GM-105 | New central capability policy under `apps/web/lib/assistant-gm/` or `apps/web/lib/executive/`; must use entitlement service from BE-EXEC-011 |
| BE-VOICE-100 | Existing UI start: `apps/web/app/components/AskGmPushToTalk.tsx`; needs real gateway integration, transcript, Tell me more, focus restoration |
| BE-VOICE-101 | Existing browser adapter: `apps/web/lib/voice/speechToText.ts`; needs provider abstraction/telemetry/limits |
| BE-VOICE-102 | Existing browser adapter: `apps/web/lib/voice/textToSpeech.ts`; cloud TTS gated by future flags |
| BE-VOICE-103 | Existing policy doc/module start: `docs/accessibility/gm-audio-collision-policy.md`, `ScreenReaderAnnouncer.tsx` |
| BE-VOICE-104 | Existing invitation UI/helpers: `apps/web/app/leagues/[leagueId]/InviteManagersForm.tsx`, `invitationAccessibility.ts`; needs exact entity/email confirmation in voice path |
| BE-VOICE-105 | Existing error model: `apps/web/lib/voice/voiceErrors.ts`; extend around gateway/provider failures |
| BE-GM-120-124 | Existing FAQ/read-intent foundation under `docs/assistant-gm/knowledge-base/` and `apps/web/lib/assistant-gm/*Intents.ts`; needs gateway + topic routing |
| BE-PRO-200-209 | New Pro+ recommendation modules under `apps/web/lib/assistant-gm/pro/` or similar; must consume current tools/Fantasy Core, not direct LLM database access |
| BE-ACTION-300 | Existing confirmation/autonomy helpers under `apps/web/lib/assistant-gm/transactionConfirmations.ts` and `autonomyGuard.ts`; needs durable idempotency store and gateway integration |
| BE-ACTION-301 | Existing helper `lineupTransactions.ts`; must commit via `apps/web/app/team/actions.ts`/`set_lineup_slot` semantics only |
| BE-ACTION-302 | Existing helper `draftTransactions.ts`; must commit via `make_draft_pick` only |
| BE-ACTION-303 | Existing helper `waiverTransactions.ts`; must commit via `submit_waiver_claim` only |
| BE-ACTION-304 | New invitation action adapter around `apps/web/app/leagues/actions.ts` and `apps/web/lib/email/resend.ts` |
| BE-ACTION-305 | Existing autonomy guard tests in `apps/web/lib/assistant-gm/autonomyGuard.test.ts`; expand for all write classes |
| BE-OPS-400 | New usage/cost ledger migration and service; may surface later in Ops Portal |
| BE-OPS-401 | New model router; current OpenAI use in `matchups/actions.ts` is not sufficient |
| BE-OPS-402 | New rate-limit/budget service; none found |
| BE-OPS-403 | Extend Ops Portal source after production Ops migration is applied |
| BE-OPS-404 | New scheduler using existing cron/job pattern; must prove quiet hours/dedup/opt-out |
| BE-OPS-405 | New privacy/retention controls and docs |
| BE-QA-500-509 | Add tests under `apps/web/lib/assistant-gm/*.test.ts`, `apps/web/app/accessibility-automation/`, `tests/e2e/`, and docs scorecards as appropriate |

## Architectural Conflicts And Implementation Warnings

- **PROVEN:** Backlog wording sometimes uses generic table names (`leagues`, `memberships`, `invitations`) while production uses `fantasy_leagues`, `league_members`, and `league_invites`. Future SQL/code must use production names.
- **PROVEN:** Assistant GM modules exist now, despite the Executive PRD saying implementation was not started from its earlier baseline. Treat the PRD baseline as historical; current source at `d0f175c` is more authoritative.
- **PROVEN:** Existing voice flags are narrower and named differently than the Executive backlog flags. Next work should create a broader capability/flag matrix instead of scattering additional env checks through UI.
- **PROVEN:** Accessibility voice capabilities must remain free. Executive entitlement must not gate `BIG_EXEC_ACCESSIBILITY_SPOKEN_UPDATES`, typed fallback, labels, focus, transcripts, or screen-reader output.
- **PROVEN:** No Stripe implementation exists. Checkout/webhook tasks are blocked until real Stripe configuration is supplied.
- **PROVEN:** Core fantasy writes already have canonical RPCs. Do not create duplicate draft, lineup, waiver, trade, or invite mutation services; Assistant GM write adapters must call existing actions/RPCs after confirmation and revalidation.
- **LIKELY / INFERRED:** Production migration drift means entitlement migrations may require manual application/verification or a migration reconciliation task before normal push workflow is trusted.
- **UNVERIFIED:** Actor-class RPC authorization, production Ops Portal access, VoiceOver/TalkBack device flows, and actual Assistant GM gateway behavior remain unproven.

## Recommended Next Task Mapping

1. **BE-EXEC-001:** Create a machine-readable capability matrix and tests proving free accessibility is not payment-gated. Suggested files: `apps/web/lib/executive/capabilities.ts`, `apps/web/lib/executive/capabilities.test.ts`, update `docs/CURRENT_WORK.md`.
2. **BE-EXEC-002:** Write `docs/executive/ADR_ASSISTANT_GM.md` to freeze provider, retention, entitlement, and gateway decisions before schema/API work.
3. **BE-EXEC-010/011:** Add entitlement migration/service only after the matrix and ADR are in place.
4. **Ops beta readiness:** Apply and verify `supabase/migrations/20260901090000_ops_portal_phase1.sql` separately before relying on `/ops` in production.

