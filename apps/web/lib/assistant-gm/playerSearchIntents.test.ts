import { describe, expect, it } from 'vitest';
import { answerPlayerSearchIntent } from './playerSearchIntents';
import type { AssistantGmToolResponse } from './tools';

describe('Assistant GM player search and comparison intents', () => {
  it('asks for clarification when a player name is ambiguous', () => {
    const search: AssistantGmToolResponse = {
      ok: true,
      tool: 'searchPlayers',
      data: {
        query: 'jones',
        players: [
          { display_name: 'Jordan Jones', position: 'WR', team: 'DAL', availability: 'Available' },
          { display_name: 'Jayden Jones', position: 'RB', team: 'NYG', availability: 'Rostered by BEX' }
        ]
      }
    };

    expect(answerPlayerSearchIntent('player_details', [search])).toBe('Which player did you mean? Jordan Jones, WR, DAL; Jayden Jones, RB, NYG.');
  });

  it('does not present rostered players as available', () => {
    const search: AssistantGmToolResponse = {
      ok: true,
      tool: 'searchPlayers',
      data: {
        position: 'WR',
        players: [
          { display_name: 'Rostered Receiver', position: 'WR', team: 'LV', availability: 'Rostered by MGR' },
          { display_name: 'Open Receiver', position: 'WR', team: 'KC', availability: 'Available' }
        ]
      }
    };

    expect(answerPlayerSearchIntent('available_by_position', [search])).toBe('Verified available WR, source: current Big Exec player pool and roster ownership. Open Receiver, WR, KC.');
  });

  it('identifies the source for best-available recommendations', () => {
    const available: AssistantGmToolResponse = {
      ok: true,
      tool: 'getAvailablePlayers',
      data: {
        source: 'draft rankings v1',
        players: [
          { display_name: 'Second Back', position: 'RB', team: 'MIN', availability: 'Available', overallRank: 2 },
          { display_name: 'First Back', position: 'RB', team: 'DET', availability: 'Available', overallRank: 1 }
        ]
      }
    };

    expect(answerPlayerSearchIntent('best_available', [available])).toBe('Best verified available players, source: draft rankings v1. First Back, RB, DET; Second Back, RB, MIN.');
  });

  it('compares only verified player records', () => {
    const comparison: AssistantGmToolResponse = {
      ok: true,
      tool: 'comparePlayers',
      data: {
        players: [
          { display_name: 'Ari Runner', position: 'RB', team: 'CHI', availability: 'Available', injury_status: null },
          { id: 'missing-player', error: 'Player not found' }
        ]
      }
    };

    expect(answerPlayerSearchIntent('compare_players', [comparison])).toBe('I cannot compare all requested players because missing-player could not be verified.');
  });

  it('returns explicit unavailable state when the required search tool failed', () => {
    expect(answerPlayerSearchIntent('best_available', [
      { ok: false, tool: 'getAvailablePlayers', error: { code: 'data_error', message: 'Pool read failed' } }
    ])).toBe('I cannot retrieve verified player state right now. Required tool failed or was missing: getAvailablePlayers.');
  });
});
