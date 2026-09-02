import { describe, expect, it } from 'vitest';
import { standingRowLabel } from './standingsAccessibility';

describe('standings accessibility copy', () => {
  it('labels rank, team, record, and tiebreakers', () => {
    expect(standingRowLabel({
      rank: 2,
      team: 'Example Franchise',
      record: '7-3-1',
      pointsFor: 1234.56,
      pointsAgainst: 1120,
      streak: 'W2'
    })).toBe('Rank 2. Team Example Franchise. Record 7-3-1. Points for 1234.56. Points against 1120.00. Streak W2.');
  });
});
