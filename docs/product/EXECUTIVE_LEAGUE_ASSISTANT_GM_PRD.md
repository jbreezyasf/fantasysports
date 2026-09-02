# Big Exec Fantasy Sports
## Executive League Season Pass + Assistant GM Pro+ PRD

**Version:** 1.0  
**Date:** September 2, 2026  
**Decision status:** LOCKED for specification; implementation NOT STARTED  
**Initial sport:** Pro Football  
**Initial league size:** 10 managers  
**Repository baseline inspected:** `jbreezyasf/fantasysports` main at `0e231fe03974a6c99fffa75b5c51c1d8b835af44`

---

## 1. Executive Decision

Big Exec will initially sell one premium offer:

### Big Exec Executive League Season Pass

- **Customer price:** **$99 USD**
- **Billing:** one-time payment
- **Coverage:** one league + one sport + one season
- **Purchaser:** league commissioner
- **Beneficiaries:** every active manager in the covered league, up to the league's supported manager limit
- **Included premium feature:** **Assistant GM Pro+** for all managers in that league
- **Renewal:** no automatic renewal in the initial release; a new pass is required for each new league/sport/season

Assistant GM Pro+ is an included feature entitlement, not a second customer-facing Stripe product and not sold separately at launch.

The entitlement must be modeled so future multi-league bundles or individual offers can be added without changing the meaning of the initial pass.

---

## 2. Product Positioning

Big Exec Free is a complete fantasy game. Managers can draft, maintain rosters, set lineups, use free agency and waivers, trade, communicate, compete, and access the product with supported accessibility tools.

The Executive League Season Pass upgrades the entire league's Front Office experience.

> **Every franchise gets its own upgraded Front Office. Every manager gets Assistant GM Pro+.**

The league-wide model prevents one manager from buying a material competitive advantage over the others. The paid product improves intelligence, preparation, explanation, automation assistance, and league experience without changing official fantasy rules or outcomes.

---

## 3. Stripe Product Setup

Create one Stripe product for launch.

| Stripe field | Required value |
|---|---|
| Product name | **Big Exec Executive League Season Pass** |
| Price | **$99.00 USD** |
| Billing type | **One-time** |
| Internal lookup key | `executive_league_season_pass` |
| Statement descriptor | `BIG EXEC` where permitted |
| Tax category | Determine through Stripe Tax/accounting configuration before sale |
| Customer-facing description | Upgrade one Big Exec league for one sport and one season. Includes Assistant GM Pro+ for every manager in the league, Executive Draft War Room, personalized lineup and waiver guidance, trade analysis, weekly Front Office Briefs, opponent scouting, proactive alerts, and premium league intelligence. |
| Metadata required on fulfillment | `product_code`, `league_id`, `sport_code`, `season_year`, `purchaser_user_id` |

### Stripe product code

`big_exec_executive_league_season_pass`

### Stripe price lookup key

`executive_league_99_usd_one_time`

Do not place a hard-coded Stripe price ID in application source. Store environment-specific price IDs in server configuration and resolve the product through the stable lookup key or approved configuration layer.

---

## 4. Entitlement Definition

An Executive entitlement belongs to a league-season, not to the commissioner account and not globally to each manager.

```text
Account -> League -> Sport -> Season -> Executive entitlement
```

Example:

| Manager's league | Sport/season | Entitlement | Assistant GM mode |
|---|---|---|---|
| Family League | Pro Football 2026 | Executive | Pro+ |
| Work League | Pro Football 2026 | Free | Standard |
| Friends League | Basketball 2026-27 | Executive | Pro+ |

A manager's Assistant GM personality and preferences may travel with the account, but premium capability is evaluated independently in the current league-season context.

### Required entitlement states

- `pending_payment`
- `active`
- `expired`
- `refunded`
- `revoked`
- `disputed`

### Required activation behavior

