import { describe, expect, it } from 'vitest';
import { commitWithAssistantGmAutonomyGuard, validateAssistantGmAutonomy, type UserOriginatedAssistantGmRequest } from './autonomyGuard';
import { prepareTransactionConfirmation } from './transactionConfirmations';

const now = new Date('2026-09-01T12:00:00.000Z');
const proposal = { seasonFranchiseId: 'sf-1', slot: 'FLEX', athleteId: 'athlete-walker' };
const confirmation = prepareTransactionConfirmation({
  userId: 'user-1',
  leagueId: 'league-1',
  actionType: 'lineup_set',
  proposedChanges: proposal,
  stateVersionHash: 'state-v1',
  now
});
const context = {
  userId: 'user-1',
  leagueId: 'league-1',
  actionType: 'lineup_set' as const,
  proposedChanges: proposal,
  stateVersionHash: 'state-v1',
  now
};
const userRequest: UserOriginatedAssistantGmRequest = {
  requestId: 'request-1',
  userId: 'user-1',
  leagueId: 'league-1',
  source: 'voice',
  requestedAction: 'Put Walker in my flex.',
  createdAt: '2026-09-01T12:00:00.000Z'
};

describe('Assistant GM explicit autonomy guard', () => {
  it.each([
    ['lineup_set', 'unsolicited lineup change'],
    ['waiver_claim', 'unsolicited waiver claim'],
    ['draft_pick', 'unsolicited draft pick'],
    ['trade_resolve', 'trade acceptance without user request']
  ] as const)('rejects %s without a user-originated request for %s', (actionType, _scenario) => {
    expect(validateAssistantGmAutonomy({
      actionType,
      confirmation,
      confirmationContext: { ...context, actionType }
    })).toEqual({
      ok: false,
      code: 'missing_user_request',
      message: 'Assistant GM cannot commit a transaction without a user-originated request.'
    });
  });

  it('rejects standalone unsolicited drops in beta', () => {
    expect(validateAssistantGmAutonomy({ actionType: 'roster_drop', userRequest })).toEqual({
      ok: false,
      code: 'unsupported_autonomy_action',
      message: 'Assistant GM cannot perform standalone roster drops in beta.'
    });
  });

  it.each(['payment_action', 'account_action'] as const)('rejects %s entirely', (actionType) => {
    expect(validateAssistantGmAutonomy({ actionType, userRequest })).toEqual({
      ok: false,
      code: 'unsupported_autonomy_action',
      message: 'Assistant GM cannot perform payment or account actions.'
    });
  });

  it('rejects a valid confirmation when the user request belongs to another user or league', () => {
    expect(validateAssistantGmAutonomy({
      actionType: 'lineup_set',
      userRequest: { ...userRequest, userId: 'user-2' },
      confirmation,
      confirmationContext: context
    })).toEqual({
      ok: false,
      code: 'request_scope_mismatch',
      message: 'Assistant GM request scope does not match this user and league.'
    });
  });

  it('rejects a user request when confirmation is missing or invalid', () => {
    expect(validateAssistantGmAutonomy({
      actionType: 'lineup_set',
      userRequest,
      confirmation: null,
      confirmationContext: context
    })).toEqual({
      ok: false,
      code: 'invalid_confirmation',
      message: 'Confirm this Assistant GM action before submitting it.'
    });
  });

  it('commits only with a user-originated request and valid confirmation', async () => {
    let commitCount = 0;
    const result = await commitWithAssistantGmAutonomyGuard({
      actionType: 'lineup_set',
      userRequest,
      confirmation,
      confirmationContext: context,
      commit: () => {
        commitCount += 1;
        return { status: 'ok' };
      }
    });

    expect(result).toEqual({ ok: true, result: { status: 'ok' } });
    expect(commitCount).toBe(1);
  });
});
