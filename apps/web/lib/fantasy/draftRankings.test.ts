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

  it('uses a stable fallback order when no score exists', () => {
    const rankings = buildDraftRankings(
      [
        { id: 'wr-b', displayName: 'B Receiver', position: 'WR', team: 'BET' },
        { id: 'rb-a', displayName: 'A Runner', position: 'RB', team: 'ALP' },
        { id: 'wr-a', displayName: 'A Receiver', position: 'WR', team: 'ALP' },
      ],
      [{ id: 'dst-a', displayName: 'A Defense', team: 'ALP' }],
      [],
      [],
    );

    expect(rankings.version).toBe(DRAFT_RANKING_FALLBACK_VERSION);
    expect(rankings.athletes.map(player => [player.id, player.overallRank, player.positionRank])).toEqual([
      ['rb-a', 1, 1],
      ['wr-a', 2, 1],
      ['wr-b', 3, 2],
    ]);
    expect(rankings.defenses).toMatchObject([{ id: 'dst-a', overallRank: 4, positionRank: 1 }]);
  });
});
