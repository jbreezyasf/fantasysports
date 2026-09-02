import { describe, expect, it } from 'vitest';
import { createMemoryAssistantGmIdempotencyStore } from './transactionConfirmations';
import { commitVoiceDraftPick, prepareVoiceDraftPick, voiceDraftStateHash, type VoiceDraftState } from './draftTransactions';

const draft: VoiceDraftState = {
  id: 'draft-1',
  status: 'live',
  current_pick: 4,
  picks: [
    { pick_number: 4, season_franchise_id: 'sf-1' },
    { pick_number: 5, season_franchise_id: 'sf-2' }
  ]
};

const availablePlayers = [
  { assetType: 'athlete' as const, assetId: 'athlete-hall', displayName: 'Breece Hall', position: 'RB', team: 'NYJ', rank: 1 },
  { assetType: 'athlete' as const, assetId: 'athlete-lamb', displayName: 'CeeDee Lamb', position: 'WR', team: 'DAL', rank: 2 },
  { assetType: 'team' as const, assetId: 'team-sea', displayName: 'Seattle Seahawks', team: 'SEA', rank: 3 }
];

const base = {
  userId: 'user-1',
  leagueId: 'league-1',
  requesterSeasonFranchiseId: 'sf-1',
  draft,
  availablePlayers,
  now: new Date('2026-09-01T12:00:00.000Z')
};

describe('Assistant GM voice draft transactions', () => {
  it('prepares a pick only when the user is on clock and the player is available', () => {
    const prepared = prepareVoiceDraftPick({ ...base, playerQuery: 'Hall' });

    expect(prepared).toMatchObject({
      ok: true,
      proposal: {
        draftId: 'draft-1',
        pickNumber: 4,
        seasonFranchiseId: 'sf-1',
        athleteId: 'athlete-hall',
        realTeamId: null,
        assetLabel: 'Breece Hall, RB, NYJ'
      },
      spokenConfirmation: 'Draft Breece Hall, RB, NYJ with pick 4. Confirm to submit this pick.'
    });
  });

  it('cannot draft when the user is not on the clock', () => {
    expect(prepareVoiceDraftPick({ ...base, requesterSeasonFranchiseId: 'sf-2', playerQuery: 'Hall' })).toEqual({
      ok: false,
      code: 'not_on_clock',
      message: 'You are not on the clock, so I cannot prepare a draft pick.'
    });
  });

  it('cannot draft an unavailable player and does not substitute another player', () => {
    expect(prepareVoiceDraftPick({ ...base, playerQuery: 'Taken Player' })).toEqual({
      ok: false,
      code: 'unavailable_player',
      message: 'Taken Player is not in the verified available draft pool. I will not substitute another player.'
    });
  });

  it('requires exact player resolution before preparing a pick', () => {
    expect(prepareVoiceDraftPick({ ...base, availablePlayers: [...availablePlayers, { assetType: 'athlete' as const, assetId: 'athlete-hall-2', displayName: 'Hall Example', position: 'TE' }], playerQuery: 'Hall' })).toMatchObject({
      ok: false,
      code: 'ambiguous_player'
    });
  });

  it('commits only after confirmation and calls the canonical draft RPC once across retries', async () => {
    const prepared = prepareVoiceDraftPick({ ...base, playerQuery: 'Hall' });
    if (!prepared.ok) throw new Error('expected prepared pick');
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const supabase = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: { pick_number: 4 }, error: null };
      }
    };
    const store = createMemoryAssistantGmIdempotencyStore<{ rpc: 'make_draft_pick'; data: unknown }>();

    const first = await commitVoiceDraftPick({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: voiceDraftStateHash(base), supabase, idempotencyStore: store, now: base.now });
    const retry = await commitVoiceDraftPick({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: voiceDraftStateHash(base), supabase, idempotencyStore: store, now: base.now });

    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(retry).toMatchObject({ ok: true, duplicate: true });
    expect(calls).toEqual([{
      fn: 'make_draft_pick',
      args: {
        p_draft_id: 'draft-1',
        p_athlete_id: 'athlete-hall',
        p_real_team_id: null,
        p_auto: false
      }
    }]);
  });

  it('rejects stale draft state before the canonical RPC is called', async () => {
    const prepared = prepareVoiceDraftPick({ ...base, playerQuery: 'Hall' });
    if (!prepared.ok) throw new Error('expected prepared pick');
    let callCount = 0;
    const supabase = { rpc: async () => { callCount += 1; return { data: null, error: null }; } };
    const store = createMemoryAssistantGmIdempotencyStore<{ rpc: 'make_draft_pick'; data: unknown }>();

    const result = await commitVoiceDraftPick({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: 'changed-state', supabase, idempotencyStore: store, now: base.now });

    expect(result).toEqual({
      ok: false,
      actionId: prepared.confirmation.actionId,
      code: 'proposal_changed',
      message: 'That player has already been drafted. I will not substitute another player automatically.'
    });
    expect(callCount).toBe(0);
  });
});
