import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { currentCompetitionWeek, currentLineupWeek, hasExplicitWeek, resolveLineupWeek } from './currentWeek';

type Game = { week: number; starts_at: string; state: string };

// Three-week season: Thursday and Sunday games each week.
function season(states: Record<number, [string, string]>): Game[] {
  return [
    { week: 1, starts_at: '2026-09-11T00:20:00Z', state: states[1][0] },
    { week: 1, starts_at: '2026-09-13T17:00:00Z', state: states[1][1] },
    { week: 2, starts_at: '2026-09-18T00:15:00Z', state: states[2][0] },
    { week: 2, starts_at: '2026-09-20T17:00:00Z', state: states[2][1] },
    { week: 3, starts_at: '2026-09-25T00:15:00Z', state: states[3][0] },
    { week: 3, starts_at: '2026-09-27T17:00:00Z', state: states[3][1] }
  ];
}

const scheduled: [string, string] = ['scheduled', 'scheduled'];
const final: [string, string] = ['final', 'final'];

describe('currentLineupWeek', () => {
  it('gives week 1 before the first kickoff', () => {
    const games = season({ 1: scheduled, 2: scheduled, 3: scheduled });
    expect(currentLineupWeek(games, new Date('2026-09-01T00:00:00Z'))).toBe(1);
  });

  it('gives the in-progress week while its games are still being played', () => {
    const games = season({ 1: final, 2: ['final', 'scheduled'], 3: scheduled });
    expect(currentLineupWeek(games, new Date('2026-09-19T12:00:00Z'))).toBe(2);
    const live = season({ 1: final, 2: ['final', 'in_progress'], 3: scheduled });
    expect(currentLineupWeek(live, new Date('2026-09-20T18:00:00Z'))).toBe(2);
  });

  it('gives the next week once every game of the current week is final', () => {
    const games = season({ 1: final, 2: final, 3: scheduled });
    expect(currentLineupWeek(games, new Date('2026-09-22T12:00:00Z'))).toBe(3);
  });

  it('treats canceled and postponed games as settled when rolling forward', () => {
    const games = season({ 1: ['final', 'postponed'], 2: scheduled, 3: scheduled });
    expect(currentLineupWeek(games, new Date('2026-09-15T12:00:00Z'))).toBe(2);
  });

  it('stays on the last week after the season ends', () => {
    const games = season({ 1: final, 2: final, 3: final });
    expect(currentLineupWeek(games, new Date('2026-12-01T00:00:00Z'))).toBe(3);
  });

  it('does not roll forward when game states are stale or missing', () => {
    const stale = season({ 1: ['final', 'in_progress'], 2: scheduled, 3: scheduled });
    expect(currentLineupWeek(stale, new Date('2026-09-16T12:00:00Z'))).toBe(1);
    const stateless = stale.map(({ week, starts_at }) => ({ week, starts_at }));
    expect(currentLineupWeek(stateless, new Date('2026-09-16T12:00:00Z'))).toBe(1);
  });

  it('returns null without a usable schedule', () => {
    expect(currentLineupWeek([])).toBeNull();
    expect(currentLineupWeek([{ week: 1, starts_at: 'not a date', state: 'final' }])).toBeNull();
  });

  it('keeps the Front Office week unchanged between weeks', () => {
    const games = season({ 1: final, 2: final, 3: scheduled });
    expect(currentCompetitionWeek(games, new Date('2026-09-22T12:00:00Z'))).toBe(2);
  });
});

describe('resolveLineupWeek', () => {
  it('defaults to the current week when no week is supplied', () => {
    expect(resolveLineupWeek(undefined, 7)).toBe(7);
    expect(resolveLineupWeek('', 7)).toBe(7);
  });

  it('keeps an explicit week', () => {
    expect(resolveLineupWeek('3', 7)).toBe(3);
    expect(resolveLineupWeek(['4', '9'], 7)).toBe(4);
  });

  it('clamps out-of-range and fractional values', () => {
    expect(resolveLineupWeek('0', 7)).toBe(1);
    expect(resolveLineupWeek('-5', 7)).toBe(1);
    expect(resolveLineupWeek('99', 7)).toBe(18);
    expect(resolveLineupWeek('2.9', 7)).toBe(2);
    expect(resolveLineupWeek(undefined, 40)).toBe(18);
  });

  it('falls back to the current week for non-numeric values', () => {
    expect(resolveLineupWeek('abc', 7)).toBe(7);
    expect(resolveLineupWeek('NaN', 7)).toBe(7);
    expect(resolveLineupWeek('Infinity', 7)).toBe(7);
  });

  it('uses the first week only when no schedule is known', () => {
    expect(resolveLineupWeek(undefined, null)).toBe(1);
    expect(resolveLineupWeek('abc', undefined)).toBe(1);
  });

  it('reports whether a schedule lookup can be skipped', () => {
    expect(hasExplicitWeek('5')).toBe(true);
    expect(hasExplicitWeek(undefined)).toBe(false);
    expect(hasExplicitWeek('abc')).toBe(false);
  });
});

describe('lineup page default week', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../app/franchises/[franchiseId]/team/page.tsx'), 'utf8');

  it('resolves the week through the shared helper, never a hard-coded week 1', () => {
    expect(page).toContain('resolveLineupWeek(query.week');
    expect(page).toContain('currentLineupWeek(');
    expect(page).not.toContain('query.week ?? 1');
  });
});
