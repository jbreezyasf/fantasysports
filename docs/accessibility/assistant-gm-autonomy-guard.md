# Assistant GM Autonomy Guard

## Status

BE-GM-067 is implemented as an explicit autonomy guard for beta Assistant GM commits.

## Files

- `apps/web/lib/assistant-gm/autonomyGuard.ts`
- `apps/web/lib/assistant-gm/autonomyGuard.test.ts`
- `apps/web/lib/assistant-gm/transactionConfirmations.ts`

## Rule

Assistant GM cannot commit a transaction unless the commit has:

- a user-originated request from voice or text;
- matching user and league scope;
- a valid transaction confirmation object.

## Explicit Rejections

- unsolicited lineup change
- unsolicited waiver claim
- unsolicited draft pick
- trade resolution/acceptance without user request
- standalone roster drop in beta
- payment actions
- account actions

The guard is reusable by future task-specific commit paths. It does not create a new fantasy transaction service and does not write roster, lineup, draft, waiver, trade, payment, or account tables directly.