1. Commissioner starts checkout from a specific league and season.
2. Server verifies the user is the authorized commissioner.
3. Checkout metadata binds the transaction to that league, sport, season, and purchaser.
4. A verified Stripe webhook records payment completion.
5. Big Exec activates the league-season entitlement idempotently.
6. Every authorized member receives Pro+ when operating inside that league.
7. A success page must not be treated as payment proof.

### Security rules

- Client-supplied price, entitlement status, user identity, league identity, or season identity is never authoritative.
- Only verified server-side webhook events may activate, refund, revoke, or dispute an entitlement.
- Webhook processing must be idempotent.
- League membership and league context must be revalidated for every Pro+ request.
- Payment actions are never available as Assistant GM tool calls.

---

## 5. Standard Assistant GM

Standard Assistant GM is included in Big Exec Free.

Its primary responsibility is to help a manager understand and use Big Exec.

### Included capabilities

- explain fantasy concepts and Big Exec rules;
- explain positions, scoring, waivers, lineup locks, drafts, trades, standings, and league states;
- read the manager's authorized roster, lineup, matchup, standings, draft state, available players, waiver state, and league invitation state;
- answer basic player and roster questions using authorized structured data;
- provide basic, concise comparisons;
- support voice input, spoken output, and a visible text transcript;
- support accessible navigation and league-management assistance;
- prepare safe supported actions and request explicit confirmation;
- permit typed interaction when voice is unavailable or unwanted.

Standard Assistant GM is primarily reactive: it responds when asked.

---

## 6. Accessibility Is Not Premium

The following cannot be placed behind the Executive entitlement:

- keyboard and screen-reader access;
- VoiceOver and TalkBack compatibility;
- accessible labels, focus, state announcements, touch targets, contrast, large text, and reduced motion;
- speech-to-text as an alternate input method;
- spoken output necessary to make supported core tasks usable;
- visible transcripts;
- roster, lineup, matchup, draft, waiver, standings, and invitation readback needed for access;
- voice-assisted league invitations;
- natural and phonetic email readback;
- correction and reconfirmation of an email address;
- confirmation of consequential transactions;
- typed fallback, replay, stop, retry, and cancel controls.

Accessibility changes how a manager accesses the product. Executive changes the depth and proactivity of fantasy intelligence.

---

## 7. Assistant GM Pro+

Assistant GM Pro+ helps managers run a better franchise. It is available to every manager while operating inside an Executive league-season.

### 7.1 Executive Draft War Room

Uses authorized current draft state, league scoring, roster construction, picks already made, available players, positional scarcity, roster needs, bye weeks, injuries when trustworthy, and likely next-pick availability.

Outputs:

- recommended pick with concise reasoning;
- safe and upside alternatives;
- roster-needs warning;
- reach/value context;
- positional-run context;
- next-pick availability estimate clearly labeled as a projection;
- draft-grade report after completion.

The Assistant GM may recommend or prepare a pick. The canonical draft engine remains authoritative, and the manager must explicitly confirm before a pick is committed.

### 7.2 Proactive Front Office Brief

Provides a prioritized briefing when meaningful attention is required.

Possible items:

- injured/questionable starter;
- empty or illegal lineup slot;
- player on bye;
- inactive player approaching kickoff;
- useful available player;
- pending waiver or trade decision;
- upcoming multi-player bye-week risk;
- playoff or elimination scenario;
- draft action when the league is in draft phase.

The brief should prioritize approximately three meaningful actions rather than dump every available fact.

### 7.3 Waiver Strategist

Uses current league availability, roster need, injuries, schedule, waiver model, official priority/FAAB state, likely competitor needs, and required drop consequences.

Outputs:

- ranked targets for this franchise;
- recommended drop and explanation;
- short-term versus rest-of-season label;
- contingency targets;
- claim-order recommendation;
- FAAB guidance when the league uses FAAB;
- explicit uncertainty where competitor behavior is estimated.

