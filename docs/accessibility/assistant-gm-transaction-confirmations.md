# Assistant GM Transaction Confirmations

## Status

BE-GM-060 is implemented as a confirmation guard for future Assistant GM write paths.

## Files

- `apps/web/lib/assistant-gm/transactionConfirmations.ts`
- `apps/web/lib/assistant-gm/transactionConfirmations.test.ts`

## Model

Assistant GM write flows must use `prepareTransactionConfirmation` before commit. The confirmation object contains:

- action ID
- user ID
- league ID
- action type
- proposed changes
- state version/hash
- proposal hash
- created time
- expiration time

`commitWithTransactionConfirmation` validates the confirmation before executing the supplied commit callback. Future task-specific commits must use the existing canonical Supabase RPCs such as `set_lineup_slot`, `claim_free_agent`, `submit_waiver_claim`, `make_draft_pick`, `create_trade_proposal`, and `resolve_trade`.

## Guardrails

- Missing confirmation blocks commit.
- Expired confirmation blocks commit.
- User, league, or action mismatch blocks commit.
- Changed proposal or changed state hash blocks commit and requires a new confirmation.
- Idempotent commit support uses the confirmation `actionId` as the retry key. A repeated commit returns the prior result instead of executing the commit callback again.
- Stale state rejection can be labeled for player drafted, waiver unavailable, lineup eligibility changed, FAAB changed, roster changed, or generic state changed cases.
- This task does not create new roster, lineup, draft, waiver, or trade engines.

## Idempotency

BE-GM-061 adds `commitIdempotentlyWithTransactionConfirmation` and the `AssistantGmIdempotencyStore` interface. Future write tasks must back this interface with durable storage before enabling production Voice GM writes, then call the existing canonical RPCs only from the guarded commit callback.

## State Revalidation

BE-GM-062 uses the confirmation `stateVersionHash` as the revalidation boundary. If the current verified state hash differs from the confirmation hash, commit is rejected before any write callback runs.

Supported stale-state labels:

- player drafted by another manager
- player no longer available on waivers
- lineup eligibility changed
- FAAB changed
- roster changed

The stale draft and waiver messages explicitly forbid automatic substitution. A future transaction-specific task must ask the user to review and confirm a new proposal instead.
