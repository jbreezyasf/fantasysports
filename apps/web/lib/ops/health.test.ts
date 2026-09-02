import { describe, expect, it } from 'vitest';
import { staleStatus, statusLabel } from './health';

describe('ops data health', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('classifies fresh, stale, critical, and unknown timestamps', () => {
    expect(staleStatus('2026-09-01T11:00:00.000Z', 3, 24, now)).toBe('healthy');
    expect(staleStatus('2026-09-01T04:00:00.000Z', 3, 24, now)).toBe('warning');
    expect(staleStatus('2026-08-30T11:00:00.000Z', 3, 24, now)).toBe('critical');
    expect(staleStatus(null, 3, 24, now)).toBe('unknown');
  });

  it('formats operator-facing labels', () => {
    expect(statusLabel('healthy')).toBe('Current');
    expect(statusLabel('warning')).toBe('Stale');
    expect(statusLabel('critical')).toBe('Critical');
    expect(statusLabel('unknown')).toBe('Unknown');
  });
});
