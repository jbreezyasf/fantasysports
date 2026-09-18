import { describe, expect, it } from 'vitest';
// @ts-expect-error Operational stress-season module is native ESM.
import { reactionBody, resolveReactionWindow, selectReactors } from '../../../../scripts/stress-season/live-reactions.mjs';

describe('QA live-game reactions', () => {
  it('recognizes a provider-lagged started game as live', () => {
    expect(resolveReactionWindow([{ week: 2, starts_at: '2026-09-18T00:15:00Z', state: 'scheduled' }], new Date('2026-09-18T01:00:00Z'))).toEqual({ phase: 'live', week: 2 });
  });

  it('allows a bounded postgame checkpoint after a final', () => {
    expect(resolveReactionWindow([{ week: 2, starts_at: '2026-09-18T00:15:00Z', state: 'final' }], new Date('2026-09-18T04:30:00Z'))).toEqual({ phase: 'checkpoint', week: 2 });
  });

  it('selects no more than three distinct voices per moment', () => {
    const personas = Array.from({ length: 8 }, (_, index) => ({ label: `Manager0${index + 1}` }));
    const selected = selectReactors(personas, 2, 'live');
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((item: { label: string }) => item.label)).size).toBe(3);
  });

  it('grounds persona copy in the observed fantasy threshold', () => {
    const body = reactionBody({ persona: { label: 'Manager06' }, phase: 'live', week: 2, playerName: 'Josh Allen', pointsThreshold: 25, leaderName: 'High Volts' });
    expect(body).toContain('Josh Allen has crossed 25 fantasy points');
    expect(body).toContain('Chaos Department');
  });
});

