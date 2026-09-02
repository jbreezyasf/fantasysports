import { describe, expect, it } from 'vitest';
import { answerWaiverIntent } from './waiverIntents';
import type { AssistantGmToolResponse } from './tools';

const rules: AssistantGmToolResponse = {
  ok: true,
  tool: 'getWaiverRules',
  data: { faabEnabled: false, priorityModel: 'Inverse standings at processing' }
};

const state: AssistantGmToolResponse = {
  ok: true,
  tool: 'getWaiverState',
  data: {
    holds: [{ id: 'hold-1', athletes: { display_name: 'Ari Runner', position: 'RB' }, clears_at: '2026-09-03T12:00:00Z' }],
    requesterClaims: [{ id: 'claim-1', waiver_hold_id: 'hold-1', status: 'pending' }]
  }
};

const available: AssistantGmToolResponse = {
  ok: true,
  tool: 'getAvailablePlayers',
  data: {
    source: 'current player pool',
    players: [
      { display_name: 'Rostered Back', position: 'RB', team: 'LV', availability: 'Rostered by BEX', overallRank: 1 },
      { display_name: 'Open Back', position: 'RB', team: 'KC', availability: 'Available', overallRank: 2 }
    ]
  }
};

describe('Assistant GM waiver read intents', () => {
  it('answers FAAB questions from verified waiver rules', () => {
    expect(answerWaiverIntent('faab_balance', [rules, state])).toBe('This verified league does not use FAAB. Waiver priority model: Inverse standings at processing.');
  });

  it('reads pending waiver claims from waiver state', () => {
    expect(answerWaiverIntent('pending_claims', [rules, state])).toBe('Verified pending waiver claims: RB Ari Runner.');
  });

  it('labels add advice as a recommendation', () => {
    expect(answerWaiverIntent('recommend_add', [available], { position: 'RB' })).toBe('Recommendation, not an official transaction: consider Open Back, RB, KC. Source: current player pool.');
  });

  it('returns best available players without treating rostered players as available', () => {
    expect(answerWaiverIntent('best_available', [available], { position: 'RB' })).toBe('Best verified available RB, source: current player pool. Open Back, RB, KC.');
  });

  it('refuses waiver fact answers when waiver services fail', () => {
    expect(answerWaiverIntent('pending_claims', [
      rules,
      { ok: false, tool: 'getWaiverState', error: { code: 'data_error', message: 'Waiver read failed' } }
    ])).toBe('I cannot retrieve the required waiver balance state right now. Required tool failed or were missing: getWaiverState.');
  });
});
