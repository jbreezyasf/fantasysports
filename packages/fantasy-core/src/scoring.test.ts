import { describe, expect, it } from 'vitest';
import { scoreHalfPprFootball, scoreStandardDst } from './scoring';

describe('Half-PPR football scoring', () => {
  it('scores a mixed offensive stat line deterministically with six-point touchdowns', () => {
    const result = scoreHalfPprFootball({
      passYards: 250,
      passTd: 2,
      interceptions: 1,
      rushYards: 20,
      rushTd: 1,
      receptions: 4,
      receivingYards: 50,
      receivingTd: 1,
      fumblesLost: 1
    });
    expect(result.points).toBe(39);
    expect(result.breakdown.passing_td).toBe(12);
    expect(result.breakdown.rushing_td).toBe(6);
    expect(result.breakdown.receiving_td).toBe(6);
  });
});

describe('standard D/ST scoring', () => {
  it('applies defensive events and points-allowed bracket', () => {
    const result = scoreStandardDst({
      sacks: 3,
      interceptions: 2,
      fumbleRecoveries: 1,
      defensiveTd: 1,
      pointsAllowed: 10
    });
    expect(result.points).toBe(19);
  });
});
