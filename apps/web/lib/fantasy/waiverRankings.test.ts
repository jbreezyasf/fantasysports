import { describe, expect, it } from 'vitest';
import { explainWaiverRanking, rankWaiverPlayers } from './waiverRankings';

const players = [
  { id: 'historical-name-first', displayName: 'Alpha Veteran', injuryStatus: 'ACT' },
  { id: 'provider-top', displayName: 'Zulu Breakout', injuryStatus: 'ACT' },
  { id: 'out-player', displayName: 'Beta Injured', injuryStatus: 'OUT' },
];

describe('rankWaiverPlayers', () => {
  it('uses provider projections and rankings instead of alphabetical order', () => {
    const ranked = rankWaiverPlayers(players, [
      { athleteId: 'historical-name-first', overallRank: 80, projectedPoints: 90 },
      { athleteId: 'provider-top', overallRank: 15, projectedPoints: 180 },
      { athleteId: 'out-player', overallRank: 2, projectedPoints: 220 },
    ]);
    expect(ranked.map(player => player.id)).toEqual(['provider-top', 'historical-name-first', 'out-player']);
  });

  it('falls back deterministically when provider values are missing', () => {
    const ranked = rankWaiverPlayers(players.slice(0, 2), [], new Map([['provider-top', 12]]));
    expect(ranked.map(player => player.id)).toEqual(['provider-top', 'historical-name-first']);
  });

  it('uses recent in-season production ahead of preseason market rank', () => {
    const ranked = rankWaiverPlayers(players.slice(0, 2), [
      { athleteId: 'historical-name-first', overallRank: 80, projectedPoints: 90 },
      { athleteId: 'provider-top', overallRank: 15, projectedPoints: 180 },
    ], new Map([['historical-name-first', 24], ['provider-top', 8]]));
    expect(ranked.map(player => player.id)).toEqual(['historical-name-first', 'provider-top']);
    expect(explainWaiverRanking('historical-name-first', [], new Map([['historical-name-first', 24]])).reason).toContain('recent fantasy points');
  });
});
