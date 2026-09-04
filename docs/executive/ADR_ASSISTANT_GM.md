# ADR: Executive League + Assistant GM Architecture

Task: BE-EXEC-002  
Date: 2026-09-02  
Status: Accepted for beta implementation  

## Context

Big Exec will sell one launch premium offer: the **Big Exec Executive League Season Pass**, a $99 one-time league/sport/season purchase by the commissioner that gives every active manager in that league Assistant GM Pro+ while that league-season is active.

Current verified repo facts:

- The app is a Next.js App Router web app backed by Supabase Auth, Supabase tables, and Supabase RPCs.
- Fantasy truth remains in Supabase/Fantasy Core and existing canonical RPCs.
- Accessibility/voice primitives already exist and must remain free.
- Assistant GM read/tool helper modules exist, but no production Assistant GM gateway, entitlement service, usage ledger, model router, Stripe checkout, or webhook exists.
- Production table names are `fantasy_leagues`, `league_seasons`, `league_members`, and `league_invites`.

## Decisions

### 1. Server-Only Assistant GM Gateway

Assistant GM traffic will enter through one server-only gateway.

The gateway owns:

- Supabase Auth user verification;
- league membership verification;
- current league-season resolution;
- entitlement/capability evaluation;
- tool authorization;
- provider/model routing;
- usage/cost logging;
- response classification;
- error/degraded-mode shaping.

The browser never receives model provider secrets, service-role keys, payment secrets, or unrestricted database access.

### 2. Tool Boundary

Assistant GM tools use narrow typed contracts over existing loaders and Supabase queries/RPCs.

Existing starting point:

- `apps/web/lib/assistant-gm/tools.ts`
- `apps/web/lib/assistant-gm/grounding.ts`
- `apps/web/lib/assistant-gm/*Intents.ts`

The LLM may receive structured tool outputs. It may not inspect screenshots, scrape the DOM, infer official state from rendered UI, or call arbitrary Supabase tables.

### 3. Fantasy And Transaction Authority

Assistant GM may explain, summarize, rank, recommend, and prepare supported actions. It may not determine official fantasy outcomes.

Consequential actions must follow:

```text
Prepare -> Confirm -> Revalidate -> Commit -> Audit -> Report
```

Commit adapters must call existing canonical transaction paths:

- draft picks: `make_draft_pick`
- lineup moves: `set_lineup_slot`
- waiver claims: `submit_waiver_claim`
- invitations: existing league invite action/RPC/email path
- trades: existing trade action/RPC path when beta scope permits

No duplicate draft, lineup, waiver, trade, or invitation engine should be created for Assistant GM.

### 4. Capability And Entitlement Evaluation

Capability policy starts in:

- `apps/web/lib/executive/capabilities.ts`

Entitlements will be evaluated at league-season scope, not account-global scope.

Required production naming:

- `fantasy_leagues`
- `league_seasons`
- `league_members`
- `season_franchises`

Accessibility capability must never require Executive entitlement. This includes keyboard access, screen-reader semantics, voice input as alternate input, spoken output for supported core tasks, visible transcripts, typed fallback, stop/replay/retry/cancel controls, and transaction confirmation.

### 5. Provider Adapter Strategy

Use provider adapters behind the server gateway.

Default beta shape:

- deterministic FAQ/template responses where sufficient;
- structured Supabase/Fantasy Core tools for live facts;
- a text model for natural-language response generation when needed;
- browser speech recognition as the initial STT path;
- browser speech synthesis as the initial TTS path;
- cloud STT/TTS only behind explicit flags and cost controls.

Current source starting points:

- `apps/web/lib/voice/speechToText.ts`
- `apps/web/lib/voice/textToSpeech.ts`
- `apps/web/app/components/AskGmPushToTalk.tsx`

### 6. Request-Based STT/Text/TTS Default

Voice input defaults to push-to-talk/request-based capture with a duration cap and visible transcript. Continuous ambient listening is out of scope for beta.

Every voice result must keep text visible. TTS failure must leave the text answer usable.

### 7. Degraded Mode

When microphone, STT, TTS, model, tool, entitlement, provider, rate-limit, or cost controls fail, the product must remain usable through typed input and visible text output where the underlying capability is allowed.

Accessibility degraded mode must not depend on Executive budget or payment status.

### 8. Conversation Retention

Beta conversation state will be bounded by:

- user id;
- league id;
- league season id;
- current screen/task;
- recent relevant turn summary;
- retention configuration.

Do not permanently store raw voice audio by default. Avoid storing full transcript text where metrics or short summaries are sufficient. Provide future delete/reset hooks before broad beta exposure.

### 9. Cost Telemetry

Every provider-backed request should emit usage data:

- user/league/season;
- Standard or Pro+ capability;
- provider/model;
- tokens or audio duration when known;
- estimated cost;
- latency;
- tool calls;
- status/error class.

This belongs in a restricted ledger/service, not client-visible state.

### 10. Notification And Proactive Briefing

Proactive Assistant GM behavior must use existing/reconciled unattended job architecture and must prove:

- deduplication;
- quiet hours;
- opt-out;
- authorization;
- resolved-condition cancellation.

Until that exists, Assistant GM should be reactive or explicitly user-triggered.

### 11. Privacy Posture

Assistant GM should receive the minimum authorized state needed for the task. It must not expose another league's private roster, matchup, trade, invitation, or manager context.

Payment actions are never Assistant GM tools.

## Implementation Consequences

- BE-EXEC-010 must create an entitlement schema that references existing league-season tables and accounts for Supabase Data API grants/RLS.
- BE-EXEC-011 must be server-only and must not trust client entitlement status.
- BE-EXEC-012 should expand the current voice feature flags into a broader capability/kill-switch layer.
- BE-GM-100 should wrap existing assistant-gm read helpers rather than replacing them.
- BE-ACTION-300 should reuse the existing transaction confirmation/autonomy helpers and add durable idempotency/audit storage before production writes.
- Stripe tasks remain blocked until real Stripe product/price/webhook configuration is supplied.

## Non-Decisions

- No model vendor is locked beyond the existing OpenAI key usage for matchup talk.
- No cloud STT/TTS provider is selected.
- No Stripe checkout implementation is authorized without real configuration.
- No production schema change is made by this ADR.

