import { describe, expect, it } from 'vitest';
import {
  buildAssistantGMDecisionContext,
  buildPositionNeeds,
  findDropCandidates,
  recommendAvailableTargets,
} from './decisionEngine';

const config = {
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
};

describe('Assistant GM decision engine', () => {
  it('detects starter-position shortages without treating FLEX as a dedicated position', () => {
    const needs = buildPositionNeeds([
      { id: 'q1', name: 'QB One', position: 'QB' },
      { id: 'r1', name: 'RB One', position: 'RB' },
      { id: 'w1', name: 'WR One', position: 'WR' },
      { id: 'w2', name: 'WR Two', position: 'WR' },
      { id: 't1', name: 'TE One', position: 'TE' },
      { id: 'k1', name: 'K One', position: 'K' },
      { id: 'd1', name: 'Defense', position: 'D/ST' },
    ], config);

    expect(needs.find(need => need.position === 'RB')).toMatchObject({ current: 1, target: 2, deficit: 1 });
    expect(needs.some(need => need.position === 'FLEX')).toBe(false);
    expect(needs.find(need => need.position === 'D/ST')).toMatchObject({ current: 1, target: 1, deficit: 0 });
  });

  it('prioritizes an available player who fills a starter shortage before a higher-ranked luxury add', () => {
    const roster = [
      { id: 'q1', name: 'QB One', position: 'QB', overallRank: 15 },
      { id: 'r1', name: 'RB One', position: 'RB', overallRank: 20 },
      { id: 'w1', name: 'WR One', position: 'WR', overallRank: 30 },
      { id: 'w2', name: 'WR Two', position: 'WR', overallRank: 40 },
      { id: 't1', name: 'TE One', position: 'TE', overallRank: 60 },
      { id: 'k1', name: 'K One', position: 'K', overallRank: 150 },
      { id: 'd1', name: 'Defense', position: 'D/ST', overallRank: 140 },
    ];
    const targets = recommendAvailableTargets(roster, [
      { id: 'w3', name: 'WR Star', position: 'WR', overallRank: 1, assetType: 'athlete' },
      { id: 'r2', name: 'RB Need', position: 'RB', overallRank: 35, assetType: 'athlete' },
    ], config);

    expect(targets[0]).toMatchObject({ id: 'r2', needDeficit: 1 });
    expect(targets[1]).toMatchObject({ id: 'w3', needDeficit: 0 });
  });

  it('prefers surplus lower-ranked roster assets as drop candidates', () => {
    const roster = [
      { id: 'q1', name: 'QB One', position: 'QB', overallRank: 20 },
      { id: 'r1', name: 'RB One', position: 'RB', overallRank: 25 },
      { id: 'r2', name: 'RB Two', position: 'RB', overallRank: 40 },
      { id: 'r3', name: 'RB Three', position: 'RB', overallRank: 180 },
      { id: 'w1', name: 'WR One', position: 'WR', overallRank: 30 },
      { id: 'w2', name: 'WR Two', position: 'WR', overallRank: 50 },
      { id: 't1', name: 'TE One', position: 'TE', overallRank: 70 },
      { id: 'k1', name: 'K One', position: 'K', overallRank: 190 },
      { id: 'd1', name: 'Defense', position: 'D/ST', overallRank: 170 },
    ];

    expect(findDropCandidates(roster, config, 1)[0].id).toBe('r3');
  });

  it('keeps lineup holes deterministic in the full context', () => {
    const context = buildAssistantGMDecisionContext({
      roster: [],
      available: [],
      rosterConfig: config,
      lineupSlots: [
        { slot: 'QB', slotIndex: 1, filled: true },
        { slot: 'WR', slotIndex: 1, filled: false },
      ],
    });

    expect(context.emptyLineupSlots).toEqual([{ slot: 'WR', slotIndex: 1, filled: false }]);
  });
});
