import { describe, expect, it } from 'vitest';
import { DRAFT_RANKING_FALLBACK_VERSION, buildDraftRankings } from './draftRankings';

describe('buildDraftRankings', () => {
  it('creates deterministic overall and positional ranks from Big Exec scores', () => {
    const rankings = buildDraftRankings(
      [
        { id: 'wr-low', displayName: 'Beta Receiver', position: 'WR', team: 'BET' },
        { id: 'rb-high', displayName: 'Alpha Runner', position: 'RB', team: 'ALP' },
        { id: 'qb-none', displayName: 'No Score QB', position: 'QB', team: 'NOS' },
      ],
      [{ id: 'dst-mid', displayName: 'Midway Defense', team: 'MID' }],
      [
        { assetId: 'wr-low', points: '8.5', calculated_at: '2026-08-20T10:00:00Z' },
        { assetId: 'rb-high', points: 12, calculated_at: '2026-08-20T11:00:00Z' },
        { assetId: 'rb-high', points: 3, calculated_at: '2026-08-20T12:00:00Z' },
      ],
      [{ assetId: 'dst-mid', points: 10, calculated_at: '2026-08-20T09:00:00Z' }],
    );

    expect(rankings.version).toBe('2026-08-20T12:00:00Z');
    expect(rankings.athletes.map(player => [player.id, player.overallRank, player.positionRank])).toEqual([
      ['rb-high', 1, 1],
      ['wr-low', 3, 1],
      ['qb-none', 4, 1],
    ]);
    expect(rankings.defenses).toMatchObject([{ id: 'dst-mid', overallRank: 2, positionRank: 1 }]);
    expect(rankings.athletes[0].rankingScore).toBe(15);
  });

  it('ranks from average season points across the most recent five historical seasons', () => {
    const rankings = buildDraftRankings(
      [
        { id: 'spike-wr', displayName: 'One Year Spike', position: 'WR', team: 'BET' },
        { id: 'steady-rb', displayName: 'Steady Producer', position: 'RB', team: 'ALP' },
        { id: 'no-history-qb', displayName: 'No History QB', position: 'QB', team: 'NOS' },
      ],
      [{ id: 'steady-dst', displayName: 'Steady Defense', team: 'ALP' }],
      [
        { assetId: 'spike-wr', points: 200, calculated_at: '2026-08-20T12:00:00Z', seasonYear: 2025 },
        { assetId: 'steady-rb', points: 150, calculated_at: '2026-08-20T12:00:00Z', seasonYear: 2025 },
        { assetId: 'steady-rb', points: 150, calculated_at: '2025-08-20T12:00:00Z', seasonYear: 2024 },
        { assetId: 'steady-rb', points: 150, calculated_at: '2024-08-20T12:00:00Z', seasonYear: 2023 },
        { assetId: 'steady-rb', points: 150, calculated_at: '2023-08-20T12:00:00Z', seasonYear: 2022 },
        { assetId: 'steady-rb', points: 150, calculated_at: '2022-08-20T12:00:00Z', seasonYear: 2021 },
        { assetId: 'steady-rb', points: 500, calculated_at: '2021-08-20T12:00:00Z', seasonYear: 2020 },
      ],
      [
        { assetId: 'steady-dst', points: 120, calculated_at: '2026-08-20T12:00:00Z', seasonYear: 2025 },
        { assetId: 'steady-dst', points: 120, calculated_at: '2025-08-20T12:00:00Z', seasonYear: 2024 },
      ],
    );

    expect(rankings.athletes.map(player => [player.id, player.overallRank, player.positionRank, player.rankingScore])).toEqual([
      ['spike-wr', 1, 1, 200],
      ['steady-rb', 2, 1, 150],
      ['no-history-qb', 4, 1, null],
    ]);
    expect(rankings.defenses).toMatchObject([{ id: 'steady-dst', overallRank: 3, positionRank: 1, rankingScore: 120 }]);
  });

  it('does not invent scoring when no historical ranking data exists', () => {
    const rankings = buildDraftRankings(
      [
        { id: 'wr-a', displayName: 'A Receiver', position: 'WR', team: 'ALP' },
        { id: 'rb-a', displayName: 'A Runner', position: 'RB', team: 'ALP' },
      ],
      [],
      [],
      [],
    );

    expect(rankings.version).toBe(DRAFT_RANKING_FALLBACK_VERSION);
    expect(rankings.athletes.map(player => [player.id, player.overallRank, player.positionRank, player.rankingScore])).toEqual([
      ['rb-a', 1, 1, null],
      ['wr-a', 2, 1, null],
    ]);
  });
});
