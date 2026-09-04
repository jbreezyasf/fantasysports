# Big Exec Current Work

**Primary objective:** Prepare the standalone Pro Football product for the 10-manager friend beta.

The authoritative product definition is `docs/PRODUCT_PRD.md`. This file is the execution queue, not a place to change product strategy.

**P0 execution rule:** User-facing functionality and UX/UI advance together. Use `docs/UX_UI_PAGE_SPEC.md` as the canonical page-by-page design requirement. A functional flow is not beta-ready until the associated mobile/desktop UX is also completed and reviewed.

---

## P0 — Reconcile Current Implementation

- [x] Inspect current `main`. Evidence: `main`, `origin/main`, and local `HEAD` are `70a73984a6644830942b364de4a727b7b564f6f0` on 2026-08-26.
- [x] Inspect the active production deployment and commit. Evidence: Vercel production deployment `dpl_2XQuGA9UMuGYkzzCq7yCFyisVEHC` is `READY` at commit `70a73984a6644830942b364de4a727b7b564f6f0`.
- [x] Inspect current production database/schema/functions. Evidence: Supabase project `njjiqdqhmcbxblwhfade` inspected read-only on 2026-08-26; see `docs/GATE_STATUS.md`.
- [x] Reconcile Gates 0–5 against actual current evidence. Evidence: `docs/GATE_STATUS.md` current evidence baseline dated 2026-08-26.
- [x] Update `docs/GATE_STATUS.md` with evidence, not inherited PASS labels. Evidence: no gameplay gate was marked PASS.
- [x] Identify documentation drift and conflicts. Evidence: `docs/GATE_STATUS.md` notes stale August 23 claims where current production now differs, including pg_cron, waiver tables, CI, and security RPC exposure.

**Highest-priority unblocked task identified 2026-08-26:** Validate complete eligible player pool after pagination/cap fixes in a production-equivalent authenticated draft-room flow. The code now pages eligible athletes, and production data has healthy QB/RB/WR/TE/K counts, but the actual draft-room user flow has not been exercised and cannot be used as Gate 1 PASS evidence yet.

**Progress 2026-08-26:** Added a web regression test for the draft-pool pagination contract. It proves the loader continues after a full 1,000-row page and preserves WR rows beyond the first page. `npm test`, `npm run typecheck`, and `npm run build` pass. The authenticated production draft-room UI remains unverified, so the Draft Night checklist item stays open.

**Progress 2026-08-26:** Continued Draft Night implementation in the current working tree without changing product direction. Added deterministic Big Exec internal draft rankings with overall rank, positional rank, source, version, and tests; added a `draft_queues` migration plus draft-room UI/server actions for adding, removing, and moving personal queue items. Fresh forced local verification passed with `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`. The migration is not applied to production and authenticated production-equivalent draft QA has not been executed, so no Draft Night checklist item is marked complete yet.

**Progress 2026-08-26:** Added server-authoritative draft deadline/autopick implementation in the current working tree. Migration `20260826043918_draft_timer_autopick.sql` adds `drafts.current_pick_deadline_at`, updates `start_draft` and `make_draft_pick` to advance deadlines from the database, adds queue-first `process_expired_draft_picks`, and schedules a pg_cron job for expired picks when `pg_cron` is installed. The draft room now renders the server deadline countdown and commissioner expired-pick processor. Fresh forced local verification passed with `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`. Production migration/application and 10-manager draft QA remain unexecuted.

**Progress 2026-08-26:** Added local working-tree support for draft realtime refresh, commissioner pause/resume, and commissioner undo with audit trail. Migration `20260826044414_draft_realtime_publication.sql` adds `drafts`, `draft_picks`, and `draft_queues` to Supabase Realtime when the publication exists, and the draft room subscribes to draft/pick/queue changes with polling fallback. Migration `20260826044536_draft_pause_resume.sql` adds paused clock state plus `pause_draft`; migration `20260826044713_draft_correction_undo.sql` adds `draft_corrections` and `undo_last_draft_pick`. Fresh forced local verification passed with `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`. These remain unproven until migrations are applied and the actual authenticated multi-manager draft QA is executed.

**Progress 2026-08-26:** Production database schema was updated with the five Draft Night SQL files using `npx supabase db query --linked --file ...` after `supabase db push --linked --dry-run` was blocked by pre-existing production/local migration-history drift. Production verification proved `drafts.current_pick_deadline_at`, `drafts.paused_at`, and `drafts.paused_remaining_seconds`; `draft_queues` and `draft_corrections` with RLS enabled; draft queue/timer/pause/undo RPC signatures; realtime publication membership for `drafts`, `draft_picks`, and `draft_queues`; active cron `big-exec-process-draft-autopicks`; and no anon execute privilege on the new Draft Night RPCs. Supabase advisors still report existing broader SECURITY DEFINER/RLS performance warnings, including expected authenticated SECURITY DEFINER warnings for new guarded RPCs. `supabase db lint --linked` hung after login initialization and was stopped. Application deployment and authenticated draft QA remain pending.

**Progress 2026-08-26:** Application commit `ce1ca0edc1788b2fd290d7e8f7a53c58b592ea0a` was pushed to `origin/main` after local HTTPS push was retried without an invalid `GITHUB_TOKEN`. Vercel production deployment `dpl_9bRKcnsFvTnjgn7HxBGqoiPuf9jM` reached `READY`, is aliased to `www.bigexecfs.com` and `bigexecfs.com`, and the live homepage HTML references that deployment id. GitHub commit status reports Vercel success. Vercel production runtime error/fatal log query for that deployment over the last 30 minutes returned no logs. Authenticated draft QA remains pending.

**Progress 2026-08-31:** Roster Integrity migration filename reconciliation was verified as a rename-only repository-history change. Production Supabase migration history contains `20260830225835_roster_integrity_mode`, `20260830230104_roster_integrity_rpc_privileges`, and `20260830230309_commissioner_review_mode_behavior`; the cleanup branch now points at commit `c803e209b1d7ec02e5fe3a05209bd36a82f17fda`, whose diff is three 100% filename renames with identical SQL content. SQL reapplied: NO. Local validation for the reconciliation branch passed `npm test --workspace @fantasy-all-sports/web`, `npm run build`, and `npm run typecheck` after build regenerated `.next/types`.

**Progress 2026-08-31:** The deterministic 10-manager QA reset now resets Roster Integrity settings/state for the QA league only: Automatic mode, 3-drop threshold, 24-hour window, core protection ON, eliminated lock enforcement ON, no stale QA review requests, no stale overrides, no QA audit rows, and no locked QA franchises. `npm run qa:auth:save` saved isolated local Playwright storage states for all ten QA actors using the ignored local `QA_AUTH_PASSWORD`; no credentials or auth state were committed.

**Progress 2026-08-31:** Added focused Roster Integrity visual QA harness `npm run qa:roster-integrity:visual` and fixed a current-season bug in the Free Agency page where `/leagues/<id>/players` used `maybeSingle()` across all league seasons and 404ed for multi-season QA leagues. Follow-up UI work added a Free Agency waiver-wire section with authenticated waiver claim/withdraw controls. Latest evidence run: `qa-artifacts/2026-08-30_roster-integrity-visual_2026-08-31T05-39-47/` with 20 checks, 16 PASS, 0 FAIL, 4 BLOCKED/UNVERIFIED, and 16 screenshots. PROVEN in authenticated Playwright/local-app QA: commissioner settings for Automatic/Commissioner Review/Open modes on desktop/mobile; manager review request desktop/mobile; commissioner pending queue and approval; manager retry after one-time override; bulk-drop fourth replacement block; authenticated waiver claim submission from the Free Agency waiver section; explicit finished-roster lock and manager block; regular-manager redirect/denial for commissioner settings across all nine manager contexts. Final cleanup verified Automatic mode, 3-drop threshold, 24-hour window, core protection ON, eliminated lock enforcement ON, no locked QA franchises, no pending reviews, no active overrides, no QA audit rows, no open waiver holds, and no temporary visual roster entries. Remaining gaps are not closed: no standalone release UI to test visually, no current QA score ranks for visual core-asset proof, and direct anon/authenticated Supabase JS RPC permission tests were blocked by missing local Supabase URL/anon env vars.

**Progress 2026-08-31:** Started the Accessibility + Voice Assistant GM beta backlog. Completed BE-A11Y-000 audit-only repository inventory in `docs/accessibility/repo-inventory.md`, mapping actual Next.js/Supabase/Turborepo architecture, core fantasy feature locations, current AI/postgame-talk implementation, tests, CI, accessibility support, and backlog architecture conflicts. Completed BE-A11Y-001 audit-only static accessibility baseline in `docs/accessibility/baseline-audit.md`, identifying shared failures across skip/focus management, status announcements, realtime updates, timer announcements, repeated generic controls, structured data semantics, consequential-action confirmation, navigation mismatch, and missing automated a11y coverage. No production code was changed.

