# Big Exec Fantasy Sports
## Codex Implementation Backlog — Executive League + Assistant GM Pro+

**Version:** 1.0  
**Date:** September 2, 2026  
**Parent PRD:** `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_PRD.md`  
**Starting state:** specification only; no task is complete until verified

---

## Operating Rules

1. Read repository `AGENTS.md` and all required canonical documents before material work.
2. Start with read-only inventory. Do not assume local documents match production.
3. Preserve Supabase/Fantasy Core as authoritative.
4. Reuse existing server loaders and transaction RPCs.
5. Do not allow the LLM unrestricted database access.
6. Accessibility capabilities cannot depend on the Executive entitlement.
7. Do not implement Stripe checkout until Juanita's Stripe configuration and product/price identifiers are available.
8. Never hard-code a client-trusted entitlement.
9. Every consequential action uses Prepare -> Confirm -> Revalidate -> Commit.
10. Add tests with each functional change.
11. Update `docs/CURRENT_WORK.md` when implementation task state changes.
12. Update gates only with executed evidence.

---

## Phase 0 — Reconciliation and Design Freeze

### BE-EXEC-000 — Repository, Production, and Schema Inventory

**Priority:** P0 prerequisite  
**Change type:** audit/documentation only

Inspect and document:

- current deployed commit versus main;
- current Next.js route/component/service structure;
- current production Supabase tables, functions, RLS, grants, and migrations relevant to leagues, seasons, memberships, drafts, rosters, lineups, players, waivers, trades, invitations, history, notifications, and audit logs;
- current AI/provider integrations;
- current accessibility/voice implementation;
- current feature flag/config approach;
- current observability and analytics;
- current rate limiting;
- current test fixtures and QA accounts;
- current Stripe implementation, expected to be absent unless added after this spec;
- exact mismatch between the existing accessibility/voice backlog and repository state.

**Deliverable:** `docs/executive/REPO_INVENTORY.md`

**Acceptance:** every planned task below maps to exact current files/services or is explicitly labeled as a new module.

### BE-EXEC-001 — Product and Capability Matrix Test Fixture

Create a machine-readable capability matrix distinguishing:

- Free/Standard;
- Free accessibility;
- Executive/Pro+;
- commissioner-only;
- manager-accessible;
- read versus prepare versus commit;
- Beta versus post-Beta.

Add tests that fail if accessibility voice is accidentally gated by payment.

### BE-EXEC-002 — Architecture Decision Record

Document:

- provider adapter strategy;
- request-based STT/text/TTS default;
- fallback/degraded mode;
- server-side tool boundary;
- conversation retention;
- cost telemetry;
- entitlement evaluation;
- notification approach;
- privacy posture.

**Deliverable:** `docs/executive/ADR_ASSISTANT_GM.md`

---

## Phase 1 — Entitlement Foundation

### BE-EXEC-010 — League-Season Entitlement Migration

Add version-controlled migration for the mapped entitlement schema.

Requirements:

- league/sport/season scope;
- purchaser identity;
- product code;
- payment references;
- lifecycle status;
- timestamps;
- uniqueness/idempotency constraints;
- RLS enabled;
- no client insert/update authority;
- safe read for authorized league members where UX needs it;
- service-only activation/revocation path.

### BE-EXEC-011 — Entitlement Service

Create server-only functions:

- `getLeagueSeasonEntitlement`;
- `isExecutiveLeague`;
- `activateExecutiveEntitlement`;
- `revokeExecutiveEntitlement`;
- `expireExecutiveEntitlements` or deterministic season-end evaluation.

Requirements:

- typed result;
- explicit reason/status;
- no client-trusted override;
- authorization tests;
- cross-league denial tests.

### BE-EXEC-012 — Feature Flags and Kill Switches

At minimum:

- `assistant_gm`;
- `assistant_gm_pro_plus`;
- `assistant_gm_voice_input`;
- `assistant_gm_cloud_tts`;
- `assistant_gm_proactive_briefs`;
- `assistant_gm_write_tools`;
- `assistant_gm_draft_actions`;
- `assistant_gm_lineup_actions`;
- `assistant_gm_waiver_actions`;
- `executive_checkout`.

Disabling Pro+ or paid providers must not break core accessibility.

### BE-EXEC-013 — Stripe Configuration Contract

Juanita supplies/configures:

- Stripe product;
- one-time price;
- price lookup key or environment-specific price ID;
- webhook endpoint secret;
- tax/account settings.

