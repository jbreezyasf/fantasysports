import { describe, expect, it } from 'vitest';
import { answerRosterLineupIntent } from './rosterLineupIntents';
import type { AssistantGmToolResponse } from './tools';

const rosterResponse: AssistantGmToolResponse = {
  ok: true,
  tool: 'getRoster',
  data: {
    roster: [
      { id: 'r1', athlete_id: 'a1', athletes: { display_name: 'Ari Runner', position: 'RB', injury_status: null, real_teams: { abbreviation: 'CHI' } } },
      { id: 'r2', athlete_id: 'a2', athletes: { display_name: 'Blake Receiver', position: 'WR', injury_status: 'Questionable', real_teams: { abbreviation: 'DAL' } } },
      { id: 'r3', real_team_id: 't1', real_teams: { abbreviation: 'SEA' } }
    ]
  }
};

const lineupResponse: AssistantGmToolResponse = {
  ok: true,
  tool: 'getLineup',
  data: {
    week: 3,
    lineup: [
      { slot: 'RB', slot_index: 1, athlete_id: 'a1', athletes: { display_name: 'Ari Runner', position: 'RB', real_teams: { abbreviation: 'CHI' } } },
      { slot: 'DST', slot_index: 1, real_team_id: 't1', real_teams: { abbreviation: 'SEA' } }
    ]
  }
};

describe('Assistant GM roster and lineup read intents', () => {
  it('reads the current lineup from structured tool data', () => {
    expect(answerRosterLineupIntent('read_lineup', [rosterResponse, lineupResponse])).toBe('Week 3 lineup: RB1 Ari Runner, RB, CHI; D/ST1 SEA D/ST.');
  });

  it('reads bench players without presenting starters as bench players', () => {
    expect(answerRosterLineupIntent('read_bench', [rosterResponse, lineupResponse])).toBe('Bench: Blake Receiver, WR, DAL.');
  });

  it('reports verified injury states from roster data', () => {
    expect(answerRosterLineupIntent('injured_players', [rosterResponse, lineupResponse])).toBe('Verified injury statuses: Blake Receiver, WR, DAL is Questionable.');
  });

  it('reports empty starter slots from deterministic slot requirements', () => {
    expect(answerRosterLineupIntent('empty_lineup_spots', [rosterResponse, lineupResponse])).toBe('Empty starter spots for week 3: QB1, RB2, WR1, WR2, TE1, FLEX1, K1.');
  });

  it('does not invent game-time state when no verified schedule data exists', () => {
    expect(answerRosterLineupIntent('plays_tonight', [rosterResponse, lineupResponse])).toBe('I cannot retrieve verified game-time state for your lineup right now.');
  });

  it('refuses to answer when required lineup state failed', () => {
    expect(answerRosterLineupIntent('read_lineup', [
      rosterResponse,
      { ok: false, tool: 'getLineup', error: { code: 'data_error', message: 'Lineup read failed' } }
    ])).toBe('I cannot retrieve the required roster state right now. Required tool failed or were missing: getLineup.');
  });
});
