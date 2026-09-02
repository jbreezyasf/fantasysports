# Assistant GM Waiver Transactions

## Status

BE-GM-065 is implemented as a guarded Voice GM waiver-claim helper.

## Files

- `apps/web/lib/assistant-gm/waiverTransactions.ts`
- `apps/web/lib/assistant-gm/waiverTransactions.test.ts`
- `apps/web/lib/assistant-gm/transactionConfirmations.ts`

## Flow

`prepareVoiceWaiverClaim`:

1. resolves the requested add player or D/ST from verified open waiver holds;
2. requires a verified drop player when the roster is full;
3. validates FAAB bid only when verified rules say FAAB is enabled;
4. creates a complete proposal containing add, drop, FAAB, and priority/rule context;
5. creates a confirmation object with the current waiver/roster/rules state hash.

`commitVoiceWaiverClaim`:

1. requires a valid confirmation;
2. revalidates the current waiver/roster/rules state hash;
3. applies idempotency by confirmation action ID;
4. calls canonical Supabase RPC `submit_waiver_claim`.

## Guardrails

- Unavailable waiver assets are rejected without substitution.
- Full rosters require an explicit verified drop.
- FAAB bids cannot exceed verified budget when FAAB is enabled.
- The helper does not add a FAAB write argument because the current canonical RPC has no FAAB parameter.
- No waiver tables are written directly.
