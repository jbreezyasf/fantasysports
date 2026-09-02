import { describe, expect, it } from 'vitest';
import { describeLineupSlot, describeRosterAsset, lineupMoveButtonLabel, lineupMoveConfirmation } from './lineupAccessibility';

describe('lineup accessibility copy', () => {
  it('describes starter roster assets with slot, team, status, and projected-point state', () => {
    expect(describeRosterAsset({
      name: 'Jordan Example',
      position: 'WR',
      team: 'KC',
      starterState: 'starter',
      slotLabel: 'WR1'
    })).toBe('Starter in WR1: Jordan Example. Position WR. NFL team KC. Game status not available. Injury status not available. Projected points not displayed');
  });

  it('describes bench assets distinctly from starters', () => {
    expect(describeRosterAsset({
      name: 'Bench Example',
      position: 'RB',
      team: 'DAL',
      starterState: 'bench',
      gameStatus: 'Unlocked',
      injuryStatus: 'Healthy',
      projectedPoints: 12.4
    })).toBe('Bench player: Bench Example. Position RB. NFL team DAL. Game status Unlocked. Injury status Healthy. Projected points 12.4');
  });

  it('identifies filled and empty slots', () => {
    expect(describeLineupSlot('QB', 'Quarterback Example')).toBe('Starter slot QB. Current player: Quarterback Example. Valid move actions follow.');
    expect(describeLineupSlot('FLEX')).toBe('Starter slot FLEX. Empty slot. Valid move actions follow if eligible players are available.');
  });

  it('names move controls and confirmations', () => {
    expect(lineupMoveButtonLabel('Jordan Example • WR • KC', 'WR1', 3)).toBe('Move Jordan Example • WR • KC to WR1 for week 3');
    expect(lineupMoveConfirmation('Jordan Example • WR • KC', 'WR1', 3)).toBe('Jordan Example • WR • KC moved to WR1 for week 3.');
  });
});