Claims must use existing authoritative waiver services/RPCs and require confirmation.

### 7.4 Trade Room Advisor

Uses actual authorized league rosters and franchise needs.

Outputs:

- accept/reject/hold recommendation;
- roster impact on both sides;
- lineup and depth consequences;
- rest-of-season risk;
- plausible counteroffer suggestions;
- potential trade partners based on complementary roster needs.

Assistant GM Pro+ may prepare a proposal or counter. It may not accept, reject, or transmit a trade without the required user action and confirmation. Voice trade transactions may remain post-Beta even when analysis ships earlier.

### 7.5 Lineup Command Center

Reviews the entire lineup, not only one player comparison.

Outputs:

- recommended changes;
- injury/inactive alerts;
- kickoff and lock warnings;
- matchup, projected usage, weather when reliable, and recent-trend context;
- safe versus upside lineup framing;
- legality validation through Fantasy Core.

It may prepare lineup moves but cannot silently manage a roster.

### 7.6 Opponent Scout

Produces a matchup-specific scouting report using official league state.

Outputs:

- current projection with source/time context;
- opponent strengths and weaknesses;
- players remaining and schedule timing;
- safe versus upside recommendation;
- matchup-specific roster decisions without implying the opponent's future action is known.

### 7.7 Scenario Simulator

Supports questions including:

- What happens if I trade this player?
- Can I survive an upcoming bye week?
- What if I lose this waiver claim?
- What must happen for me to make the playoffs?
- Who might I face at a given seed?

Simulations are advisory. They must be labeled as projections and must never overwrite official fantasy state.

### 7.8 Season Planner

Identifies longer-term roster risks and opportunities:

- upcoming bye-week conflicts;
- shallow positions;
- redundant depth;
- trade-deadline needs;
- playoff schedule considerations;
- qualification scenarios;
- secondary postseason path;
- championship path.

### 7.9 Franchise Memory

Uses authorized persistent Big Exec history to contextualize rivalries, prior seasons, trades, achievements, championships, records, and milestones.

It may say that a prior event occurred only when the authoritative historical record supports it. It may never invent personal history or private cross-league information.

### 7.10 Personality and Explanation

The default personality is a knowledgeable, funny, slightly grumpy favorite-uncle/dad-style football personality.

Rules:

- humor targets players, decisions, situations, and fantasy chaos—not the manager's identity or vulnerabilities;
- no harassment, protected-class insults, sexual content directed at the user, or humiliation;
- concise recommendation first;
- explanation second;
- longer detail only when requested;
- distinguish fact, projection, recommendation, and uncertainty;
- allow the manager to reduce humor and verbosity.

---

## 8. Voice Experience

Beta uses an accessible push-to-talk model.

```text
Push to talk -> transcription -> displayed transcript -> intent/tool processing
-> text response -> spoken playback + persistent text -> optional follow-up
```

### Required states

- idle;
- listening;
- processing;
- speaking;
- stopped;
- error.

### Required controls

- Ask GM;
- stop listening;
- cancel request;
- edit/correct transcript where needed;
- type instead;
- stop speaking;
- replay last response;
- Tell me more;
- dismiss/return.

### Cost architecture

- no always-listening behavior in Beta;
- bounded push-to-talk turns;
- use speech-to-text + text reasoning + text-to-speech/device speech instead of an unrestricted continuous speech-to-speech session by default;
- concise spoken answers by default;
- cache safe, non-personal educational responses;
- summarize long conversation history;
- route simple education/navigation intents to the least expensive capable model;
- reserve stronger reasoning for high-value draft, waiver, trade, lineup, and scenario tasks;
- record cost telemetry without retaining raw voice audio by default.

### Voice privacy

- request microphone access only after a user action;
- explain why access is needed;
- do not store raw audio by default;
- store the transcript only according to the approved conversation-retention policy;
- provide transcript deletion controls when persistent history is introduced;
- never use voice recordings for model training without explicit, separate consent and policy review.

