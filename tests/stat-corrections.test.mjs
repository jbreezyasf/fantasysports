import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionWeeksFor } from '../scripts/import-balldontlie-nfl-weekly-stats.mjs';

test('the correction pass covers the current week and the two before it', () => {
  assert.deepEqual(correctionWeeksFor(4), [2, 3, 4]);
  assert.deepEqual(correctionWeeksFor(9), [7, 8, 9]);
});
test('it never reaches before Week 1', () => {
  assert.deepEqual(correctionWeeksFor(1), [1]);
  assert.deepEqual(correctionWeeksFor(2), [1, 2]);
});
test('the lookback is adjustable', () => {
  assert.deepEqual(correctionWeeksFor(6, 1), [5, 6]);
  assert.deepEqual(correctionWeeksFor(6, 0), [6]);
});
