import { describe, expect, it } from 'vitest';
import { gameHasLocked, lineupGameByTeam } from './lineupLocks';

const started = {
  home_team_id: 'BUF',
  away_team_id: 'MIA',
  starts_at: '2026-09-18T00:15:00Z',
  state: 'in_progress',
};

describe('lineup game locks', () => {
  it('locks both teams at kickoff and keeps final games locked', () => {
    expect(gameHasLocked(started, Date.parse('2026-09-18T00:15:00Z'))).toBe(true);
    expect(gameHasLocked({ ...started, state: 'final' }, Date.parse('2026-09-19T00:00:00Z'))).toBe(true);
    const map = lineupGameByTeam([started]);
    expect(map.get('BUF')).toBe(started);
    expect(map.get('MIA')).toBe(started);
  });

  it('does not lock before kickoff or when a game is canceled or postponed', () => {
    expect(gameHasLocked(started, Date.parse('2026-09-18T00:14:59Z'))).toBe(false);
    expect(gameHasLocked({ ...started, state: 'canceled' }, Date.parse('2026-09-19T00:00:00Z'))).toBe(false);
    expect(gameHasLocked({ ...started, state: 'postponed' }, Date.parse('2026-09-19T00:00:00Z'))).toBe(false);
  });
});