---

## 9. Assistant GM Tool Boundary

Supabase remains authoritative league and transaction state. Fantasy Core remains authoritative for legal rosters, lineups, scoring, outcomes, standings, and official awards.

The Assistant GM may interpret intent, explain, rank, recommend, and call narrowly scoped tools. It receives no unrestricted database access.

### Minimum read tools

- `getLeagueContext`
- `getExecutiveEntitlement`
- `getRoster`
- `getLineup`
- `getMatchup`
- `getStandings`
- `getDraftState`
- `getDraftAvailablePlayers`
- `getDraftQueue`
- `searchPlayers`
- `comparePlayers`
- `getAvailablePlayers`
- `getWaiverState`
- `getTradeContext`
- `getInjuryStatus`
- `getScheduleContext`
- `getFranchiseHistory`
- `getLeagueInvitations`

Names may map to existing services. Codex must inspect and reuse existing canonical loaders/RPCs instead of duplicating fantasy logic.

### Write transaction model

Every supported consequential action uses:

```text
Prepare -> Display/speak exact proposed action -> Confirm -> Revalidate -> Commit -> Report result
```

The application, not the LLM, determines whether the action is legal.

---

## 10. Data Model Requirements

Codex must map these concepts to the current Supabase schema and version-controlled migration strategy after completing repository/schema inventory.

### `products` or server configuration

- product code;
- Stripe product ID;
- Stripe price ID/lookup key;
- active state;
- currency;
- amount;
- entitlement type.

### `league_season_entitlements`

- id;
- league_id;
- competition_season_id or equivalent season reference;
- sport_code;
- product_code;
- status;
- purchaser_user_id;
- Stripe customer ID;
- Stripe checkout session/payment intent ID;
- Stripe event ID used for activation;
- activated_at;
- expires_at or season-end rule;
- revoked/refunded/disputed timestamps;
- metadata;
- created_at/updated_at.

Required uniqueness prevents more than one active entitlement for the same league/sport/season/product.

### `assistant_gm_conversations`

- id;
- user_id;
- league_id;
- season reference;
- mode: standard/pro_plus;
- summary or approved retained context;
- user preferences;
- retention timestamps.

### `assistant_gm_usage`

- request ID;
- user/league/season;
- capability;
- mode;
- model/provider;
- input/output text tokens;
- speech input/output duration;
- estimated and reconciled cost;
- latency;
- success/failure;
- tool calls;
- created_at.

### `assistant_gm_action_audit`

- user/league/season;
- requested action;
- prepared action;
- confirmation state/time;
- authoritative state/version used;
- commit result;
- failure reason;
- idempotency key;
- timestamps.

Do not store payment secrets, provider secrets, or unnecessary raw voice audio in public tables.

---

## 11. Usage and Cost Controls

The product should feel generously usable for ordinary beginner behavior. Do not expose a small visible message counter at launch.

Required internal controls:

- cost ledger by league, manager, feature, provider, model, and modality;
- soft cost alerts at configurable league thresholds;
- global and per-user abuse rate limits;
- maximum recording duration per turn;
- maximum response duration/length;
- timeout and cancellation;
- model routing by task complexity;
- caching for safe repeatable education;
- conversation summarization;
- kill switches for voice input, cloud speech output, Pro recommendations, proactive alerts, and write tools;
- no accessibility lockout when a premium/expensive capability is disabled;
- configurable degraded mode: typed request + text response + device screen reader.

Initial planning thresholds should be configuration, not contractual customer limits. Product analytics from the founding Beta will determine sustainable fair-use policy.

---

## 12. Notifications

Proactive alerts must be meaningful and rate-limited.

### Initial channels

- in-app Front Office Brief;
- in-app notification center;
- email only where the user has opted in and the current email system supports the template safely.

Push/SMS are future channels unless separately approved and implemented.

