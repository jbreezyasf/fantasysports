import { describe, expect, it } from 'vitest';
import { createMemoryAssistantGmIdempotencyStore } from './transactionConfirmations';
import { commitVoiceWaiverClaim, prepareVoiceWaiverClaim, voiceWaiverStateHash } from './waiverTransactions';

const holds = [
  { id: 'hold-1', status: 'open', clears_at: '2026-09-02T12:00:00.000Z', athlete_id: 'athlete-hall', athletes: { display_name: 'Breece Hall', position: 'RB', real_teams: { abbreviation: 'NYJ' } } },
  { id: 'hold-2', status: 'claimed', athlete_id: 'athlete-lamb', athletes: { display_name: 'CeeDee Lamb', position: 'WR', real_teams: { abbreviation: 'DAL' } } }
];

const roster = [
  { id: 're-1', athlete_id: 'athlete-drop', athletes: { display_name: 'Bench Back', position: 'RB', real_teams: { abbreviation: 'CHI' } } },
  { id: 're-2', athlete_id: 'athlete-keep', athletes: { display_name: 'Starter Wideout', position: 'WR', real_teams: { abbreviation: 'SEA' } } }
];

const base = {
  userId: 'user-1',
  leagueId: 'league-1',
  seasonFranchiseId: 'sf-1',
  addQuery: 'Hall',
  dropQuery: 'Bench Back',
  rosterLimit: 2,
  holds,
  roster,
  rules: { faabEnabled: false, priorityModel: 'Inverse standings at processing' },
  now: new Date('2026-09-01T12:00:00.000Z')
};

describe('Assistant GM voice waiver transactions', () => {
  it('prepares a complete claim review with add, drop, and rule context', () => {
    const prepared = prepareVoiceWaiverClaim(base);

    expect(prepared).toMatchObject({
      ok: true,
      proposal: {
        seasonFranchiseId: 'sf-1',
        waiverHoldId: 'hold-1',
        addAssetLabel: 'Breece Hall, RB, NYJ',
        dropRosterEntryId: 're-1',
        dropAssetLabel: 'Bench Back, RB, CHI',
        faabBid: null,
        ruleContext: 'Inverse standings at processing'
      },
      spokenConfirmation: 'Submit waiver claim for Breece Hall, RB, NYJ and drop Bench Back, RB, CHI. Inverse standings at processing. Confirm to submit this claim.'
    });
  });

  it('requires a drop when the roster is full', () => {
    expect(prepareVoiceWaiverClaim({ ...base, dropQuery: undefined })).toEqual({
      ok: false,
      code: 'drop_required',
      message: 'Your roster is full. Choose a verified roster player to drop before I prepare the waiver claim.'
    });
  });

  it('rejects unavailable waiver players without substituting another player', () => {
    expect(prepareVoiceWaiverClaim({ ...base, addQuery: 'Lamb' })).toEqual({
      ok: false,
      code: 'unavailable_player',
      message: 'Lamb is not on the verified waiver wire. I will not substitute another player.'
    });
  });

  it('rejects FAAB claims that exceed verified budget', () => {
    expect(prepareVoiceWaiverClaim({ ...base, rules: { faabEnabled: true, faabBalance: 9, priorityModel: 'FAAB' }, faabBid: 10 })).toEqual({
      ok: false,
      code: 'invalid_faab',
      message: 'That FAAB bid exceeds your verified budget of 9.'
    });
  });

  it('commits only after confirmation and calls the canonical waiver RPC once across retries', async () => {
    const prepared = prepareVoiceWaiverClaim(base);
    if (!prepared.ok) throw new Error('expected prepared claim');
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const supabase = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: 'claim-1', error: null };
      }
    };
    const store = createMemoryAssistantGmIdempotencyStore<{ rpc: 'submit_waiver_claim'; data: unknown }>();

    const first = await commitVoiceWaiverClaim({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: voiceWaiverStateHash(base), supabase, idempotencyStore: store, now: base.now });
    const retry = await commitVoiceWaiverClaim({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: voiceWaiverStateHash(base), supabase, idempotencyStore: store, now: base.now });

    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(retry).toMatchObject({ ok: true, duplicate: true });
    expect(calls).toEqual([{
      fn: 'submit_waiver_claim',
      args: {
        p_waiver_hold_id: 'hold-1',
        p_season_franchise_id: 'sf-1',
        p_drop_roster_entry_id: 're-1'
      }
    }]);
  });

  it('rejects stale waiver state before the canonical RPC is called', async () => {
    const prepared = prepareVoiceWaiverClaim(base);
    if (!prepared.ok) throw new Error('expected prepared claim');
    let callCount = 0;
    const supabase = { rpc: async () => { callCount += 1; return { data: null, error: null }; } };
    const store = createMemoryAssistantGmIdempotencyStore<{ rpc: 'submit_waiver_claim'; data: unknown }>();

    const result = await commitVoiceWaiverClaim({ confirmation: prepared.confirmation, userId: 'user-1', leagueId: 'league-1', currentStateVersionHash: 'changed-state', supabase, idempotencyStore: store, now: base.now });

    expect(result).toEqual({
      ok: false,
      actionId: prepared.confirmation.actionId,
      code: 'proposal_changed',
      message: 'That player is no longer available on waivers. I will not substitute another player automatically.'
    });
    expect(callCount).toBe(0);
  });
});
