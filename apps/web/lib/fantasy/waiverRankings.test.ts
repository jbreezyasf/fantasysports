import { describe, expect, it } from 'vitest';
import { rankWaiverPlayers } from './waiverRankings';

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
});