### Alert rules

- deduplicate the same problem;
- show source/time context;
- stop alerts after the condition resolves;
- do not reveal private roster/trade information to unauthorized recipients;
- allow per-category opt-out;
- quiet-hours support before broad release;
- urgent inactive/lock alerts take priority over general advice.

---

## 13. UX Placement

### Global access

Assistant GM is reachable from authenticated Big Exec gameplay surfaces without becoming a sixth permanent primary navigation destination.

Recommended patterns:

- persistent Ask GM control in the authenticated shell;
- contextual Ask GM actions in Draft Room, Team, Free Agency, Trade Room, Matchup, and League;
- Front Office Brief card/module on Front Office;
- mode label: Standard or Pro+;
- Executive League badge in appropriate league/settings surfaces.

The control must not cover critical draft, lineup, confirmation, or mobile navigation controls.

### Upgrade experience

Only commissioners may begin the league purchase flow.

Managers may see:

> This league uses Standard Assistant GM. Ask your commissioner about upgrading the league to Executive.

Do not interrupt core gameplay with aggressive upgrade prompts.

---

## 14. Analytics and Success Metrics

### Commercial

- league creation to checkout start;
- checkout completion;
- Executive attach rate;
- refund/dispute rate;
- renewal into the next sport/season;
- cost and gross contribution per league-season.

### Product

- Assistant GM weekly active managers;
- questions per active manager;
- voice versus typed usage;
- Standard versus Pro+ usage;
- capability distribution;
- recommendation viewed;
- prepared action rate;
- confirmed action rate;
- successful commit rate;
- alert usefulness/dismissal;
- beginner task completion;
- thumbs-up/down and correction rate.

### Quality and safety

- structured-tool grounding rate;
- hallucinated/factually incorrect state reports;
- ambiguous player/entity resolution rate;
- stale-state rejection rate;
- duplicate transaction prevention;
- accessibility task success;
- VoiceOver/TalkBack completion;
- speech recognition correction rate;
- cost per successful assisted decision;
- latency and error rate.

---

## 15. Beta Scope

### Beta must include

- entitlement foundation behind a feature flag;
- one league/sport/season entitlement model;
- Standard versus Pro+ capability check;
- push-to-talk, transcript, spoken playback, typed fallback;
- accessibility voice features independent from payment;
- structured read tool boundary;
- basic fantasy education;
- roster/lineup/matchup/standings read intents;
- Draft War Room recommendations;
- lineup review;
- waiver recommendations;
- Front Office Brief;
- prepare/confirm/revalidate safety for any enabled write action;
- usage and cost telemetry;
- admin kill switches;
- refund/revocation-safe entitlement behavior;
- end-to-end accessibility and authorization tests.

### May follow Beta

- voice trade creation/acceptance;
- always-listening/wake word;
- multilingual voice;
- custom premium celebrity-style voices;
- autonomous roster management;
- all-sport bundles;
- multi-league commissioner bundles;
- individual manager subscriptions;
- SMS/push alerts;
- advanced scenario simulation;
- expanded cross-season franchise memory.

---

## 16. Explicit Non-Goals

- Assistant GM does not determine official scores, winners, standings, eligibility, or awards.
- Assistant GM does not receive unrestricted database access.
- Assistant GM does not silently draft, add/drop, submit waivers, change lineups, or accept trades.
- Accessibility is not conditioned on payment.
- The initial $99 pass does not cover every league, sport, or future season owned by the commissioner.
- Assistant GM Pro+ is not sold separately at launch.
- No claim of ADA certification is made solely because these requirements are implemented.

---

## 17. Release Gates

### Gate E0 — Inventory

- current repo/schema/deployment mapped;
- existing accessibility backlog reconciled;
- existing loaders, RPCs, auth, and transaction boundaries identified;
- documentation drift recorded.

### Gate E1 — Entitlement safety

