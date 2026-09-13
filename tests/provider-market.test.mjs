import test from 'node:test';
import assert from 'node:assert/strict';
import { projectionEntry, projectedPoints, rankingEntry } from '../scripts/import-balldontlie-nfl-market-values.mjs';

test('selects half-PPR values from provider arrays', () => {
  assert.deepEqual(rankingEntry({ rankings: [
    { type: 'standard', overall_rank: 40 },
    { type: 'half_ppr', overall_rank: 12, position_rank: 4 },
  ] }, 'half_ppr'), { type: 'half_ppr', overall_rank: 12, position_rank: 4 });
  assert.deepEqual(projectionEntry({ projections: [
    { scoring_format: { key: 'ppr' }, total_points: 211 },
    { scoring_format: { key: 'half_ppr' }, total_points: 198.5 },
  ] }, 'half_ppr'), { scoring_format: { key: 'half_ppr' }, total_points: 198.5 });
  assert.equal(projectedPoints({ projections: [{ scoring_format: { key: 'half_ppr' }, total_points: 198.5 }] }), 198.5);
});
