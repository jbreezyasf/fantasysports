import { describe, expect, it } from 'vitest';
import { createAssistantGmActionAuditEntry, createMemoryAssistantGmActionAuditStore, recordAssistantGmActionAudit } from './actionAuditLog';

describe('Assistant GM action audit log', () => {
  it('records the fields required for debugging and dispute review', () => {
    const entry = createAssistantGmActionAuditEntry({
      userId: 'user-1',
      leagueId: 'league-1',
      requestedAction: 'Put Walker in my flex.',
      actionType: 'lineup_set',
      preparedAction: { slot: 'FLEX', athleteId: 'athlete-walker' },
      confirmationTimestamp: '2026-09-01T12:01:00.000Z',
      commitResult: 'committed',
      stateVersionHash: 'lineup-state-v1',
      actionId: 'action-1',
      now: new Date('2026-09-01T12:02:00.000Z')
    });

    expect(entry).toMatchObject({
      userId: 'user-1',
      leagueId: 'league-1',
      source: 'Assistant GM',
      requestedAction: 'Put Walker in my flex.',
      actionType: 'lineup_set',
      preparedAction: { slot: 'FLEX', athleteId: 'athlete-walker' },
      confirmationTimestamp: '2026-09-01T12:01:00.000Z',
      commitResult: 'committed',
      failureReason: null,
      stateVersionHash: 'lineup-state-v1',
      actionId: 'action-1',
      createdAt: '2026-09-01T12:02:00.000Z'
    });
  });

  it('records failure reasons without requiring a successful commit', () => {
    const entry = createAssistantGmActionAuditEntry({
      userId: 'user-1',
      leagueId: 'league-1',
      requestedAction: 'Draft Hall.',
      actionType: 'draft_pick',
      commitResult: 'failed',
      failureReason: 'You are not on the clock.',
      now: new Date('2026-09-01T12:00:00.000Z')
    });

    expect(entry).toMatchObject({
      commitResult: 'failed',
      failureReason: 'You are not on the clock.',
      preparedAction: null,
      confirmationTimestamp: null
    });
  });

  it('does not store unnecessary raw voice audio fields', () => {
    const entry = createAssistantGmActionAuditEntry({
      userId: 'user-1',
      leagueId: 'league-1',
      requestedAction: 'Submit claim.',
      actionType: 'waiver_claim',
      preparedAction: {
        waiverHoldId: 'hold-1',
        rawVoiceAudio: 'base64-audio',
        nested: { audioBytes: [1, 2, 3], transcript: 'Submit claim.' }
      },
      commitResult: 'prepared'
    });

    expect(entry.preparedAction).toEqual({
      waiverHoldId: 'hold-1',
      nested: { transcript: 'Submit claim.' }
    });
  });

  it('appends entries through the audit store interface', async () => {
    const store = createMemoryAssistantGmActionAuditStore();
    const entry = await recordAssistantGmActionAudit(store, {
      userId: 'user-1',
      leagueId: 'league-1',
      requestedAction: 'Put Walker in my flex.',
      actionType: 'lineup_set',
      commitResult: 'rejected',
      failureReason: 'Lineup eligibility changed.'
    });

    expect(store.entries).toEqual([entry]);
  });
});