- idempotent activation/refund/revocation tests pass;
- commissioner authorization proven;
- cross-league access denied;
- client cannot self-upgrade;
- webhook signature verification proven with test events.

### Gate E2 — Structured GM reads

- answers match authoritative state;
- missing tool data produces an explicit limitation;
- no invented roster, score, availability, standings, draft, waiver, trade, or injury facts;
- Standard versus Pro+ enforcement proven.

### Gate E3 — Voice and accessibility

- push-to-talk, transcript, typed fallback, stop/replay work;
- VoiceOver and TalkBack core flows pass;
- screen-reader and GM audio priority tested;
- voice failure never removes text access;
- phonetic invitation confirmation passes.

### Gate E4 — Advice quality

- evaluation fixtures cover beginners, draft, lineup, waiver, trade analysis, ambiguity, and insufficient data;
- recommendations cite internally traceable facts;
- fact/projection/recommendation language is separated;
- unsafe or unsupported automation is rejected.

### Gate E5 — Transaction safety

- prepare/confirm/revalidate/commit proven;
- stale state rejected;
- duplicate confirmations/commits prevented;
- authoritative RPCs remain final decision boundary;
- audit log supports dispute investigation.

### Gate E6 — Cost and operations

- cost telemetry reconciles with provider usage closely enough for operations;
- rate limits, timeouts, budgets, and kill switches proven;
- a high-usage 10-manager load test completes;
- degraded accessible mode works when paid speech/AI providers fail;
- projected cost supports the $99 price before public sale.

### Gate E7 — Production-equivalent league QA

- actual 10-manager league flow tested;
- mobile and desktop tested;
- refresh/reconnect tested;
- payment-to-entitlement-to-Pro+ tested;
- refund/revocation tested;
- no gate marked PASS without recorded evidence.

---

## 18. Known Current-State Findings

### PROVEN from repository inspection

- The application is a Next.js 15/React 19 web app in an npm/Turborepo workspace.
- Supabase is the authoritative database/auth layer.
- Current server actions already call canonical Supabase RPCs for draft picks, free agency, waivers, and league invitations.
- Current architecture explicitly says AI may narrate but may not determine authoritative fantasy outcomes.
- `OPENAI_API_KEY` already exists as an empty server environment placeholder.
- Stripe is not present in the inspected application dependencies or environment template.
- No Assistant GM implementation or entitlement model was found on the inspected main branch.
- Current gameplay gates, including authenticated 10-manager draft QA, are not all passed.

### UNVERIFIED until implementation inventory

- exact production schema available to the future Assistant GM;
- final speech/transcription provider;
- device-native TTS quality across supported browsers;
- production AI cost per beginner manager;
- final fair-use thresholds;
- final Stripe tax/accounting configuration.

---

## 19. Definition of Done

The feature is not done because a chat panel exists or Stripe reports a payment.

Done requires:

1. the correct league-season entitlement activates from verified payment;
2. all authorized league managers receive Pro+ only in that league context;
3. free accessibility voice remains usable without payment;
4. the GM uses structured authorized Big Exec state;
5. official fantasy truth remains deterministic;
6. consequential actions require confirmation and state revalidation;
7. cost telemetry and operational controls are proven;
8. mobile, desktop, VoiceOver, and TalkBack flows are tested;
9. production-equivalent 10-manager QA succeeds;
10. evidence is recorded before any release gate is marked PASS.



---

## Structured Voice Knowledge Base

Stable Assistant GM answers are maintained under `docs/assistant-gm/knowledge-base/`. Every implementation must read `00_READ_THIS_FIRST.md`, use `01_ROUTING_INDEX.md`, and retrieve only the matching FAQ topic. Current roster, matchup, draft, deadline, injury, availability, transaction, entitlement, and standings facts must come from authorized live state rather than static FAQ text. Source and review ownership is recorded in `SOURCE_AND_REVIEW_REGISTER.md`.
