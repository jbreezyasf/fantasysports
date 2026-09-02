# Assistant GM Draft Transactions

## Status

BE-GM-064 is implemented as a guarded Voice GM draft-pick helper.

## Files

- `apps/web/lib/assistant-gm/draftTransactions.ts`
- `apps/web/lib/assistant-gm/draftTransactions.test.ts`
- `apps/web/lib/assistant-gm/transactionConfirmations.ts`

## Flow

`prepareVoiceDraftPick`:

1. verifies the draft is live;
2. verifies the requester owns the current pick;
3. resolves the requested player or D/ST in the verified available draft pool;
4. refuses ambiguous or unavailable player requests;
5. creates a confirmation object with the current draft-state hash;
6. returns spoken/display confirmation text naming the exact asset and pick number.

`commitVoiceDraftPick`:

1. requires a valid confirmation;
2. revalidates the current draft-state hash;
3. applies idempotency by confirmation action ID;
4. calls canonical Supabase RPC `make_draft_pick` with `p_auto: false`.

## Guardrails

- A user who is not on the clock cannot prepare a pick.
- Unavailable players are rejected and no fallback pick is selected.
- Stale draft state is rejected before `make_draft_pick` is called.
- The draft engine remains authoritative because the helper never writes draft tables directly.