**Progress 2026-08-31:** Completed BE-A11Y-002 QA documentation in `docs/accessibility/test-matrix.md`. The matrix maps iOS VoiceOver, iOS Screen Curtain, iOS Larger Text/Reduce Motion, Android TalkBack/font-display scaling/reduced animations, desktop keyboard, and browser accessibility-tree coverage to the actual current Big Exec routes and components. All matrix items are marked Not Run because this task defined the permanent QA plan but did not execute device assistive-technology sessions.

**Progress 2026-08-31:** Completed the first BE-A11Y-010 shared accessibility primitive pass. Added `apps/web/app/components/accessibility.tsx` with `SkipLink`, `MainContent`, `VisuallyHidden`, `StatusMessage`, `LiveRegion`, `IconButton`, and `A11yNote`; added `apps/web/app/components/accessibility.test.tsx`; wired the global skip link/main-content target into league, franchise, draft, and matchup layouts; added focused skip-link CSS in `apps/web/app/gate5.css`; documented remaining primitive gaps in `docs/accessibility/accessible-primitives.md`. Verification passed: `npm test --workspace @fantasy-all-sports/web`, `npm run typecheck --workspace @fantasy-all-sports/web`, and `npm run build --workspace @fantasy-all-sports/web`.

**Progress 2026-08-31:** Completed BE-A11Y-011 focus-management foundation. Added `apps/web/app/components/focusManagement.ts` with reusable focus-target filtering, first-focus, modal focus/restore, item-removal focus, and route-main focus helpers; added `apps/web/app/components/focusManagement.test.ts`; documented the framework in `docs/accessibility/focus-management.md`. Verification passed: `npm test --workspace @fantasy-all-sports/web`, `npm run typecheck --workspace @fantasy-all-sports/web`, and `npm run build --workspace @fantasy-all-sports/web`.

**Progress 2026-08-31:** Completed BE-A11Y-012 live announcement foundation. Added `apps/web/app/components/announcementQueue.ts`, `apps/web/app/components/ScreenReaderAnnouncer.tsx`, and `apps/web/app/components/announcementQueue.test.ts`; mounted the single screen-reader announcer in `apps/web/app/layout.tsx`; documented priority/throttling behavior in `docs/accessibility/live-announcements.md`. Verification passed: `npm test --workspace @fantasy-all-sports/web`, `npm run build --workspace @fantasy-all-sports/web`, then serial `npm run typecheck --workspace @fantasy-all-sports/web`. A parallel typecheck/build attempt reproduced the known `.next/types` race and was superseded by the serial pass.

**Progress 2026-08-31:** Completed BE-A11Y-013 initial color/status/icon semantics pass. Added shared `StatusBadge` support and tests; added state-aware status styling; patched the Players page so position filters expose selected state, ADD/CLAIM disclosures include asset-specific accessible names, pending waiver/no-franchise/rostered states use semantic status badges, and withdrawal controls name the target claim. Verification passed: `npm test --workspace @fantasy-all-sports/web`, `npm run build --workspace @fantasy-all-sports/web`, and serial `npm run typecheck --workspace @fantasy-all-sports/web`.

**Progress 2026-09-01:** User reviewed QA screenshots under `qa-artifacts/` and the website, liked the current direction, and authorized passing items awaiting human visual inspection. Updated `docs/GATE_STATUS.md` and affected QA artifact summaries/review notes to mark screenshot visual-review items PASS where evidence existed. This does not close non-visual blockers such as direct RPC actor-class permission checks, full trade lifecycle, current-season live scoring, full season automation, Recap V2 action-first quality, or VoiceOver/TalkBack device testing.

**Progress 2026-09-01:** Implemented Operations Portal Phase 1 from the reviewed planning package as a separate `/ops` internal surface. Added explicit staff access control, read-only support search, user detail, league visibility, data-health, and audit views; added `ops_staff_roles` and `ops_audit_events` migration; documented rollout in `docs/ops-portal-phase1.md`. Verification passed: `npm test --workspace @fantasy-all-sports/web` (36 files, 169 tests), serial `npm run typecheck --workspace @fantasy-all-sports/web`, `npm run build --workspace @fantasy-all-sports/web`, and unauthenticated `GET /ops` smoke check redirecting to `/login?next=/ops`. Remaining before beta use: apply migration, configure owner ops env allowlist or staff role, and verify signed-in staff/non-staff behavior.

**Progress 2026-09-02:** Completed BE-EXEC-000 audit-only repository, deployment, and production schema inventory in `docs/executive/REPO_INVENTORY.md` after PR #8 merged to `main`. Evidence: local `main`, `origin/main`, and latest GitHub production deployment metadata all point at `d0f175cde9342bec5d89a28cd9cf336d82c63a78`; CI run `33595010702` passed; read-only Supabase catalog queries confirmed production table/RLS/RPC/cron/realtime shape and that Executive entitlement/Stripe/usage-ledger tables do not exist. No production code or schema was changed. Recommended next task: BE-EXEC-001 capability matrix and tests proving accessibility voice/fallback support is never payment-gated.

**Progress 2026-09-02:** Implemented BE-EXEC-001 capability matrix foundation in `apps/web/lib/executive/capabilities.ts` with tests in `apps/web/lib/executive/capabilities.test.ts`. The matrix distinguishes Free/Standard, free accessibility, Executive/Pro+, commissioner-only, manager-accessible, read/prepare/commit, Beta/post-Beta, and Assistant GM tool eligibility. Focused verification passed: `npm test --workspace @fantasy-all-sports/web -- capabilities.test.ts` with 6 tests. The tests pin the core monetization rule that accessibility voice input, spoken output, typed fallback, and transaction confirmation remain usable in non-Executive leagues.

**Progress 2026-09-02:** Completed BE-EXEC-002 architecture decision record in `docs/executive/ADR_ASSISTANT_GM.md`. The ADR freezes the server-only Assistant GM gateway, structured tool boundary, provider adapter strategy, request-based STT/TTS default, degraded mode, bounded retention, cost telemetry, league-season entitlement evaluation, notification approach, and privacy posture. It explicitly preserves canonical fantasy RPCs and blocks Stripe implementation until real Stripe configuration exists.

**Progress 2026-09-02:** Implemented BE-EXEC-010 local entitlement migration in `supabase/migrations/20260902065522_executive_entitlement_foundation.sql`. The migration adds `league_season_entitlements` scoped to production tables `fantasy_leagues`, `league_seasons`, and `competition_seasons`, with lifecycle statuses, purchaser/payment references, idempotency indexes, RLS, authenticated member read policy, no anon access, authenticated SELECT-only grant, and service-role write authority. Verification caveat: `supabase db push --linked --dry-run` remains blocked by pre-existing remote/local migration-history drift, and local migration listing is blocked because local Supabase is not running.

**Progress 2026-09-02:** Implemented BE-EXEC-011 entitlement service foundation in `apps/web/lib/executive/entitlements.ts` with tests in `apps/web/lib/executive/entitlements.test.ts`. The service provides `getLeagueSeasonEntitlement`, `isExecutiveLeague`, `activateExecutiveEntitlement`, `revokeExecutiveEntitlement`, and `expireExecutiveEntitlements`; tests prove active access for members, cross-league denial, inactive-status denial, service-role-only activation/revocation/expiration, and Stripe checkout-session idempotency. Verification passed: `npm test --workspace @fantasy-all-sports/web` (38 files, 181 tests), `npm run typecheck --workspace @fantasy-all-sports/web`, and `npm run build --workspace @fantasy-all-sports/web`.

**Progress 2026-09-02:** Implemented BE-EXEC-012 feature flag and kill-switch foundation in `apps/web/lib/executive/featureFlags.ts` with tests in `apps/web/lib/executive/featureFlags.test.ts`; added the new Executive/Assistant GM env switches to `.env.example` and `turbo.json`. Focused verification passed: `npm test --workspace @fantasy-all-sports/web -- featureFlags.test.ts capabilities.test.ts` with 12 tests. The new flags cover `assistant_gm`, `assistant_gm_pro_plus`, voice input, cloud TTS, proactive briefs, write tools, draft/lineup/waiver action subfeatures, and `executive_checkout`; tests prove accessibility spoken updates remain independent of Executive/Pro+ and paid-provider switches.