Codex adds server configuration validation without logging secrets.

No checkout implementation proceeds with invented IDs.

### BE-EXEC-014 — Checkout Session Endpoint

Commissioner-only endpoint/action.

Requirements:

- current authenticated user;
- commissioner verification;
- league/sport/season validation;
- prevents duplicate active purchase;
- uses server-configured price;
- signed/verified metadata;
- success/cancel URLs;
- idempotency;
- no Assistant GM access to payment tool.

### BE-EXEC-015 — Stripe Webhook Fulfillment

Handle required payment lifecycle events.

Requirements:

- raw-body signature verification;
- event idempotency table or constraint;
- activate only on authoritative success event;
- refund/reversal/dispute handling;
- safe retries;
- structured logs;
- tests using Stripe fixtures/test mode;
- success redirect never activates entitlement.

### BE-EXEC-016 — Executive Status UX

Add:

- Executive badge/status in league/settings context;
- commissioner purchase CTA behind flag;
- manager informational state;
- success/pending/error/refunded states;
- no aggressive gameplay interruptions;
- mobile and desktop accessibility.

---

## Phase 2 — Assistant GM Platform Boundary

### BE-GM-100 — Server-Only Assistant GM Gateway

Create one server entry point for:

- authentication;
- league context;
- membership verification;
- entitlement resolution;
- capability enforcement;
- provider/model routing;
- tool authorization;
- usage/cost logging;
- response classification.

The browser never receives provider secrets.

### BE-GM-101 — Structured Read Tool Contracts

Map and implement narrow authorized tools for:

- league context;
- roster;
- lineup;
- matchup;
- standings;
- draft;
- available players;
- player comparison;
- waiver state;
- trade context;
- schedule;
- injury status;
- history;
- invitations;
- entitlement.

Tests must prove league isolation, membership checks, missing data behavior, and no fabricated fallback.

### BE-GM-102 — Fact/Projection/Recommendation Schema

Every GM result must be internally classifiable as:

- authoritative fact;
- projection;
- recommendation;
- explanation;
- unsupported/unavailable.

UI and spoken language must distinguish them.

### BE-GM-103 — Entity Resolution

Resolve players, franchises, leagues, positions, weeks, and roster slots.

Requirements:

- ambiguity triggers clarification;
- unavailable player is not described as available;
- same/similar names handled;
- speech misrecognition does not silently select a different entity;
- current league context explicit.

### BE-GM-104 — Conversation State and Retention

Implement bounded context with:

- current user/league/season;
- current screen/task;
- summary of prior relevant turns;
- stop/reset/delete behavior;
- retention configuration;
- no unnecessary raw audio storage;
- no cross-league private context leakage.

### BE-GM-105 — Standard/Pro+ Capability Enforcement

Central policy decides whether an intent is:

- Standard;
- accessibility;
- Pro+;
- commissioner-only;
- unsupported.

Do not scatter payment checks through UI components.

Tests cover manager moving between Free and Executive leagues during the same session.

---

## Phase 3 — Voice and Accessible Interaction

### BE-VOICE-100 — Accessible Ask GM UI

Implement contextual Ask GM control with:

- idle/listening/processing/speaking/error states;
- visible and announced state;
- push-to-talk;
- cancel;
- type instead;
- stop/replay;
- transcript;
- Tell me more;
- focus restoration;
- no obstruction of critical gameplay controls.

### BE-VOICE-101 — Speech-to-Text Adapter

Requirements:

- provider abstraction;
- request-based bounded capture by default;
- microphone permission explanation;
- recording duration cap;
- cancel/retry;
- transcript preview where exact entities matter;
- typed fallback;
- telemetry;
- no permanent recording state.

### BE-VOICE-102 — Spoken Output Adapter

Implement selectable path:

- device/browser speech where acceptable;
- cloud TTS where enabled;
- screen-reader fallback;
- visible transcript always.

Requirements:

- stop immediately;
- replay;
- concise default;
- no critical screen-reader collision;
- TTS failure leaves text response intact.

### BE-VOICE-103 — Audio Priority Policy

Define and test behavior among:

- VoiceOver/TalkBack;
- GM speech;
- draft clock alerts;
- transaction confirmations;
- scoring notifications;
- system audio.

Critical confirmations and user stop control take priority.

### BE-VOICE-104 — Exact Entity and Email Confirmation

Reuse/implement phonetic email readback and exact displayed transcript.

Test:

