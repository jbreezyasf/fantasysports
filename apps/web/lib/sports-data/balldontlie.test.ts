import { describe, expect, it } from 'vitest';
import {
  balldontlieDefenseFantasyPoints,
  balldontliePlayerFantasyPoints,
  balldontliePlayerName,
  normalizeNflPosition,
  readStat,
} from './balldontlieScoring';

describe('balldontlie NFL normalization', () => {
  it('normalizes provider positions into Big Exec draft positions', () => {
    expect(normalizeNflPosition('QB')).toBe('QB');
    expect(normalizeNflPosition('dst')).toBe('D/ST');
    expect(normalizeNflPosition('DEF')).toBe('D/ST');
  });

  it('builds a stable player display name from first and last name', () => {
    expect(balldontliePlayerName({ id: 38, first_name: 'Josh', last_name: 'Allen' })).toBe('Josh Allen');
  });

  it('reads common aliases from season stat rows', () => {
    expect(readStat({ passing_tds: '4' }, 'passingTouchdowns')).toBe(4);
    expect(readStat({ rec_yards: 88 }, 'receivingYards')).toBe(88);
  });

  it('scores offensive players with Big Exec half-PPR and six-point passing TD rules', () => {
    expect(balldontliePlayerFantasyPoints({
      passing_yards: 250,
      passing_touchdowns: 2,
      interceptions: 1,
      rushing_yards: 40,
      rushing_touchdowns: 1,
      receptions: 3,
      receiving_yards: 20,
      fumbles_lost: 1,
    })).toBe(31.5);
  });

  it('scores team defenses with sacks, takeaways, touchdowns, and points allowed', () => {
    expect(balldontlieDefenseFantasyPoints({
      sacks: 4,
      interceptions: 2,
      fumbles_recovered: 1,
      defensive_touchdowns: 1,
      points_allowed: 13,
    })).toBe(20);
  });
});
