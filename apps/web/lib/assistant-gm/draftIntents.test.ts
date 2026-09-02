import { describe, expect, it } from 'vitest';
import { answerDraftIntent } from './draftIntents';
import type { AssistantGmToolResponse } from './tools';

const draftState: AssistantGmToolResponse = {
  ok: true,
  tool: 'getDraftState',
  data: {
    requesterSeasonFranchiseId: 'sf-1',
    draft: { id: 'draft-1', status: 'live', current_pick: 4 },
    picks: [
      { pick_number: 1, round_number: 1, round_pick: 1, season_franchise_id: 'sf-2', picked_at: 'now', name: 'QB First Pick' },
      { pick_number: 2, round_number: 1, round_pick: 2, season_franchise_id: 'sf-1', picked_at: 'now', name: 'RB Ari Runner' },
      { pick_number: 5, round_number: 1, round_pick: 5, season_franchise_id: 'sf-1', picked_at: null }
    ]
  }
};

const availablePlayers: AssistantGmToolResponse = {
  ok: true,
  tool: 'getDraftAvailablePlayers',
  data: {
    rankings: {
      source: 'draft rankings v1',
      athletes: [
        { id: 'wr-1', displayName: 'Wide One', position: 'WR', team: 'DAL', overallRank: 3 },
        { id: 'rb-1', displayName: 'Back One', position: 'RB', team: 'CHI', overallRank: 1 }
      ],
      defenses: [{ id: 'dst-1', displayName: 'Seattle', team: 'SEA', overallRank: 8 }]
    }
  }
};

describe('Assistant GM draft read intents', () => {
  it('reads current draft availability with an as-of pick marker', () => {
    expect(answerDraftIntent('available_players', [draftState, availablePlayers])).toBe('Verified draft availability as of pick 4, source: draft rankings v1. Back One, RB, CHI; Wide One, WR, DAL; SEA D/ST, D/ST, SEA.');
  });

  it('reads best available player by position from verified availability', () => {
    expect(answerDraftIntent('best_position_available', [draftState, availablePlayers], { position: 'RB' })).toBe('Best verified RB available, source: draft rankings v1. Back One, RB, CHI.');
  });

  it('finds the requester next pick from draft state', () => {
    expect(answerDraftIntent('next_pick', [draftState])).toBe('Your next verified pick is pick 5, round 1, pick 5.');
  });

  it('invalidates stale availability answers when current pick changes', () => {
    expect(answerDraftIntent('available_players', [draftState, availablePlayers], { expectedCurrentPick: 3 })).toBe('Draft state changed from pick 3 to pick 4. I need fresh draft data before answering.');
  });

  it('does not silently substitute an unavailable drafted player', () => {
    expect(answerDraftIntent('verify_player_available', [draftState, availablePlayers], { playerName: 'Taken Player' })).toBe('Taken Player is not in the verified available draft pool. I will not substitute another player.');
  });

  it('refuses availability when the available-player tool is missing', () => {
    expect(answerDraftIntent('available_players', [draftState])).toBe('I cannot retrieve verified draft availability right now. Required tool failed or was missing: getDraftAvailablePlayers.');
  });
});
