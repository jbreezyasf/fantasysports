# Assistant GM Waiver Read Intents

## Status

BE-GM-046 is implemented as deterministic waiver answer rendering over structured Assistant GM tool results.

## Files

- `apps/web/lib/assistant-gm/waiverIntents.ts`
- `apps/web/lib/assistant-gm/waiverIntents.test.ts`

## Supported Intents

- `faab_balance`: answers “How much FAAB do I have?”
- `pending_claims`: answers “What waiver claims are pending?”
- `recommend_add`: answers “Who should I add?”
- `best_available`: answers “Best available RB/WR/etc.”

## Guardrails

- Waiver facts require successful `getWaiverRules` and `getWaiverState`.
- Recommendations are explicitly labelled as recommendations and not official transactions.
- Rostered players are filtered out of best-available answers.
- Current verified league rules report FAAB as not enabled; the app must not invent a FAAB balance.

## Known Limits

This task does not submit, withdraw, or reorder waiver claims. Voice/write transactions are deferred to the confirmation-model tasks and must call canonical transaction services.
