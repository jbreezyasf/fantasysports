import { describe, expect, it } from 'vitest';
import {
  commitIdempotentlyWithTransactionConfirmation,
  commitWithTransactionConfirmation,
  createMemoryAssistantGmIdempotencyStore,
  prepareTransactionConfirmation,
  validateTransactionConfirmation
} from './transactionConfirmations';

const base = {
  userId: 'user-1',
  leagueId: 'league-1',
  actionType: 'lineup_set' as const,
  proposedChanges: { seasonFranchiseId: 'sf-1', week: 1, slot: 'FLEX', athleteId: 'athlete-1' },
  stateVersionHash: 'lineup-state-v1',
  now: new Date('2026-09-01T12:00:00.000Z')
};

describe('Assistant GM transaction confirmation model', () => {
  it('prepares a scoped confirmation object with action, state, and expiration metadata', () => {
    const confirmation = prepareTransactionConfirmation(base);

    expect(confirmation.actionId).toMatch(/[0-9a-f-]{36}/);
    expect(confirmation).toMatchObject({
      userId: 'user-1',
      leagueId: 'league-1',
      actionType: 'lineup_set',
      proposedChanges: base.proposedChanges,
      stateVersionHash: 'lineup-state-v1',
      createdAt: '2026-09-01T12:00:00.000Z',
      expiresAt: '2026-09-01T12:05:00.000Z'
    });
    expect(confirmation.proposalHash).toHaveLength(64);
  });

  it('requires a valid confirmation before commit executes', async () => {
    let committed = false;
    const result = await commitWithTransactionConfirmation(undefined, base, () => {
      committed = true;
      return { rpc: 'set_lineup_slot' };
    });

    expect(result).toEqual({ ok: false, actionId: undefined, code: 'missing_confirmation', message: 'Confirm this Assistant GM action before submitting it.' });
    expect(committed).toBe(false);
  });

  it('allows commit only when confirmation matches the user, league, action, proposal, and state hash', async () => {
    const confirmation = prepareTransactionConfirmation(base);
    const result = await commitWithTransactionConfirmation(confirmation, base, () => ({ rpc: 'set_lineup_slot' }));

    expect(result).toEqual({ ok: true, actionId: confirmation.actionId, result: { rpc: 'set_lineup_slot' } });
  });

  it('expires confirmation objects', () => {
    const confirmation = prepareTransactionConfirmation({ ...base, ttlMs: 1000 });
    expect(validateTransactionConfirmation(confirmation, { ...base, now: new Date('2026-09-01T12:00:02.000Z') })).toEqual({
      ok: false,
      code: 'expired',
      message: 'That Assistant GM confirmation expired. Review the current state and confirm again.'
    });
  });

  it('scopes confirmation objects to the same user and league', () => {
    const confirmation = prepareTransactionConfirmation(base);
    expect(validateTransactionConfirmation(confirmation, { ...base, userId: 'user-2' })).toMatchObject({ ok: false, code: 'scope_mismatch' });
    expect(validateTransactionConfirmation(confirmation, { ...base, leagueId: 'league-2' })).toMatchObject({ ok: false, code: 'scope_mismatch' });
  });

  it('requires a new confirmation when proposed changes are modified', () => {
    const confirmation = prepareTransactionConfirmation(base);
    expect(validateTransactionConfirmation(confirmation, { ...base, proposedChanges: { ...base.proposedChanges, athleteId: 'athlete-2' } })).toEqual({
      ok: false,
      code: 'proposal_changed',
      message: 'The proposed Assistant GM transaction changed. Confirm the revised action before submitting.'
    });
  });

  it('requires a new confirmation when the verified state hash changes', () => {
    const confirmation = prepareTransactionConfirmation(base);
    expect(validateTransactionConfirmation(confirmation, { ...base, stateVersionHash: 'lineup-state-v2' })).toEqual({
      ok: false,
      code: 'proposal_changed',
      message: 'League state changed after confirmation. Review the action again before submitting.'
    });
  });

  it.each([
    ['player_drafted', 'That player has already been drafted. I will not substitute another player automatically.'],
    ['waiver_unavailable', 'That player is no longer available on waivers. I will not substitute another player automatically.'],
    ['lineup_eligibility_changed', 'Lineup eligibility changed after confirmation. Review the lineup before submitting again.'],
    ['faab_changed', 'Your waiver budget changed after confirmation. Review the claim before submitting again.'],
    ['roster_changed', 'Your roster changed after confirmation. Review the transaction before submitting again.']
  ] as const)('rejects stale %s state with an understandable explanation', (staleReason, message) => {
    const confirmation = prepareTransactionConfirmation(base);
    expect(validateTransactionConfirmation(confirmation, { ...base, stateVersionHash: 'fresh-state', staleReason })).toEqual({
      ok: false,
      code: 'proposal_changed',
      message
    });
  });

  it('executes a confirmed action once and returns the prior result on retry', async () => {
    const confirmation = prepareTransactionConfirmation(base);
    const store = createMemoryAssistantGmIdempotencyStore<{ transactionId: string }>();
    let commitCount = 0;
    const commit = () => {
      commitCount += 1;
      return { transactionId: 'lineup-rpc-result-1' };
    };

    const first = await commitIdempotentlyWithTransactionConfirmation(confirmation, base, store, commit);
    const retry = await commitIdempotentlyWithTransactionConfirmation(confirmation, base, store, commit);

    expect(first).toEqual({ ok: true, actionId: confirmation.actionId, result: { transactionId: 'lineup-rpc-result-1' }, duplicate: false });
    expect(retry).toEqual({ ok: true, actionId: confirmation.actionId, result: { transactionId: 'lineup-rpc-result-1' }, duplicate: true });
    expect(commitCount).toBe(1);
  });

  it('does not record an idempotency result when confirmation validation fails', async () => {
    const confirmation = prepareTransactionConfirmation(base);
    const store = createMemoryAssistantGmIdempotencyStore<{ transactionId: string }>();
    let commitCount = 0;

    const result = await commitIdempotentlyWithTransactionConfirmation(confirmation, { ...base, userId: 'other-user' }, store, () => {
      commitCount += 1;
      return { transactionId: 'should-not-exist' };
    });

    expect(result).toMatchObject({ ok: false, code: 'scope_mismatch' });
    expect(await store.get(confirmation.actionId)).toBeNull();
    expect(commitCount).toBe(0);
  });
});
