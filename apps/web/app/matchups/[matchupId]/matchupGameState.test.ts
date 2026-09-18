import { describe, expect, it } from 'vitest';
import { gameIsLive } from './matchupGameState';

describe('gameIsLive', () => {
  it('treats a started game as live when the provider status lags', () => {
    expect(gameIsLive({ starts_at: '2026-09-18T00:15:00Z', state: 'scheduled' }, Date.parse('2026-09-18T01:00:00Z'))).toBe(true);
  });

  it('does not treat terminal games as live', () => {
    expect(gameIsLive({ starts_at: '2026-09-18T00:15:00Z', state: 'final' }, Date.parse('2026-09-18T04:00:00Z'))).toBe(false);
  });
});