- repeated letters;
- B/D/P/T ambiguity;
- numbers;
- hyphen;
- underscore;
- plus addressing;
- correction followed by fresh readback and confirmation;
- multiple invitees;
- no send before confirmation.

### BE-VOICE-105 — Voice Failure and Degraded Mode

Every failure provides retry, type instead, and cancel/return.

Prove usable degraded modes when:

- microphone denied;
- transcription fails;
- model fails;
- tool times out;
- TTS fails;
- cost/provider kill switch is active.

---

## Phase 4 — Standard Assistant GM

### BE-GM-120 — Fantasy Education Intents

Implement concise beginner explanations for scoring, positions, draft, lineup, locks, free agency, waivers, trades, matchup, standings, playoffs, and Big Exec competition concepts.

Use deterministic rule/source content where league-specific.

### BE-GM-121 — Roster and Lineup Read Intents

Support spoken and typed questions. Answers come from structured state.

### BE-GM-122 — Matchup and Standings Read Intents

Separate current score from projection and recommendation.

### BE-GM-123 — Player Search and Basic Comparison

Handle availability, ambiguity, position filters, and source/time context.

### BE-GM-124 — Draft, Waiver, and Invitation Read Intents

Read current authorized state without committing actions.

---

## Phase 5 — Assistant GM Pro+ Intelligence

### BE-PRO-200 — Executive Draft War Room

Build recommendation service and evaluation fixtures for roster need, value, scarcity, current availability, league rules, and pick context.

### BE-PRO-201 — Full Lineup Review

Return prioritized recommended changes with facts, projections, and uncertainty separated.

### BE-PRO-202 — Waiver Strategist

Rank actual available targets for the franchise and recommend a drop/contingency plan.

### BE-PRO-203 — Trade Advisor

Analyze incoming/outgoing deals and produce plausible counters using actual authorized rosters. Analysis may ship before voice trade transactions.

### BE-PRO-204 — Opponent Scout

Create matchup-specific report without pretending estimated opponent behavior is known.

### BE-PRO-205 — Front Office Brief

Generate no more than approximately three prioritized attention items. Deduplicate and resolve alerts.

### BE-PRO-206 — Season Planner

Cover bye weeks, roster depth, deadline needs, playoffs, and secondary postseason.

### BE-PRO-207 — Scenario Simulator

Start with deterministic scenarios that current data can support. Clearly label projections.

### BE-PRO-208 — Franchise Memory

Use only authorized Big Exec history. Add privacy, provenance, and no-invention tests.

### BE-PRO-209 — Personality Layer

Implement the approved funny/grumpy favorite-uncle/dad tone with configurable humor and verbosity.

Add safety/evaluation tests proving humor does not target protected traits, disability, skill level, or personal vulnerabilities.

---

## Phase 6 — Safe Actions

### BE-ACTION-300 — Prepare/Confirm/Revalidate/Commit Framework

One reusable transaction framework for every supported GM write.

Requirements:

- exact action preview;
- expiration;
- explicit confirmation;
- state/version revalidation;
- idempotency;
- canonical RPC call;
- result report;
- audit record;
- cancellation;
- no alternative silent substitution.

### BE-ACTION-301 — Lineup Action Adapter

Map to canonical lineup rules/RPC. Test valid, invalid, locked, stale, ambiguous, duplicate, and retry cases.

### BE-ACTION-302 — Draft Action Adapter

Map to `make_draft_pick` or its current canonical successor. Reverify on-clock and availability immediately before commit.

### BE-ACTION-303 — Waiver Action Adapter

Map to current waiver RPCs. Confirm add, drop, priority/FAAB, and exact claim.

### BE-ACTION-304 — Invitation Action Adapter

Map to current invitation RPC/email service. Confirm every exact address and report per-recipient result.

### BE-ACTION-305 — Explicit Autonomy Guard

Automated tests prove no unsolicited draft, lineup, waiver, drop, trade, invitation, payment, or account action can commit.

---

## Phase 7 — Cost, Analytics, and Operations

### BE-OPS-400 — Usage and Cost Ledger

Record per-request:

- league/user/season;
- Standard/Pro+;
- capability;
- provider/model;
- tokens;
- audio durations;
- estimated cost;
- latency;
- tool calls;
- status.

Restrict access and avoid sensitive raw content where metrics suffice.

### BE-OPS-401 — Model Router

Route:

- deterministic FAQ/template;
- low-cost text model;
- stronger reasoning model;
- STT;
- device/cloud TTS.

Add testable routing rules and safe fallback.

