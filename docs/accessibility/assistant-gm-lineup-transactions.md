# Assistant GM Lineup Transactions

## Status

BE-GM-063 is implemented as a guarded Voice GM lineup transaction helper.

## Files

- `apps/web/lib/assistant-gm/lineupTransactions.ts`
- `apps/web/lib/assistant-gm/lineupTransactions.test.ts`
- `apps/web/lib/assistant-gm/transactionConfirmations.ts`

## Flow

`prepareVoiceLineupMove`:

1. resolves the requested roster asset from verified roster data;
2. checks legal destination slots using the same starter-slot model as the Team page;
3. prepares the move proposal;
4. creates a confirmation object with the current roster/lineup state hash;
5. returns spoken/display confirmation text naming the player, target slot, week, and replaced player when present.

`commitVoiceLineupMove`:

1. requires a valid confirmation;
2. revalidates the current state hash;
3. applies idempotency by confirmation action ID;
4. calls canonical Supabase RPC `set_lineup_slot`.

## Guardrails

- Invalid slot eligibility explains the reason before any transaction is prepared.
- Ambiguous player names require user clarification.
- Stale state is rejected before `set_lineup_slot` is called.
- No new lineup engine is created; the existing Supabase RPC remains authoritative.
