# Assistant GM Capability Policy

## Status

BE-GM-105 is implemented as the central Standard/Pro+ capability enforcement layer. It decides tier, audience, and release eligibility for Assistant GM intents. It does not implement checkout, LLM routing, or voice surfaces.

## Files

- `apps/web/lib/assistant-gm/capabilityPolicy.ts`
- `apps/web/lib/assistant-gm/capabilityPolicy.test.ts`
- `apps/web/lib/assistant-gm/gateway.ts` (refactored to consume the policy)

## Why this exists

The backlog rule for BE-GM-105 is explicit: *do not scatter payment checks through UI components*. Before this task the Assistant GM gateway ran its own kill-switch, entitlement, and audience checks, and any future UI surface would have been free to invent a second set. This module is the single decision point.

Callers pass an intent (or a capability id) plus a server-resolved context and receive one decision object. UI components render from that decision. They must not read entitlement rows, Stripe state, or feature flags themselves.

## Intent classes

Every intent resolves to exactly one class:

| Class | Meaning |
| --- | --- |
| `standard` | Included in every league at no cost |
| `accessibility` | Free accessibility capability; never payment-gated |
| `pro_plus` | Requires an active Executive league-season entitlement |
| `commissioner_only` | Restricted to the league commissioner |
| `unsupported` | Not a declared Big Exec capability |

Intent ids are namespaced (`waiver.best_available`, `players.best_available`) because bare intent names collide across the existing intent modules.

## Decision order

The order is deliberate and load-bearing:

1. **Unknown intent** — refuse before any state is read.
2. **Unauthenticated** — no capability work for anonymous callers.
3. **Master kill switch** (`assistant_gm`) — free accessibility capabilities are exempt.
4. **Pro+ kill switch** (`assistant_gm_pro_plus`).
5. **Audience** — checked *before* entitlement.
6. **Entitlement** — Executive league-season check.
7. **Release phase** — `post_beta` capabilities are withheld during the beta.

Audience precedes entitlement so a manager asking for a commissioner-only capability is told it is commissioner-only, rather than being shown an Executive upgrade prompt for something a purchase would not unlock. The gateway test `never upsells a role denial` pins this.

## Upgrade prompts

`describeAssistantGmUpgradePrompt(decision)` is the only source of Executive upgrade copy. It returns `show: true` only when `upgradeRequired` is true, which happens solely for the `entitlement_required` denial reason. Kill-switch, audience, release-phase, and unknown-intent denials never produce an upgrade prompt.

## Accessibility guarantee

Free accessibility capabilities (`accessibility.voice_input`, `accessibility.spoken_output`, `accessibility.typed_fallback`, `accessibility.confirm_transactions`) remain allowed with `assistant_gm` and `assistant_gm_pro_plus` both off and with no entitlement present. This is pinned by test and enforces backlog Operating Rule 6.

## Cross-league sessions

`createAssistantGmPolicySession` resolves entitlement per league scope on every evaluation. It intentionally holds no session-wide entitlement value, so a manager moving between a Free league and an Executive league in one session cannot carry Pro+ access across the boundary, and an entitlement activated mid-session is visible without rebuilding the session.

Tests cover: grant in Executive and deny in Free within one session; no leak when returning to the Free league; per-scope re-resolution; mid-session activation; and no entitlement lookup at all for an unauthenticated session.

## Gateway integration

`createAssistantGmGateway` no longer implements tier logic. It resolves the executive flag for the league season, calls `evaluateAssistantGmCapability`, maps the denial reason to its existing wire code, and attaches the full decision as `policy` so callers can render one shared prompt.

Reason-to-code mapping:

| Policy reason | Gateway code |
| --- | --- |
| `unauthenticated` | `unauthenticated` |
| `feature_disabled` | `feature_disabled` |
| `entitlement_required` | `entitlement_required` |
| `audience_denied`, `not_released`, `unknown_intent` | `unsupported_capability` |

## Known limits

- The policy decides eligibility only. It does not execute intents, call tools, or commit actions.
- Intent ids are declared here but natural-language intent *parsing* is not part of this task.
- `releasePhase` defaults to `beta`; there is no production release-phase configuration source yet.
- No UI surface consumes the policy yet. BE-VOICE-100 is the first planned consumer.