### BE-OPS-402 — Rate Limits and Budgets

Implement abuse limits, recording/response caps, timeouts, concurrency control, configurable league cost alerts, and global provider budgets.

Do not deny core accessibility solely because the Executive budget is exhausted; enter degraded accessible mode.

### BE-OPS-403 — Cost Dashboard

Internal view by league, manager, feature, model, and modality. Include revenue, estimated variable cost, and gross contribution estimate.

### BE-OPS-404 — Proactive Alert Scheduler

Use existing/reconciled unattended job architecture. Prove deduplication, quiet hours, opt-out, authorization, and resolved-condition cancellation.

### BE-OPS-405 — Privacy and Retention Controls

Document and implement transcript/audio retention, deletion, access controls, and provider data-handling configuration.

---

## Phase 8 — Evaluation and Release

### BE-QA-500 — Grounding Evaluation Suite

Fixtures for roster, lineup, matchup, standings, draft, waiver, trade, injury, and history facts. Any invented factual state is release-blocking.

### BE-QA-501 — Beginner Evaluation Suite

Test complete beginners questioning rules, terminology, navigation, and decisions. Measure answer accuracy, clarity, completion, verbosity, and follow-up usefulness.

### BE-QA-502 — Recommendation Evaluation Suite

Golden scenarios for draft, lineup, waiver, trade, opponent, season planning, and insufficient-data refusal.

### BE-QA-503 — Authorization and Entitlement Suite

Test Free/Executive context switches, nonmember access, commissioner-only checkout, refunded/revoked access, client tampering, and cross-league leakage.

### BE-QA-504 — Payment Lifecycle Suite

Stripe test-mode fixtures for completion, duplicate event, delayed event, refund, dispute, cancellation, and webhook failure/retry.

### BE-QA-505 — Voice E2E Suite

Test voice and typed form of every Beta intent, transcript, stop/replay, ambiguity, provider failure, and exact entity confirmation.

### BE-QA-506 — Accessibility Human QA

VoiceOver, TalkBack, keyboard, large text, reduced motion, and actual blind/low-vision user testing where testers are available.

### BE-QA-507 — Ten-Manager High-Usage Load Test

Model at minimum:

- all 10 managers active;
- 5-6 beginner-heavy users;
- draft-night burst;
- Sunday inactive-player burst;
- waiver-window burst;
- provider latency/failure;
- cost measurement.

### BE-QA-508 — Production-Equivalent Purchase-to-Use Test

Commissioner purchases in test mode, entitlement activates, all managers receive Pro+ in that league, Free league remains Standard, refund/revocation removes Pro+ without breaking gameplay/accessibility.

### BE-QA-509 — Release Scorecard

Create `docs/executive/RELEASE_SCORECARD.md`. No PASS without evidence.

---

## Recommended Execution Order

1. BE-EXEC-000
2. BE-EXEC-001
3. BE-EXEC-002
4. Reconcile existing accessibility backlog with Phase 3
5. BE-EXEC-010 through BE-EXEC-012
6. BE-GM-100 through BE-GM-105
7. BE-VOICE-100 through BE-VOICE-105
8. BE-GM-120 through BE-GM-124
9. BE-OPS-400 through BE-OPS-402
10. BE-PRO-200, BE-PRO-201, BE-PRO-202, BE-PRO-205
11. BE-ACTION-300 through BE-ACTION-305 only after read tools pass
12. Stripe tasks BE-EXEC-013 through BE-EXEC-016 when configuration is available
13. Remaining Pro+ intelligence
14. Full QA and release gates

Do not allow this feature to displace unresolved core standalone fantasy P0 work. Inventory and foundational architecture may proceed in parallel, but public paid release requires the underlying draft, lineup, waiver, trade, scoring, and season flows it advises to be proven.

---

## Immediate Codex Prompt

> Implement BE-EXEC-000 only. Read `AGENTS.md` and all required canonical files first. Inspect the current deployed Big Exec version, current main branch, and current production Supabase schema read-only. Create `docs/executive/REPO_INVENTORY.md` mapping the Executive League Season Pass and Assistant GM Pro+ PRD to exact existing routes, components, loaders, server actions, RPCs, tables, RLS policies, tests, CI, provider integrations, feature flags, and observability. Reconcile this PRD with the existing accessibility/voice backlog. Classify every finding as PROVEN, LIKELY/INFERRED, or UNVERIFIED. Do not implement checkout, AI, voice, migrations, or production changes in this task. Report conflicts before proposing architecture changes.

