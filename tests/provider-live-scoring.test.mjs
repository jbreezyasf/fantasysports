import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalLivePlayerStats, canonicalLiveTeamStats, fieldGoalBuckets } from '../scripts/import-balldontlie-nfl-live-stats.mjs';

test('normalizes live player scoring fields', () => {
  const result = canonicalLivePlayerStats({ passing_touchdowns: 2, passing_interceptions: 1, rushing_touchdowns: 1, fumbles_lost: 1, extra_points_made: 3 });
  assert.equal(result.passing_tds, 2);
  assert.equal(result.passing_interceptions, 1);
  assert.equal(result.rushing_tds, 1);
  assert.equal(result.rushing_fumbles_lost, 1);
  assert.equal(result.pat_made, 3);
});

test('buckets made field goals by distance and ignores misses', () => {
  const result = fieldGoalBuckets([
    { scoring_play: true, type_text: 'Field Goal', short_text: 'A 52 yard field goal is GOOD', participants: [{ type: 'kicker', player_id: 7 }] },
    { scoring_play: true, type_text: 'Field Goal', short_text: 'A 31 yard field goal is no good', participants: [{ type: 'kicker', player_id: 7 }] },
  ]);
  assert.deepEqual(result.get('7'), { fg_made_50_59: 1 });
});

test('derives defense points allowed from the opponent score', () => {
  const result = canonicalLiveTeamStats({ team: { id: 1 }, game: { home_team: { id: 1 }, visitor_team_score: 17, home_team_score: 24 }, defensive_sacks: 3 });
  assert.equal(result.points_allowed, 17);
  assert.equal(result.def_sacks, 3);
});
