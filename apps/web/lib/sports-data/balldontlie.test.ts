import { describe, expect, it } from 'vitest';
import {
  balldontlieDefenseFantasyPoints,
  balldontliePlayerFantasyPoints,
  balldontliePlayerName,
  normalizeBalldontlieGame,
  normalizeNflPosition,
  normalizeNflTeamAlias,
  readStat,
} from './balldontlieScoring';

describe('balldontlie NFL normalization', () => {
  it('normalizes provider positions into Big Exec draft positions', () => {
    expect(normalizeNflPosition('QB')).toBe('QB');
    expect(normalizeNflPosition('dst')).toBe('D/ST');
    expect(normalizeNflPosition('DEF')).toBe('D/ST');
    expect(normalizeNflPosition('PK')).toBe('K');
  });

  it('normalizes provider team aliases into Big Exec team aliases', () => {
    expect(normalizeNflTeamAlias('JAC')).toBe('JAX');
    expect(normalizeNflTeamAlias('WSH')).toBe('WAS');
    expect(normalizeNflTeamAlias('LAR')).toBe('LA');
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

  it('normalizes BALDONTLIE NFL games for canonical storage', () => {
    const normalized = normalizeBalldontlieGame({
      id: 101,
      season: 2026,
      week: 1,
      date: '2026-09-09T00:20:00.000Z',
      status: '9/9 - 8:20 PM EDT',
      status_state: 'scheduled',
      home_team: { id: 26, abbreviation: 'SEA' },
      visitor_team: { id: 19, abbreviation: 'NE' },
      home_team_score: null,
      visitor_team_score: null,
      updated_at: '2026-09-08T12:00:00.000Z',
    });

    expect(normalized).toMatchObject({
      providerGameId: '101',
      season: 2026,
      week: 1,
      homeTeamProviderId: '26',
      awayTeamProviderId: '19',
      scheduledKickoffAt: '2026-09-09T00:20:00.000Z',
      state: 'scheduled',
      homeScore: null,
      awayScore: null,
    });
  });
});
