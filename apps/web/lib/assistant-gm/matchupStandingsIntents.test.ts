import { describe, expect, it } from 'vitest';
import { answerMatchupStandingsIntent } from './matchupStandingsIntents';
import type { AssistantGmToolResponse } from './tools';

const matchupResponse: AssistantGmToolResponse = {
  ok: true,
  tool: 'getMatchup',
  data: {
    requesterSeasonFranchiseId: 'sf-home',
    homeName: 'Boardroom Bulls',
    awayName: 'Ledger Kings',
    matchup: {
      home_season_franchise_id: 'sf-home',
      away_season_franchise_id: 'sf-away',
      home_points: 101.25,
      away_points: 99.5,
      is_final: false
    }
  }
};

const standingsResponse: AssistantGmToolResponse = {
  ok: true,
  tool: 'getStandings',
  data: {
    requesterSeasonFranchiseId: 'sf-home',
    standings: [
      { rank: 1, season_franchise_id: 'sf-away', wins: 3, losses: 0, points_for: 340.25, franchise: { name: 'Ledger Kings' } },
      { rank: 2, season_franchise_id: 'sf-home', wins: 2, losses: 1, points_for: 315, franchise: { name: 'Boardroom Bulls' } }
    ]
  }
};

describe('Assistant GM matchup and standings read intents', () => {
  it('reads the factual current score', () => {
    expect(answerMatchupStandingsIntent('score', [matchupResponse])).toBe('Current score: Boardroom Bulls 101.25, Ledger Kings 99.50.');
  });

  it('answers whether the requester is winning from verified matchup identity', () => {
    expect(answerMatchupStandingsIntent('am_i_winning', [matchupResponse])).toBe('You are winning against Ledger Kings, 101.25 to 99.50.');
  });

  it('distinguishes projections from factual current score', () => {
    expect(answerMatchupStandingsIntent('projection', [{
      ...matchupResponse,
      data: { ...(matchupResponse.ok ? matchupResponse.data as object : {}), projection: { requester: 117.2, opponent: 112.8 } }
    }])).toBe('Projection, not current score: you 117.20, opponent 112.80. Current score: 101.25 to 99.50.');
  });

  it('does not invent projections when projection data is absent', () => {
    expect(answerMatchupStandingsIntent('projection', [matchupResponse])).toBe('The verified current score is available, but I cannot retrieve a verified projection right now.');
  });

  it('does not invent remaining-player status when no verified game status exists', () => {
    expect(answerMatchupStandingsIntent('left_to_play', [matchupResponse])).toBe('I cannot retrieve verified remaining-player game status right now.');
  });

  it('reads standings and first place from structured standings rows', () => {
    expect(answerMatchupStandingsIntent('my_standing', [standingsResponse])).toBe('You are in 2nd place at 2-1 with 315.00 points for.');
    expect(answerMatchupStandingsIntent('first_place', [standingsResponse])).toBe('Ledger Kings is in first at 3-0 with 340.25 points for.');
  });

  it('refuses score answers when matchup state failed', () => {
    expect(answerMatchupStandingsIntent('score', [
      { ok: false, tool: 'getMatchup', error: { code: 'data_error', message: 'Score read failed' } }
    ])).toBe('I cannot retrieve the required score state right now. Required tool failed or were missing: getMatchup.');
  });
});
