import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalLivePlayerStats, canonicalLiveTeamStats, canonicalWeeklyPlayerStats, fieldGoalBuckets, liveIdentityKey, liveNamePositionKey } from '../scripts/import-balldontlie-nfl-live-stats.mjs';
import { canonicalSportradarPlayerStats, incompleteProviderGames, missingRosteredProviderGames, sportradarGamePlayers } from '../scripts/sportradar-nfl-live-fallback.mjs';

test('matches provider players to duplicate drafted records safely', () => {
  assert.equal(liveIdentityKey('James Cook III', 'RB', 'BUF'), liveIdentityKey('James Cook', 'rb', 'BUF'));
  assert.equal(liveIdentityKey('Brian Thomas Jr.', 'WR', 'JAX'), liveIdentityKey('Brian Thomas', 'WR', 'JAC'));
});

test('builds a team-independent identity key for unique roster moves', () => {
  assert.equal(liveNamePositionKey('James Cook III', 'RB'), liveNamePositionKey('James Cook', 'rb'));
});

test('normalizes live player scoring fields', () => {
  const result = canonicalLivePlayerStats({ passing_touchdowns: 2, passing_interceptions: 1, rushing_touchdowns: 1, fumbles_lost: 1, extra_points_made: 3 });
  assert.equal(result.passing_tds, 2);
  assert.equal(result.passing_interceptions, 1);
  assert.equal(result.rushing_tds, 1);
  assert.equal(result.rushing_fumbles_lost, 1);
  assert.equal(result.pat_made, 3);
});

test('normalizes provider weekly fantasy observations for canonical scoring', () => {
  const result = canonicalWeeklyPlayerStats({ stats: {
    passing_touchdowns: 2, passing_two_point_conversions: 1, receiving_receptions: 7,
    receiving_touchdowns: 1, fumbles_lost: 1, field_goals_made_0_to_39: 2,
  } });
  assert.equal(result.passing_tds, 2);
  assert.equal(result.passing_2pt_conversions, 1);
  assert.equal(result.receptions, 7);
  assert.equal(result.receiving_tds, 1);
  assert.equal(result.rushing_fumbles_lost, 1);
  assert.equal(result.fg_made_0_19, 2);
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

test('normalizes Sportradar game statistics for Big Exec scoring', () => {
  const result = canonicalSportradarPlayerStats({ statistics: {
    rushing: { yards: 83, touchdowns: 0 },
    receiving: { receptions: 8, yards: 90, touchdowns: 1 },
  } });
  assert.equal(result.rushing_yards, 83);
  assert.equal(result.receptions, 8);
  assert.equal(result.receiving_yards, 90);
  assert.equal(result.receiving_tds, 1);
  assert.equal(result.rushing_yards / 10 + result.receptions * 0.5 + result.receiving_yards / 10 + result.receiving_tds * 6, 27.3);
});

test('limits fallback requests to games with incomplete player coverage', () => {
  const teams = { home_team: { abbreviation: 'PIT' }, visitor_team: { abbreviation: 'ATL' } };
  const game = { id: 10, status_state: 'final', home_team_score: 20, visitor_team_score: 27, ...teams };
  const complete = ['QB', 'RB', 'WR', 'TE', 'K'].flatMap(position => [
    { game: { id: 10 }, team: { abbreviation: 'PIT' }, player: { position } },
    { game: { id: 10 }, team: { abbreviation: 'ATL' }, player: { position } },
  ]);
  assert.deepEqual(incompleteProviderGames([game], complete), []);
  assert.deepEqual(incompleteProviderGames([game], complete.filter(row => row.team.abbreviation !== 'ATL' || row.player.position !== 'QB')), [game]);
});

test('requests fallback when an actual starting-lineup player is absent', () => {
  const game = { id: 10, status_state: 'in_progress', home_team: { abbreviation: 'TB' }, visitor_team: { abbreviation: 'ATL' } };
  const athletes = [
    { id: 'baker', real_teams: { abbreviation: 'TB' } },
    { id: 'bijan', real_teams: { abbreviation: 'ATL' } },
  ];
  assert.deepEqual(missingRosteredProviderGames([game], [{ athlete_id: 'bijan' }], new Set(['baker', 'bijan']), athletes), [game]);
  assert.deepEqual(missingRosteredProviderGames([game], [{ athlete_id: 'baker' }, { athlete_id: 'bijan' }], new Set(['baker', 'bijan']), athletes), []);
});

test('reads both Sportradar game-statistics teams', () => {
  const result = sportradarGamePlayers({ statistics: {
    home: { team: { alias: 'PIT' }, players: [{ id: 'home', name: 'Home Player' }] },
    away: { team: { alias: 'ATL' }, players: [{ id: 'away', name: 'Away Player' }] },
  } });
  assert.deepEqual(result.map(player => player.team_alias), ['PIT', 'ATL']);
});
