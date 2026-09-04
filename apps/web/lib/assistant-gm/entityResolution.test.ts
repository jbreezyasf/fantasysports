import { describe, expect, it } from 'vitest';
import { resolveEntity, resolvePosition, resolveRosterSlot, resolveWeek } from './entityResolution';

const candidates = [
  { id: 'player-1', type: 'player' as const, label: 'Jordan Mason', aliases: ['J Mason'], leagueId: 'league-1', available: true },
  { id: 'player-2', type: 'player' as const, label: 'Jordan Addison', aliases: ['J Addison'], leagueId: 'league-1', available: false },
  { id: 'player-3', type: 'player' as const, label: 'Jordan Love', leagueId: 'league-2', available: true },
  { id: 'franchise-1', type: 'franchise' as const, label: 'Milwaukee Voltage', aliases: ['Voltage'], leagueId: 'league-1' },
  { id: 'franchise-2', type: 'franchise' as const, label: 'Milwaukee Vultures', aliases: ['Vultures'], leagueId: 'league-1' }
];

describe('Assistant GM entity resolution', () => {
  it('resolves exact player aliases inside the current league', () => {
    expect(resolveEntity({ query: 'J Mason', type: 'player', candidates, leagueId: 'league-1' })).toEqual({
      ok: true,
      status: 'resolved',
      entity: candidates[0]
    });
  });

  it('does not leak or select same-name candidates from another league', () => {
    expect(resolveEntity({ query: 'Jordan Love', type: 'player', candidates, leagueId: 'league-1' })).toMatchObject({
      ok: false,
      status: 'not_found'
    });
  });

  it('returns unavailable instead of describing a rostered player as available', () => {
    expect(resolveEntity({ query: 'Jordan Addison', type: 'player', candidates, leagueId: 'league-1' })).toMatchObject({
      ok: false,
      status: 'unavailable',
      candidates: [candidates[1]]
    });
  });

  it('requires clarification for ambiguous similar franchise names', () => {
    expect(resolveEntity({ query: 'Milwaukee', type: 'franchise', candidates, leagueId: 'league-1' })).toMatchObject({
      ok: false,
      status: 'ambiguous',
      candidates: [candidates[3], candidates[4]]
    });
  });

  it('resolves spoken position and slot variants', () => {
    expect(resolvePosition('defense')).toEqual({ ok: true, position: 'D/ST' });
    expect(resolveRosterSlot('DST')).toEqual({ ok: true, slot: 'D/ST' });
    expect(resolveRosterSlot('bench')).toEqual({ ok: true, slot: 'BENCH' });
  });

  it('resolves explicit and current week references without guessing missing context', () => {
    expect(resolveWeek('week 7')).toEqual({ ok: true, week: 7 });
    expect(resolveWeek('this week', 3)).toEqual({ ok: true, week: 3 });
    expect(resolveWeek('this week')).toEqual({ ok: false, message: 'Current week is not available.' });
  });
});