**Progress 2026-09-02:** Implemented the safe BE-EXEC-013 Stripe configuration contract in `apps/web/lib/executive/stripeConfig.ts` with tests in `apps/web/lib/executive/stripeConfig.test.ts`; added empty server env placeholders for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BIG_EXEC_EXECUTIVE_STRIPE_PRICE_LOOKUP_KEY`, and `BIG_EXEC_EXECUTIVE_STRIPE_PRICE_ID` to `.env.example` and `turbo.json`. No checkout, webhook, Stripe dependency, or invented live/test price ID was added. Focused Executive verification passed: `npm test --workspace @fantasy-all-sports/web -- lib/executive` with 21 tests.

**Progress 2026-09-02:** Implemented BE-GM-100 server-only Assistant GM gateway foundation in `apps/web/lib/assistant-gm/gateway.ts` with tests in `apps/web/lib/assistant-gm/gateway.test.ts`. The gateway verifies a user id, enforces Assistant GM/Pro+ flags, checks league-season Executive entitlement through the entitlement service, enforces capability/audience policy, rejects undeclared or cross-league tool requests, calls the existing `runAssistantGmTool` read boundary, classifies deterministic tool responses, and exposes a usage-event callback without adding persistent storage yet. Focused verification passed: `npm test --workspace @fantasy-all-sports/web -- gateway.test.ts` and `npm run typecheck --workspace @fantasy-all-sports/web`.

**Progress 2026-09-02:** Implemented BE-GM-101 structured read-tool expansion in `apps/web/lib/assistant-gm/tools.ts` and `apps/web/lib/assistant-gm/tools.test.ts`. Added read-only tool contracts for `getTradeContext`, `getInvitationState`, `getHistory`, and `getEntitlement` using the existing Supabase table model and current-season helper. Invitation state is commissioner-only; entitlement mode reads the new `league_season_entitlements` table when present. Focused verification passed: `npm test --workspace @fantasy-all-sports/web -- tools.test.ts` and `npm run typecheck --workspace @fantasy-all-sports/web`.

**Progress 2026-09-02:** Implemented BE-GM-102 response classification schema in `apps/web/lib/assistant-gm/responseSchema.ts` with tests in `apps/web/lib/assistant-gm/responseSchema.test.ts`, and wired the Assistant GM gateway to the shared category type. The schema distinguishes authoritative fact, projection, recommendation, explanation, and unsupported/unavailable responses with consistent UI labels and spoken prefixes.

**Progress 2026-09-02:** Implemented BE-GM-103 deterministic entity resolution foundation in `apps/web/lib/assistant-gm/entityResolution.ts` with tests in `apps/web/lib/assistant-gm/entityResolution.test.ts`. It resolves player/franchise candidates inside the current league context, refuses ambiguous similar names, reports unavailable players instead of calling them available, and parses supported positions, roster slots, and week references without guessing missing current-week context. Focused verification passed: `npm test --workspace @fantasy-all-sports/web -- responseSchema.test.ts entityResolution.test.ts` and `npm run typecheck --workspace @fantasy-all-sports/web`.

**Progress 2026-09-02:** Implemented BE-GM-104 conversation state and retention foundation with local migration `supabase/migrations/20260902070954_assistant_gm_conversation_retention.sql` plus helpers/tests in `apps/web/lib/assistant-gm/conversationState.ts` and `apps/web/lib/assistant-gm/conversationState.test.ts`. The migration adds bounded `assistant_gm_conversations` summary/preference storage with user/league/season scope, RLS, owner/member read/insert/update policy, no anon access, and service-role access for future retention jobs. The helper layer trims retained summaries, strips raw audio-like fields, supports reset/delete state, and builds a cross-league-safe scope key. Focused verification passed: `npm test --workspace @fantasy-all-sports/web -- conversationState.test.ts` and `npm run typecheck --workspace @fantasy-all-sports/web`. Migration remains local/unapplied because production migration drift still blocks normal dry-run.

**Progress 2026-09-03:** Implemented BE-GM-105 central Standard/Pro+ capability enforcement in `apps/web/lib/assistant-gm/capabilityPolicy.ts` with tests in `apps/web/lib/assistant-gm/capabilityPolicy.test.ts`, and documented it in `docs/accessibility/assistant-gm-capability-policy.md`. The policy maps 45 namespaced Assistant GM intents to declared capabilities and classifies each request as standard, accessibility, Pro+, commissioner-only, or unsupported. Denial order is unknown intent, unauthenticated, master kill switch, Pro+ kill switch, audience, entitlement, then release phase; audience is checked before entitlement so a manager is never shown an Executive upgrade prompt for a commissioner-only capability. `describeAssistantGmUpgradePrompt` is the single source of upgrade copy and shows only for `entitlement_required`, which satisfies the backlog rule against scattering payment checks through UI components. `createAssistantGmPolicySession` re-resolves entitlement per league scope and holds no session-wide value. `apps/web/lib/assistant-gm/gateway.ts` was refactored to consume the policy instead of running its own kill-switch/entitlement/audience checks, maps policy reasons to its existing wire codes, and attaches the decision as `policy`. Verification passed: `npm test --workspace @fantasy-all-sports/web` (45 files, 231 tests, up from 212), `npm run build --workspace @fantasy-all-sports/web`, then serial `npm run typecheck --workspace @fantasy-all-sports/web`. Tests prove accessibility voice input, spoken output, typed fallback, and transaction confirmation stay allowed with both Assistant GM flags off and no entitlement, and cover a manager moving between Free and Executive leagues in the same session including no leak back to the Free league and mid-session activation. No UI surface consumes the policy yet and no production code path is exposed; BE-VOICE-100 is the first planned consumer.

**Progress 2026-09-04:** Implemented BE-VOICE-100 accessible Ask GM control by evolving the existing `apps/web/app/components/AskGmPushToTalk.tsx` rather than adding a second Ask GM surface. Initial work created a parallel `askGm/AskGmControl.tsx`; discovering the already-mounted BE-VOICE-051 component and the `docs/executive/REPO_INVENTORY.md` row recording BE-VOICE-100 as "existing UI start ... needs real gateway integration, transcript, Tell me more, focus restoration", the duplicate was deleted and the work reconciled into the existing component. Interaction state now lives in a pure reducer `apps/web/app/components/askGm/askGmMachine.ts` with tests in `askGmMachine.test.ts`, because the repository has no React Testing Library and behavioral coverage cannot live in `renderToStaticMarkup` assertions. Added the four recorded gaps: `onAsk`/`onTellMeMore` assistant seam replacing the previous placeholder `setTimeout` that dropped every question into the error state; a focusable manager/assistant transcript; Tell me more gated on answer detail; and per-transition focus restoration applied directly rather than through `createFocusRestorer`, which refuses `tabIndex -1` targets. The control is the first consumer of the BE-GM-105 policy and renders `describeAssistantGmUpgradePrompt` output instead of inspecting entitlement itself. The panel is modal only when no time-critical gameplay control is live; with `criticalControlsActive` it renders non-modal so it cannot obstruct draft pick controls. Error copy reuses `lib/voice/voiceErrors.ts` rather than duplicating strings. Documented in `docs/accessibility/ask-gm-control.md` with a supersession note added to `docs/accessibility/ask-gm-push-to-talk.md`. Verification passed: `npm test --workspace @fantasy-all-sports/web` (46 files, 261 tests, up from 231), `npm run build --workspace @fantasy-all-sports/web`, then serial `npm run typecheck --workspace @fantasy-all-sports/web`; all nine pre-existing BE-VOICE-050..055 component tests still pass. Not proven: `onAsk` is not wired to the Assistant GM gateway by any caller, so no live question reaches the tool boundary; cloud STT/TTS provider abstraction remains BE-VOICE-101/102; audio priority against VoiceOver/TalkBack is modeled but not device-tested.

**Progress 2026-09-04:** Implemented BE-VOICE-101 by extending the existing BE-VOICE-052 browser adapter rather than replacing it, after an inventory pass confirmed the `docs/executive/REPO_INVENTORY.md` row "Existing browser adapter: `apps/web/lib/voice/speechToText.ts`; needs provider abstraction/telemetry/limits". Added `apps/web/lib/voice/speechProvider.ts` with tests in `speechProvider.test.ts`; `speechToText.ts` is unchanged and is wrapped, not modified. The module adds a `SpeechToTextProvider` abstraction with `selectSpeechToTextProvider`, a bounded request-based capture with a 15s default and 30s hard maximum enforced by a cap timer that stops the adapter even if the provider never fires an end event, an `exactEntity` option returning `requiresConfirmation` for player names/emails/numbers, and a telemetry event carrying provider id, event class, duration, transcript length, and error class. Per ADR section 8 telemetry deliberately excludes transcript content, and a test asserts spoken content never appears in a serialized payload. Per the ADR non-decision "No cloud STT/TTS provider is selected", no cloud provider was implemented; selection requires both `cloudEnabled` and the provider reporting available, so a flagged-on but unconfigured provider is never chosen. No permanent recording state: no audio is buffered, the interim transcript is cleared on final delivery, cap, cancel, and error, and cancel discards it without delivering a result. `AskGmPushToTalk` was rewired from the raw adapter to provider selection plus bounded capture so the abstraction is actually used rather than shipped unwired. Verification passed: `npm test --workspace @fantasy-all-sports/web` (47 files, 282 tests, up from 261), `npm run build --workspace @fantasy-all-sports/web`, then serial `npm run typecheck --workspace @fantasy-all-sports/web`. Documented in `docs/accessibility/speech-provider-abstraction.md` with an extension note added to `docs/accessibility/speech-to-text-adapter.md`. Not proven: only the browser provider exists; telemetry is emitted to an injected sink and is not yet persisted to the restricted usage ledger (BE-OPS-400); `exactEntity` is plumbed but no caller sets it yet because the invitation/email confirmation path is BE-VOICE-104; browser microphone permission denial is not separately classified from other capture failures; no device assistive-technology session has been run.

**Progress 2026-09-04:** Reconciled `docs/GATE_STATUS.md` against the QA artifacts actually present in the repository, across all gates. The pass was prompted by discovering Gate 1 still carried UNVERIFIED claims that the 2026-08-30 draft runs had already disproven. No gate status was changed; every gate remains NOT PASSED or NOT STARTED, because in each case at least one stated acceptance criterion is still untested. Gate 1: replaced three stale UNVERIFIED claims with itemized PROVEN evidence from `qa-artifacts/2026-08-30_full-draft/` and `2026-08-30_full-draft-clean/` covering two independent completed 10-manager drafts, 150 picks each by ten authenticated actor sessions, autopick with `is_auto_pick`, duplicate rejection, pause/resume, commissioner undo, personal queue consumption, and complete legal rosters; added precise UNVERIFIED lines for realtime propagation, reconnect/recovery, rankings presentation, UI-driven picking, the unverified `draft_corrections` audit row, and forced rather than natural deadline expiry. Gate 2: replaced a stale line claiming competing waiver claims and complete trade lifecycle were unproven with PROVEN evidence from `qa-artifacts/2026-08-30_transactions/` covering lineup slot setting, waiver hold creation, won/lost competing claims by priority rank, an accepted trade moving both assets, trade-deadline rejection, and trade authorization boundaries; recorded two open items the artifacts surfaced but nobody had logged, a `GET 404` on the non-participant trade route and a React hydration mismatch present in all six captures. Gate 0: narrowed the blanket "no permission-boundary tests with real actor classes" claim, which was stale, to authenticated actor classes PROVEN and anon-class probes still UNVERIFIED. Gates 3 and 4: no new evidence found; recorded explicitly that no artifact exercises scoring or a season rehearsal, and that Gate 4's populated history tables are synthetic QA seed data rather than executed-season output. Gate 5: added ten-actor Front Office PASS evidence. Gate 7: annotated that Executive entitlement foundation code exists but is unapplied and carries no Stripe configuration. Added a document-wide QA environment caveat recording that all 2026-08-30/31 runs used a locally served app against the production Supabase project, so they prove production database, RPC, and RLS behavior under real actor classes but do not prove the deployed Vercel production UI.

**Progress 2026-09-04:** Investigated the React hydration warning recorded in the 2026-08-30 QA captures and fixed a multi-season 404 bug class found during that investigation. Correction to an earlier claim in this log: the QA league was never missing. The first reproduction attempt 404'd on every route because it used league and draft ids copied from historical artifacts; `npm run qa:league:reset` was never needed. QA fixture ids are recreated by every reset, so ids in `qa-artifacts/**` and `docs/GATE_STATUS.md` are a point-in-time record and are not reusable handles. Added `scripts/qa-fixture.mjs` as the single source of truth, exporting `resolveQaFixture`, `signInQaActor`, `qaRoutes`, and `loadLocalEnv`, with a `npm run qa:ids` CLI that prints the ids currently valid; existing QA scripts already resolved by `QA_LEAGUE_NAME` and contain no hard-coded uuid. Added `apps/web/lib/qa/qaFixtureIds.test.ts` guarding that no QA script embeds a uuid and that the resolver looks up by name and `is_current`. Hydration: fixed two real defects found by inspection, `DraftClock` seeding time state from `Date.now()` in a `useState` initializer (server and client rendered different countdowns and a different `aria-label`) and `DraftPlayerPool` formatting with `toLocaleDateString(undefined)`; guards in `apps/web/app/drafts/[draftId]/draftHydration.test.ts`. With correct ids, all seven checked authenticated routes render with zero console errors and zero hydration warnings, including the commissioner Front Office that carried the warning on 2026-08-30. The original warning was not reproduced on current code, so it is not attributed to either fix; `DraftClock` in particular only renders while a draft is live and the 2026-08-30 captures were taken before start and after completion. Separately, authenticated reproduction exposed a real production bug: five queries selected a single `league_seasons` row by `league_id` with `maybeSingle()` and no `is_current` filter, which returns null for any league with more than one season. The six-season QA league therefore 404'd the Trade Center and Schedule and silently dropped data on League HQ, Locker Room, and the mobile nav. This is the same defect previously fixed once on the Free Agency page. All five are fixed and `apps/web/lib/fantasy/currentSeasonLookup.test.ts` enforces the invariant across `app/` and `lib/`; the guard was negative-tested by reverting one fix and confirming it names the offending file and line. Before/after proof: `/leagues/<id>/trades` returned a 404 heading before the fix and renders "Make the call." after. Verification passed: `npm test --workspace @fantasy-all-sports/web` (50 files, 291 tests, up from 285), `npm run build --workspace @fantasy-all-sports/web`, then serial `npm run typecheck --workspace @fantasy-all-sports/web`. Not proven: the 2026-08-30 hydration warning's original source remains unidentified, and no draft has been observed in the live state where `DraftClock` renders.

---

## P0 — UX/UI & Product Polish

**Canonical spec:** `docs/UX_UI_PAGE_SPEC.md`

UX/UI is not deferred until after backend completion. Each gameplay flow must be functionally validated and visually completed before its gate can pass.

### P0-A — Global shell and navigation

- [ ] Replace conflicting authenticated primary navigation patterns with the canonical left-side product navigation.
- [ ] Desktop persistent left rail: Front Office, Matchup, Locker Room, League, Stadium.
- [ ] Mobile top-left trigger opening the same left-side navigation drawer/sheet.
- [ ] Keep primary navigation order consistent on every authenticated page.
- [ ] Place profile/settings controls outside the main five destinations.
- [ ] Verify active-route state, keyboard/focus behavior, responsive width, loading state, and mobile touch targets.

### P0-B — Front Office / Home

- [ ] Top-left: Team/Franchise Name, Manager Name, Record.
- [ ] Top-right: League Name.
- [ ] Build four primary cards: Draft Room/Free Agency, Locker Room, Trade Room, League News.
- [ ] Draft Room card reflects unscheduled/scheduled/live states.
- [ ] Draft Room card automatically becomes Free Agency after draft completion.
- [ ] Free Agency card exposes useful waiver/free-agent status without dumping the entire player pool onto Home.
- [ ] Locker Room card previews relevant social activity.
- [ ] Trade Room card previews incoming/outgoing negotiation state and trade deadline.
- [ ] League News card previews deterministic standings/trade/performance/rivalry/award/recap updates.

### P0-C — Draft Room UX/UI

- [ ] Complete authenticated 10-manager functional QA using the managed QA accounts; verify the accounts/roles before relying on them as evidence.
- [ ] Current manager / round / pick / server timer hierarchy.
- [ ] Rankings presentation.
- [ ] Personal queue UX.
- [ ] Roster-needs guidance.
- [ ] Pick confirmation and drafted-player history/feed.
- [ ] Pause/resume/correction controls separated for commissioner.
- [ ] Reconnect/recovery state.
- [ ] Mobile Draft Room usability.

### P0-D — Team management UX/UI

- [ ] Roster page.
- [ ] Lineup page and individual kickoff-lock clarity.
- [ ] Free Agency page: AVAILABLE / WAIVERS / ROSTERED states.
- [x] Waiver claim/drop-player workflow. Evidence: authenticated Roster Integrity visual QA run `qa-artifacts/2026-08-30_roster-integrity-visual_2026-08-31T05-39-47/` submitted a pending waiver claim from the Free Agency waiver section and paired browser evidence with DB claim ID `1f16971a-c934-4d47-95b8-2bc9f5d6cb33`.
- [x] Fix Free Agency page current-season lookup for multi-season leagues. Evidence: authenticated Roster Integrity visual QA found `/leagues/<id>/players` 404ing because the page queried all league seasons with `maybeSingle()`; the page now filters `league_seasons.is_current = true`.
- [ ] Trade Room landing page.
- [ ] Side-by-side trade creation flow.
- [ ] Private negotiation room and trade lifecycle states.
- [ ] Post-deadline closed-trading state and trade-history access.

### P0-E — Matchup / Game Day UX/UI

- [ ] Broadcast-style score hierarchy.
- [ ] Franchise identity for both sides.
- [ ] Starter/player scoring contributions.
- [ ] Players remaining and real-game status.
- [ ] Upcoming/live/final states.
- [ ] Recap entry point once available.
- [ ] Mobile + desktop live-state QA.

### P0-F — League UX/UI

- [ ] Standings.
- [ ] Schedule.
- [ ] Power / All-Play presentation where supported.
- [ ] Playoff picture/bracket.
- [ ] History & Legacy entry point.
- [ ] Commissioner-authorized settings entry point.
- [ ] Avoid spreadsheet-first presentation while keeping competitive truth clear.

### P0-G — Locker Room, News, Stadium & Legacy

- [ ] Locker Room distinguishes human messages from deterministic league events.
- [ ] League News page: top story, standings movers, biggest performances, transactions, rivalry watch, weekly awards, playoff picture, recaps.
- [ ] Stadium remains a persistent primary left-nav destination.
- [ ] Stadium includes Owner's Office and legacy/award inspection.
- [ ] Create original Big Exec Champions Trophy design; do not imitate the Lombardi Trophy or recognizable NFL awards.
- [ ] Winning franchise's Champions Trophy appears in the Owner's Office and persists historically.
- [ ] Original Big Exec banners/monuments/statues only.
- [ ] History & Legacy connects championships/rivalries/recaps/stadium progression.
- [ ] Recap V2 passes its separate truth, technical, and creative acceptance gates.

### P0-H — Cross-product polish

- [ ] Loading states.
- [ ] Empty states.
- [ ] Success/confirmation states.
- [ ] Disabled/locked states.
- [ ] Error/failure/retry states.
- [ ] Keyboard/focus/accessibility basics.
- [ ] Reduced motion.
- [x] Screenshot-covered responsive mobile/desktop visual review. Evidence: user accepted QA screenshots and website direction on 2026-09-01; see `docs/GATE_STATUS.md`.
- [ ] Original-IP review across trophies, awards, uniforms, logos, and media.

---

## P0 — Draft Night

- [ ] Validate complete eligible player pool after pagination/cap fixes.
- [ ] Implement/validate rankings.
- [ ] Implement/validate personal draft queue.
- [ ] Implement/validate server-authoritative timer.
- [ ] Implement/validate autopick.
- [ ] Implement/validate realtime draft updates.
- [ ] Implement/validate reconnect recovery.
- [ ] Validate commissioner pause.
- [ ] Validate commissioner correction/undo.
- [ ] Run full internal 10-manager production-equivalent draft QA.

---

## P0 — Team Management

- [ ] Validate roster flow.
- [ ] Validate lineup flow.
- [ ] Validate individual kickoff locks.
- [ ] Validate free agency.
- [ ] Validate inverse-standings waiver system.
- [ ] Validate post-deadline waiver/free-agent behavior.
- [x] Validate Roster Integrity post-deadline Automatic add/drop abuse controls through authenticated browser QA where UI exists. Evidence: `qa-artifacts/2026-08-30_roster-integrity-visual_2026-08-31T05-39-47/`; Gate 2 remains open because standalone release UI, lineup/kickoff locks, direct JS RPC actor checks, and full trade lifecycle are not fully proven.
- [ ] Validate trade deadline at UI + authoritative server/database boundary.
- [ ] Complete/validate trade-state lifecycle.

---

## P0 — Game Day

- [ ] Build/validate current 2026 game-stat ingestion.
- [ ] Shadow-score current games when data is available.
- [ ] Validate 6-point touchdown scoring end-to-end.
- [ ] Validate score latency.
- [ ] Validate concurrent games.
- [ ] Validate matchup finalization.
- [ ] Validate stat corrections.

---

## P0 — Season Automation

- [ ] Validate unattended scheduler/job architecture.
- [ ] Validate special-week generation.
- [ ] Validate weekly awards.
- [ ] Validate standings/all-play automation.
- [ ] Validate playoffs.
- [ ] Validate Redemption tournament.
- [ ] Validate championship.
- [ ] Validate season close.
- [ ] Run full internal season rehearsal before friend beta.

---

## P1 — Five-Year History & Legacy

Current implementation work is tracked in PR #2 (`feature/five-season-history-lab`) until reconciled/merged.

- [ ] Reconcile PR #2 against current `main` before merge.
- [ ] Validate explicit current-season behavior across gameplay routes.
- [ ] Validate History & Legacy UI.
- [ ] Validate historical rivalries/head-to-head.
- [ ] Validate championships/Redemption history.
- [ ] Validate stadium persistence across repeat achievements.
- [ ] Validate destructive/rebuildable QA fixture.
- [ ] Validate historical recap playback.
- [ ] Execute and verify real historical provider import only when the required authenticated/provider path is available and permitted.

---

## P1 — Recap V2

Required specs:

- `docs/recap/RECAP_V2_PRD.md`
- `docs/recap/RECAP_V2_DEVELOPER_TASKS.md`
- `docs/recap/RECAP_V2_SPRINT_PLAN.md`

Current objectives:

- [ ] Capture current V1 baseline.
- [ ] Establish Recap V2 truth/data contract.
- [ ] Build deterministic story classifier/moment selector.
- [ ] Replace text-first scene architecture with modular clay/action scenes.
- [ ] Build Rocket Arm.
- [ ] Build 20+ yard rushing-TD Fire Trail.
- [ ] Build final-score/MVP/legacy scenes.
- [ ] Validate 9:16 and 16:9.
- [ ] Validate blowout, nail-biter, comeback, rivalry, and championship archetypes.
- [ ] Do not make V2 default until truth + technical + creative gates pass.

---

# Working Rule

When one item is completed, update this file in the same PR/commit with the evidence or link to the evidence. Do not check a box simply because code was written.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-014

- [x] Implement large-text responsive CSS safeguards for core fantasy surfaces. Evidence: `apps/web/app/gate5.css`.
- [x] Document covered surfaces, implementation notes, and remaining device verification. Evidence: `docs/accessibility/text-scaling-responsive.md`.
- [ ] Record real-device large-text results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-015

- [x] Verify current repository has no essential drag/drop interactions in `apps/` or `packages/`. Evidence: `rg -n "drag|draggable|onDrag|onDrop|DnD|dnd|sortable|pointerdown|pointermove|DataTransfer|react-dnd|@dnd-kit" apps packages -g '!node_modules' -g '!*.next/*'` returned no matches.
- [x] Document the non-drag canonical interaction pattern and actual existing form/button/select locations. Evidence: `docs/accessibility/non-drag-interactions.md`.
- [ ] Re-check this pattern if future sighted drag UI is introduced.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-020

- [x] Add current-section semantics and meaningful labels to desktop and mobile league navigation. Evidence: `apps/web/app/components/BigExecAppHeader.tsx`, `apps/web/app/components/BigExecMobileNav.tsx`, `apps/web/app/components/BigExecMobileNavClient.tsx`.
- [x] Bring recap pages into the shared skip-link/main-content authenticated shell. Evidence: `apps/web/app/recaps/[recapId]/layout.tsx`.
- [x] Add mobile navigation regression coverage. Evidence: `apps/web/app/components/BigExecMobileNavClient.test.tsx`.
- [x] Document navigation architecture, covered destinations, and remaining device checks. Evidence: `docs/accessibility/league-navigation.md`.
- [ ] Record real-device navigation results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-021

- [x] Add accessible starter-slot, bench-player, and move-button semantics to the team page. Evidence: `apps/web/app/franchises/[franchiseId]/team/page.tsx`.
- [x] Add lineup move success confirmation using the existing canonical `setLineup` server action. Evidence: `apps/web/app/team/actions.ts`.
- [x] Add automated coverage for lineup/roster accessibility copy and move-control labels. Evidence: `apps/web/app/franchises/[franchiseId]/team/lineupAccessibility.test.ts`.
- [x] Document current implementation and canonical-service constraint. Evidence: `docs/accessibility/roster-lineup.md`.
- [ ] Verify production definition of `set_lineup_slot` before implementing direct empty-slot benching.
- [ ] Record real-device roster/lineup results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-022

- [x] Add FLEX and available-only filters to player search. Evidence: `apps/web/app/leagues/[leagueId]/players/page.tsx`.
- [x] Add result-count/sort-order announcement and coherent result labels. Evidence: `apps/web/app/leagues/[leagueId]/players/playerSearchAccessibility.ts`.
- [x] Add explicit player/D/ST detail disclosures and preserve canonical add/claim actions. Evidence: `apps/web/app/leagues/[leagueId]/players/page.tsx`.
- [x] Extend fantasy athlete pool reads to include optional injury status. Evidence: `apps/web/lib/fantasy/athletePoolCore.ts`.
- [x] Add automated coverage for player-search accessibility copy. Evidence: `apps/web/app/leagues/[leagueId]/players/playerSearchAccessibility.test.ts`.
- [x] Document implemented fields and verified route data limits. Evidence: `docs/accessibility/player-search.md`.
- [ ] Record real-device player-search results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-023

- [x] Add two-step waiver claim review before final submission. Evidence: `apps/web/app/leagues/[leagueId]/players/page.tsx`.
- [x] Announce add asset, drop asset, FAAB status, priority model, clear time, and source franchise where present. Evidence: `apps/web/app/leagues/[leagueId]/players/waiverAccessibility.ts`.
- [x] Preserve canonical waiver submission and withdrawal actions/RPCs. Evidence: `apps/web/app/leagues/[leagueId]/players/actions.ts` unchanged for final waiver mutations.
- [x] Verify no active FAAB implementation exists in app code or migrations. Evidence: `rg -n "FAAB|faab|budget|bid" apps packages supabase docs -g '!node_modules'`.
- [x] Add automated waiver review announcement coverage. Evidence: `apps/web/app/leagues/[leagueId]/players/waiverAccessibility.test.ts`.
- [x] Document waiver architecture, review flow, and FAAB finding. Evidence: `docs/accessibility/waivers.md`.
- [ ] Record real-device waiver results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-024

- [x] Add accessible draft-state, on-clock, and recent-pick summaries. Evidence: `apps/web/app/drafts/[draftId]/page.tsx`, `apps/web/app/drafts/[draftId]/draftAccessibility.ts`.
- [x] Replace every-second clock live text with queued 30/15/5-second announcements. Evidence: `apps/web/app/drafts/[draftId]/DraftClock.tsx`.
- [x] Add draft candidate labels, inspect details, and review-before-confirm draft action. Evidence: `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`.
- [x] Preserve canonical draft and queue RPC paths. Evidence: `apps/web/app/drafts/actions.ts`.
- [x] Add automated draft accessibility copy coverage. Evidence: `apps/web/app/drafts/[draftId]/draftAccessibility.test.ts`.
- [x] Document draft architecture and remaining simulated-draft verification. Evidence: `docs/accessibility/draft-room.md`.
- [ ] Record full simulated screen-reader draft results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-025

- [x] Add textual matchup summary, result state, and scoreboard accessible label. Evidence: `apps/web/app/matchups/[matchupId]/page.tsx`, `apps/web/app/matchups/[matchupId]/matchupAccessibility.ts`.
- [x] Add throttled screen-reader score summary announcements through the shared announcer. Evidence: `apps/web/app/matchups/[matchupId]/MatchupScoreAnnouncer.tsx`.
- [x] Add score-refresh status confirmation while preserving canonical `recompute_matchup` RPC. Evidence: `apps/web/app/matchups/actions.ts`.
- [x] Add contextual scoring-row labels. Evidence: `apps/web/app/matchups/[matchupId]/page.tsx`.
- [x] Add automated matchup accessibility copy coverage. Evidence: `apps/web/app/matchups/[matchupId]/matchupAccessibility.test.ts`.
- [x] Document matchup architecture, chart/win-probability finding, and data limits. Evidence: `docs/accessibility/matchup-live-scoring.md`.
- [ ] Record real-device matchup/live-scoring results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-026

- [x] Add table roles, hidden headers, and row labels to League HQ standings. Evidence: `apps/web/app/leagues/[leagueId]/page.tsx`.
- [x] Add table roles, hidden headers, row labels, and hidden tiebreaker cells to Schedule standings. Evidence: `apps/web/app/leagues/[leagueId]/schedule/page.tsx`.
- [x] Add postseason seed row context. Evidence: `apps/web/app/leagues/[leagueId]/schedule/page.tsx`.
- [x] Add automated standings accessibility copy coverage. Evidence: `apps/web/app/leagues/[leagueId]/standingsAccessibility.test.ts`.
- [x] Document standings architecture and remaining device checks. Evidence: `docs/accessibility/standings.md`.
- [ ] Record real-device standings results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-027

- [x] Add full sender/time/message/reaction/reply labels to Locker Room events. Evidence: `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`, `apps/web/app/leagues/[leagueId]/locker-room/lockerRoomAccessibility.ts`.
- [x] Add accessible reply-to-composer action without inventing threaded reply storage. Evidence: `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`.
- [x] Replace generic live feed announcements with concrete event announcements through the shared announcer. Evidence: `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`.
- [x] Add message-sent status confirmation. Evidence: `apps/web/app/social/actions.ts`.
- [x] Add automated Locker Room accessibility copy coverage. Evidence: `apps/web/app/leagues/[leagueId]/locker-room/lockerRoomAccessibility.test.ts`.
- [x] Document chat/notification architecture and threaded-reply schema finding. Evidence: `docs/accessibility/league-chat-notifications.md`.
- [ ] Record real-device Locker Room results in `docs/accessibility/test-matrix.md`.

---

## Accessibility + Voice Assistant GM Beta — BE-A11Y-028

- [x] Add multi-address review, duplicate/pending/invalid-address status, character-by-character readback, and remove controls to commissioner invite flow. Evidence: `apps/web/app/leagues/[leagueId]/InviteManagersForm.tsx`, `apps/web/app/leagues/[leagueId]/invitationAccessibility.ts`.
- [x] Extend invite creation to accept a reviewed list while preserving canonical `create_league_invite` RPC usage. Evidence: `apps/web/app/leagues/actions.ts`.
- [x] Add accessible invite confirmation, invite-ledger table/link semantics, and resend for pending invites. Evidence: `apps/web/app/leagues/[leagueId]/page.tsx`, `apps/web/app/leagues/actions.ts`.
- [x] Add automated invitation parsing/validation/confirmation coverage. Evidence: `apps/web/app/leagues/[leagueId]/invitationAccessibility.test.ts`.
- [x] Document invitation architecture and verified resend/revoke backend limits. Evidence: `docs/accessibility/league-invitations.md`.
- [ ] Add revoke only after canonical invite revocation support exists.
- [ ] Record real-device invitation flow results in `docs/accessibility/test-matrix.md`.

## Accessibility + Voice Assistant GM Beta — BE-A11Y-030

- [x] Add stack-appropriate accessibility test tooling to the existing Vitest setup. Evidence: `apps/web/app/accessibility-automation/axeTestUtils.ts`, `apps/web/package.json`, `package-lock.json`.
- [x] Prove the tooling fails on injected defects for accessible names, form labels, ARIA roles/states, and dialog names. Evidence: `apps/web/app/accessibility-automation/axeTooling.test.ts`.
- [x] Document local commands, coverage, and jsdom/browser limits. Evidence: `docs/accessibility/accessibility-test-tooling.md`.
- [x] Add P0 screen regression fixtures in BE-A11Y-031.

## Accessibility + Voice Assistant GM Beta — BE-A11Y-031

- [x] Add source-anchored P0 regression coverage for roster/lineup, player search, waivers, draft, matchup/live scoring, and standings. Evidence: `apps/web/app/accessibility-automation/p0ScreenRegression.test.ts`.
- [x] Cover removal of key labels, roles, states, live announcements, and transaction review/confirmation content. Evidence: `apps/web/app/accessibility-automation/p0ScreenRegression.test.ts`.
- [x] Document coverage and server-component/Supabase rendering constraint. Evidence: `docs/accessibility/p0-screen-regression-suite.md`.
- [x] Add the accessibility regression command to CI in BE-A11Y-032.

## Accessibility + Voice Assistant GM Beta — BE-A11Y-032

- [x] Add dedicated root and web accessibility test commands. Evidence: `package.json`, `apps/web/package.json`.
- [x] Add explicit accessibility regression step to GitHub Actions CI. Evidence: `.github/workflows/ci.yml`.
- [x] Document CI gate behavior and failure output locations. Evidence: `docs/accessibility/ci-accessibility-gate.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-040

- [x] Add narrow structured Assistant GM read-tool boundary with explicit request/response shape. Evidence: `apps/web/lib/assistant-gm/tools.ts`.
- [x] Enforce league membership and owned-franchise authorization before returning protected state. Evidence: `apps/web/lib/assistant-gm/tools.ts`.
- [x] Keep all current Assistant GM tools read-only and map them to existing Supabase tables/helpers instead of duplicating game or transaction logic. Evidence: `apps/web/lib/assistant-gm/tools.ts`, `docs/accessibility/assistant-gm-tool-boundary.md`.
- [x] Add boundary tests for declared tools, read-only contracts, authorized reads, and unauthorized rejection. Evidence: `apps/web/lib/assistant-gm/tools.test.ts`.
- [x] Add deterministic grounding rules in BE-GM-041.
- [ ] Wire the boundary to an LLM/Assistant UI only after read-intent, feature flag, and confirmation model tasks are complete.

## Accessibility + Voice Assistant GM Beta — BE-GM-041

- [x] Add no-fabrication grounding policy for score, roster, waiver balance, availability, standings, draft status, injury state, and league rules. Evidence: `apps/web/lib/assistant-gm/grounding.ts`.
- [x] Require explicit successful tool results before factual answer rendering. Evidence: `apps/web/lib/assistant-gm/grounding.ts`.
- [x] Add unavailable/missing-data tests. Evidence: `apps/web/lib/assistant-gm/grounding.test.ts`.
- [x] Document required tool map and failure message behavior. Evidence: `docs/accessibility/assistant-gm-grounding-rules.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-042

- [x] Add deterministic roster/lineup read-intent renderer for lineup, bench, injuries, empty slots, and game-time questions. Evidence: `apps/web/lib/assistant-gm/rosterLineupIntents.ts`.
- [x] Derive answers entirely from structured `getRoster` and `getLineup` responses. Evidence: `apps/web/lib/assistant-gm/rosterLineupIntents.ts`.
- [x] Refuse to invent game-time state when no verified kickoff data is present. Evidence: `apps/web/lib/assistant-gm/rosterLineupIntents.test.ts`.
- [x] Document supported intents and current game-time data limit. Evidence: `docs/accessibility/assistant-gm-roster-lineup-intents.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-043

- [x] Add deterministic matchup and standings read-intent renderer. Evidence: `apps/web/lib/assistant-gm/matchupStandingsIntents.ts`.
- [x] Distinguish projection language from factual current-score language. Evidence: `apps/web/lib/assistant-gm/matchupStandingsIntents.test.ts`.
- [x] Refuse to invent remaining-player or projection state when verified data is absent. Evidence: `apps/web/lib/assistant-gm/matchupStandingsIntents.test.ts`.
- [x] Document supported intents and current projection/game-status data limits. Evidence: `docs/accessibility/assistant-gm-matchup-standings-intents.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-044

- [x] Add deterministic player detail, comparison, best-available, and available-by-position answer rendering. Evidence: `apps/web/lib/assistant-gm/playerSearchIntents.ts`.
- [x] Trigger clarification for ambiguous player searches. Evidence: `apps/web/lib/assistant-gm/playerSearchIntents.test.ts`.
- [x] Ensure rostered players are not presented as available and source labels are included for recommendations. Evidence: `apps/web/lib/assistant-gm/playerSearchIntents.test.ts`.
- [x] Document supported player intents and current parser boundary. Evidence: `docs/accessibility/assistant-gm-player-search-intents.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-045

- [x] Add deterministic draft read-intent renderer for availability, best available by position, next pick, position need, recent picks, and availability verification. Evidence: `apps/web/lib/assistant-gm/draftIntents.ts`.
- [x] Include current-pick freshness checks so stale draft-state answers are blocked. Evidence: `apps/web/lib/assistant-gm/draftIntents.test.ts`.
- [x] Refuse silent substitution when a requested player is no longer available. Evidence: `apps/web/lib/assistant-gm/draftIntents.test.ts`.
- [x] Document supported draft intents and freshness behavior. Evidence: `docs/accessibility/assistant-gm-draft-intents.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-046

- [x] Add deterministic waiver read-intent renderer for FAAB/rules, pending claims, recommendations, and best available players. Evidence: `apps/web/lib/assistant-gm/waiverIntents.ts`.
- [x] Require waiver facts from waiver rule/state tools and avoid invented FAAB balances. Evidence: `apps/web/lib/assistant-gm/waiverIntents.test.ts`.
- [x] Label add advice as recommendation, not a transaction. Evidence: `apps/web/lib/assistant-gm/waiverIntents.test.ts`.
- [x] Document supported waiver intents and transaction deferral. Evidence: `docs/accessibility/assistant-gm-waiver-intents.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-047

- [x] Add deterministic Sunday briefing composer for lineup, injury, bye, projection, bench, and waiver checks. Evidence: `apps/web/lib/assistant-gm/sundayBriefing.ts`.
- [x] Keep each briefing item traceable to a structured Assistant GM tool result. Evidence: `apps/web/lib/assistant-gm/sundayBriefing.test.ts`.
- [x] Label recommendations and confirm no transaction is made. Evidence: `apps/web/lib/assistant-gm/sundayBriefing.test.ts`.
- [x] Document supported checks, guardrails, and follow-up issue-key behavior. Evidence: `docs/accessibility/assistant-gm-sunday-briefing.md`.

## Accessibility + Voice Assistant GM Beta — BE-VOICE-050

- [x] Add disabled-by-default voice and spoken-update feature flags. Evidence: `apps/web/lib/feature-flags/voiceFlags.ts`, `.env.example`.
- [x] Allow each voice capability to be independently disabled and require `voice_gm` for voice subfeatures. Evidence: `apps/web/lib/feature-flags/voiceFlags.test.ts`.
- [x] Add flags to Turbo build environment passthrough. Evidence: `turbo.json`.
- [x] Document flag names, env vars, and guardrail behavior. Evidence: `docs/accessibility/voice-feature-flags.md`.

## Accessibility + Voice Assistant GM Beta — BE-VOICE-051

- [x] Add flagged Ask GM push-to-talk entry point in authenticated product header. Evidence: `apps/web/app/components/AskGmPushToTalk.tsx`, `apps/web/app/components/BigExecAppHeader.tsx`.
- [x] Add idle/listening/processing/speaking/error visual and accessible states with cancel/dismiss controls. Evidence: `apps/web/app/components/AskGmPushToTalk.tsx`.
- [x] Mount only when `voice_gm` is enabled and preserve no-always-listening behavior. Evidence: route layouts and `apps/web/lib/feature-flags/voiceFlags.ts`.
- [x] Add rendering coverage for all states and flag-off/flag-on header behavior. Evidence: `apps/web/app/components/AskGmPushToTalk.test.tsx`.
- [x] Document state behavior and remaining STT/TTS limits. Evidence: `docs/accessibility/ask-gm-push-to-talk.md`.

## Accessibility + Voice Assistant GM Beta — BE-VOICE-052

- [x] Add browser speech-to-text adapter with support detection, start/stop/abort, transcript callbacks, and explicit unsupported-browser errors. Evidence: `apps/web/lib/voice/speechToText.ts`.
- [x] Wire push-to-talk start/finish/cancel to the adapter so capture starts only after user action and can be canceled. Evidence: `apps/web/app/components/AskGmPushToTalk.tsx`.
- [x] Expose microphone permission/cancel copy, transcript text, retry, and typed fallback in the UI. Evidence: `apps/web/app/components/AskGmPushToTalk.tsx`.
- [x] Add adapter tests for permission copy, unsupported browsers, transcript results, and abort cancellation. Evidence: `apps/web/lib/voice/speechToText.test.ts`.
- [x] Document adapter behavior and browser-support limits. Evidence: `docs/accessibility/speech-to-text-adapter.md`.

## Accessibility + Voice Assistant GM Beta — BE-VOICE-053

- [x] Add browser text-to-speech adapter with support detection, speak, stop, replay, and preserved last response. Evidence: `apps/web/lib/voice/textToSpeech.ts`.
- [x] Add stop/replay controls and persistent text response support to Ask GM. Evidence: `apps/web/app/components/AskGmPushToTalk.tsx`.
- [x] Ensure TTS failure does not erase response text. Evidence: `apps/web/lib/voice/textToSpeech.test.ts`.
- [x] Document adapter behavior and screen-reader collision follow-up. Evidence: `docs/accessibility/text-to-speech-adapter.md`.

## Accessibility + Voice Assistant GM Beta — BE-VOICE-054

- [x] Add GM audio-state event and queue policy for speech/announcement collision handling. Evidence: `apps/web/app/components/ScreenReaderAnnouncer.tsx`, `apps/web/app/components/announcementQueue.ts`.
- [x] Tag live-scoring announcements so they queue/throttle while GM speech is active. Evidence: `apps/web/app/matchups/[matchupId]/MatchupScoreAnnouncer.tsx`.
- [x] Ensure assertive transaction/error announcements are not held by GM speech. Evidence: `apps/web/app/components/announcementQueue.test.ts`.
- [x] Keep immediate stop speech behavior in Ask GM. Evidence: `apps/web/app/components/AskGmPushToTalk.tsx`.
- [x] Document audio priority and focus policy. Evidence: `docs/accessibility/gm-audio-collision-policy.md`.

## Accessibility + Voice Assistant GM Beta — BE-VOICE-055

- [x] Add voice error/ambiguity taxonomy for speech not understood, ambiguous player, unavailable player, stale draft state, network failure, AI/tool timeout, and unsupported request. Evidence: `apps/web/lib/voice/voiceErrors.ts`.
- [x] Ensure each failure exposes retry, type instead, and cancel/return. Evidence: `apps/web/lib/voice/voiceErrors.test.ts`, `apps/web/app/components/AskGmPushToTalk.tsx`.
- [x] Prevent silent command substitution for unsupported requests. Evidence: `apps/web/lib/voice/voiceErrors.test.ts`.
- [x] Document voice failure behavior. Evidence: `docs/accessibility/voice-error-ambiguity-ux.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-060

- [x] Add `prepare -> confirm -> commit` transaction confirmation model. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.ts`.
- [x] Include action ID, user ID, league ID, action type, proposed changes, state version/hash, created time, and expiration time in the confirmation object. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.ts`.
- [x] Require valid confirmation before future commit callbacks execute. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`.
- [x] Reject expired, wrong-scope, modified-proposal, and changed-state confirmations. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`.
- [x] Document that future writes must call existing canonical Supabase RPCs instead of creating duplicate game/transaction engines. Evidence: `docs/accessibility/assistant-gm-transaction-confirmations.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-061

- [x] Add idempotent Assistant GM commit wrapper keyed by confirmation `actionId`. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.ts`.
- [x] Add idempotency store interface for future durable storage-backed write paths. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.ts`.
- [x] Verify repeated commits execute once and return the prior result. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`.
- [x] Verify invalid confirmations do not create idempotency records or execute writes. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`.
- [x] Document that future production Voice GM writes must back the interface with durable storage and still call canonical RPCs. Evidence: `docs/accessibility/assistant-gm-transaction-confirmations.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-062

- [x] Add state revalidation reasons for drafted player, unavailable waiver player, lineup eligibility change, FAAB change, roster change, and generic state change. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.ts`.
- [x] Reject stale confirmations when the current verified state hash differs from the prepared confirmation. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`.
- [x] Return understandable stale-state explanations before any commit callback can run. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`.
- [x] Explicitly prevent silent player substitution in stale draft and waiver cases. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`.
- [x] Document the state revalidation boundary and future RPC reuse requirement. Evidence: `docs/accessibility/assistant-gm-transaction-confirmations.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-063

- [x] Add Voice GM lineup move preparation over verified roster and lineup state. Evidence: `apps/web/lib/assistant-gm/lineupTransactions.ts`.
- [x] Resolve requested roster asset, determine legal destination slots, and explain invalid/ambiguous moves before preparing a transaction. Evidence: `apps/web/lib/assistant-gm/lineupTransactions.test.ts`.
- [x] Generate confirmation copy naming affected player, target slot, week, and replaced player when present. Evidence: `apps/web/lib/assistant-gm/lineupTransactions.test.ts`.
- [x] Commit only after valid confirmation, idempotency, and current-state hash revalidation. Evidence: `apps/web/lib/assistant-gm/lineupTransactions.ts`.
- [x] Call canonical Supabase RPC `set_lineup_slot` for the actual lineup mutation. Evidence: `apps/web/lib/assistant-gm/lineupTransactions.test.ts`.
- [x] Document the Voice GM lineup transaction flow and guardrails. Evidence: `docs/accessibility/assistant-gm-lineup-transactions.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-064

- [x] Add Voice GM draft-pick preparation over verified draft state and available draft pool. Evidence: `apps/web/lib/assistant-gm/draftTransactions.ts`.
- [x] Verify draft is live and requester is on the clock before preparing a pick. Evidence: `apps/web/lib/assistant-gm/draftTransactions.test.ts`.
- [x] Reject unavailable or ambiguous player requests without selecting a fallback. Evidence: `apps/web/lib/assistant-gm/draftTransactions.test.ts`.
- [x] Generate confirmation copy naming the exact asset and pick number. Evidence: `apps/web/lib/assistant-gm/draftTransactions.test.ts`.
- [x] Commit only after valid confirmation, idempotency, and current-state hash revalidation. Evidence: `apps/web/lib/assistant-gm/draftTransactions.ts`.
- [x] Call canonical Supabase RPC `make_draft_pick` with `p_auto: false`; no draft tables are written directly. Evidence: `apps/web/lib/assistant-gm/draftTransactions.test.ts`.
- [x] Document the Voice GM draft transaction flow and guardrails. Evidence: `docs/accessibility/assistant-gm-draft-transactions.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-065

- [x] Add Voice GM waiver-claim preparation over verified waiver holds, roster state, and rules. Evidence: `apps/web/lib/assistant-gm/waiverTransactions.ts`.
- [x] Require complete claim review with add, drop, FAAB, and priority/rule context. Evidence: `apps/web/lib/assistant-gm/waiverTransactions.test.ts`.
- [x] Require an explicit verified drop when roster capacity is full. Evidence: `apps/web/lib/assistant-gm/waiverTransactions.test.ts`.
- [x] Reject unavailable waiver assets without selecting a fallback. Evidence: `apps/web/lib/assistant-gm/waiverTransactions.test.ts`.
- [x] Validate FAAB bids against verified budget when FAAB is enabled; do not invent a FAAB write parameter absent from the canonical RPC. Evidence: `apps/web/lib/assistant-gm/waiverTransactions.ts`, `apps/web/lib/assistant-gm/waiverTransactions.test.ts`.
- [x] Commit only after valid confirmation, idempotency, and current-state hash revalidation. Evidence: `apps/web/lib/assistant-gm/waiverTransactions.ts`.
- [x] Call canonical Supabase RPC `submit_waiver_claim`; no waiver tables are written directly. Evidence: `apps/web/lib/assistant-gm/waiverTransactions.test.ts`.
- [x] Document the Voice GM waiver transaction flow and guardrails. Evidence: `docs/accessibility/assistant-gm-waiver-transactions.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-066

- [x] Add structured Assistant GM action audit-log entry model. Evidence: `apps/web/lib/assistant-gm/actionAuditLog.ts`.
- [x] Include user, league, source, requested action, prepared action, confirmation timestamp, commit result, failure reason, state/version hash, action ID, and created time. Evidence: `apps/web/lib/assistant-gm/actionAuditLog.test.ts`.
- [x] Add audit store interface for future durable storage wiring. Evidence: `apps/web/lib/assistant-gm/actionAuditLog.ts`.
- [x] Strip unnecessary raw voice audio-like fields from audit payloads. Evidence: `apps/web/lib/assistant-gm/actionAuditLog.test.ts`.
- [x] Document audit fields and privacy boundary. Evidence: `docs/accessibility/assistant-gm-action-audit-log.md`.

## Accessibility + Voice Assistant GM Beta — BE-GM-067

- [x] Add explicit Assistant GM autonomy guard requiring a user-originated voice/text request plus valid confirmation before commit. Evidence: `apps/web/lib/assistant-gm/autonomyGuard.ts`.
- [x] Reject unsolicited lineup changes, waiver claims, draft picks, and trade resolution/acceptance attempts. Evidence: `apps/web/lib/assistant-gm/autonomyGuard.test.ts`.
- [x] Reject standalone roster drops in beta. Evidence: `apps/web/lib/assistant-gm/autonomyGuard.test.ts`.
- [x] Reject payment and account actions entirely. Evidence: `apps/web/lib/assistant-gm/autonomyGuard.test.ts`.
- [x] Verify guarded commits run only when request scope and confirmation are valid. Evidence: `apps/web/lib/assistant-gm/autonomyGuard.test.ts`.
- [x] Document the autonomy guard and explicit rejections. Evidence: `docs/accessibility/assistant-gm-autonomy-guard.md`.

## Repo Tightening — 2026-09-01

- [x] Create tightening log for future cleanup audits. Evidence: `docs/TIGHTENING_LOG.md`.
- [x] Centralize repeated Assistant GM missing-confirmation response and remove impossible null checks. Evidence: `apps/web/lib/assistant-gm/transactionConfirmations.ts`.
- [x] Replace repeated missing-confirmation branches in lineup, draft, and waiver transaction helpers. Evidence: `apps/web/lib/assistant-gm/lineupTransactions.ts`, `apps/web/lib/assistant-gm/draftTransactions.ts`, `apps/web/lib/assistant-gm/waiverTransactions.ts`.
- [x] Clear ignored local Turbo cache output while preserving source and QA evidence. Evidence: `docs/TIGHTENING_LOG.md`.

---

## Approved Feature — Executive League + Assistant GM Pro+

**Canonical specs:**

- `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_PRD.md`
- `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_TASKS.md`

**Commercial decision:** Big Exec Executive League Season Pass is $99 one-time per league, sport, and season. Assistant GM Pro+ is included for all managers and is not a separate Stripe product at launch. Accessibility voice remains free.

- [ ] Run `BE-EXEC-000` read-only repository/deployment/schema inventory.
- [ ] Reconcile the new PRD with the existing accessibility + Voice Assistant GM backlog.
- [ ] Do not start checkout until Stripe product/price configuration is provided.
- [ ] Do not allow this workstream to displace unresolved standalone fantasy P0 gates.
- [ ] Begin entitlement/GM foundation only after the inventory identifies exact current integration points.


---

## Approved Feature — Late-Start Leagues + Voice Knowledge Base

**Canonical specs:**

- `docs/product/LATE_START_LEAGUES_PRD.md`
- `docs/product/LATE_START_LEAGUES_TASKS.md`
- `docs/assistant-gm/knowledge-base/00_READ_THIS_FIRST.md`

- [ ] Make the knowledge-base startup document the first stable-answer retrieval instruction.
- [ ] Add sport-season hard enrollment cutoff and enforce it across create/join/draft boundaries.
- [ ] Implement deterministic optimal-legal-lineup reconstruction from the frozen draft roster.
- [ ] Backfill matchups and publish validated standings atomically.
- [ ] Keep other sports and existing leagues independent of football enrollment closure.
- [ ] Preserve free voice accessibility and league-scoped Executive entitlement.
