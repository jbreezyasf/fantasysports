import { describe, expect, it } from 'vitest';
import { createMemoryAssistantGmIdempotencyStore } from './transactionConfirmations';
import { commitVoiceLineupMove, prepareVoiceLineupMove, voiceLineupStateHash } from './lineupTransactions';

const roster = [
  { id: 're-1', athlete_id: 'athlete-walker', athletes: { display_name: 'Kenneth Walker', position: 'RB', real_teams: { abbreviation: 'SEA' } } },
  { id: 're-2', athlete_id: 'athlete-chase', athletes: { display_name: 'JaMarr Chase', position: 'WR', real_teams: { abbreviation: 'CIN' } } },
  { id: 're-3', athlete_id: 'athlete-mahomes', athletes: { display_name: 'Patrick Mahomes', position: 'QB', real_teams: { abbreviation: 'KC' } } }
];

const lineup = [
  { slot: 'FLEX', slot_index: 1, athlete_id: 'athlete-chase', athletes: { display_name: 'JaMarr Chase', position: 'WR', real_teams: { abbreviation: 'CIN' } } }
];

const base = {
  userId: 'user-1',
  leagueId: 'league-1',
  seasonFranchiseId: 'sf-1',
  week: 2,
  roster,
  lineup,
  now: new Date('2026-09-01T12:00:00.000Z')
};

describe('Assistant GM voice lineup transactions', () => {
  it('prepares a confirmed move that names affected players and slots', () => {
    const prepared = prepareVoiceLineupMove({ ...base, playerQuery: 'Walker', targetSlot: 'flex' });

    expect(prepared).toMatchObject({
      ok: true,
      proposal: {
        seasonFranchiseId: 'sf-1',
        week: 2,
        slot: 'FLEX',
        slotIndex: 1,
        athleteId: 'athlete-walker',
        assetLabel: 'Kenneth Walker, RB, SEA',
        targetSlotLabel: 'FLEX',
        replacedAssetLabel: 'JaMarr Chase, WR, CIN'
      },
      spokenConfirmation: 'Kenneth Walker, RB, SEA will move to FLEX for week 2, replacing JaMarr Chase, WR, CIN. Confirm to submit this lineup move.'
    });
  });

  it('explains invalid moves without preparing a transaction', () => {
    expect(prepareVoiceLineupMove({ ...base, playerQuery: 'Mahomes', targetSlot: 'flex' })).toEqual({
      ok: false,
      code: 'invalid_move',
      message: 'Patrick Mahomes, QB, KC is not eligible for FLEX.'
    });
  });

  it('asks for clarification when player resolution is ambiguous', () => {
    expect(prepareVoiceLineupMove({ ...base, roster: [...roster, { id: 're-4', athlete_id: 'athlete-walker-2', athletes: { display_name: 'Walker Little', position: 'TE' } }], playerQuery: 'Walker', targetSlot: 'flex' })).toMatchObject({
      ok: false,
      code: 'ambiguous_player'
    });
  });

  it('commits only after confirmation and calls the canonical lineup RPC once across retries', async () => {
    const prepared = prepareVoiceLineupMove({ ...base, playerQuery: 'Walker', targetSlot: 'flex' });
    if (!prepared.ok) throw new Error('expected prepared move');
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const supabase = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: { lineup_id: 'lineup-1' }, error: null };
      }
    };
    const store = createMemoryAssistantGmIdempotencyStore<{ rpc: 'set_lineup_slot'; data: unknown }>();

    const first = await commitVoiceLineupMove({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: voiceLineupStateHash(base), supabase, idempotencyStore: store, now: base.now });
    const retry = await commitVoiceLineupMove({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: voiceLineupStateHash(base), supabase, idempotencyStore: store, now: base.now });

    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(retry).toMatchObject({ ok: true, duplicate: true });
    expect(calls).toEqual([{
      fn: 'set_lineup_slot',
      args: {
        p_season_franchise_id: 'sf-1',
        p_week: 2,
        p_slot: 'FLEX',
        p_slot_index: 1,
        p_athlete_id: 'athlete-walker',
        p_real_team_id: null
      }
    }]);
  });

  it('rejects stale lineup state before the canonical RPC is called', async () => {
    const prepared = prepareVoiceLineupMove({ ...base, playerQuery: 'Walker', targetSlot: 'flex' });
    if (!prepared.ok) throw new Error('expected prepared move');
    const supabase = { rpc: async () => ({ data: null, error: null }) };
    const store = createMemoryAssistantGmIdempotencyStore<{ rpc: 'set_lineup_slot'; data: unknown }>();

    const result = await commitVoiceLineupMove({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: 'changed-state', supabase, idempotencyStore: store, now: base.now });

    expect(result).toEqual({
      ok: false,
      actionId: prepared.confirmation.actionId,
      code: 'proposal_changed',
      message: 'Lineup eligibility changed after confirmation. Review the lineup before submitting again.'
    });
  });
});
