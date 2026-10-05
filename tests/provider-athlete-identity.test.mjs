import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAthleteResolver } from '../scripts/provider-athlete-identity.mjs';

const athletes = [
  { id: 'myers', display_name: 'Jason Myers', position: 'K', real_teams: { abbreviation: 'SEA' } },
  { id: 'allen-qb', display_name: 'Josh Allen', position: 'QB', real_teams: { abbreviation: 'BUF' } },
  { id: 'cook', display_name: 'James Cook III', position: 'RB', real_teams: [{ abbreviation: 'BUF' }] },
  { id: 'smith-a', display_name: 'Mike Smith', position: 'WR', real_teams: { abbreviation: 'DAL' } },
  { id: 'smith-b', display_name: 'Mike Smith', position: 'WR', real_teams: { abbreviation: 'NYG' } },
  { id: 'linked', display_name: 'Chris Boswell', position: 'K', real_teams: { abbreviation: 'PIT' } },
];
const links = [{ provider_athlete_id: '900', athlete_id: 'linked' }];
const row = (id, first, last, position, team) => ({ player: { id, first_name: first, last_name: last, position_abbreviation: position }, team: { abbreviation: team } });

test('a stored provider id wins and creates no new link', () => {
  const resolve = buildAthleteResolver({ links, athletes });
  assert.deepEqual(resolve(row(900, 'Chris', 'Boswell', 'K', 'PIT')), { athleteId: 'linked', via: 'provider_id' });
});

test('a kicker with no stored id is matched by name, position and team, and the id is returned for storing', () => {
  const resolve = buildAthleteResolver({ links, athletes });
  const result = resolve(row(77, 'Jason', 'Myers', 'K', 'SEA'));
  assert.equal(result.athleteId, 'myers');
  assert.equal(result.via, 'name_position_team');
  assert.deepEqual(result.link, { athlete_id: 'myers', provider: 'balldontlie', provider_athlete_id: '77' });
});

test('suffixes are ignored and a team change falls back to a unique name and position', () => {
  const resolve = buildAthleteResolver({ links, athletes });
  assert.equal(resolve(row(12, 'James', 'Cook', 'RB', 'BUF')).athleteId, 'cook');
  const moved = resolve(row(13, 'Josh', 'Allen', 'QB', 'JAX'));
  assert.equal(moved.athleteId, 'allen-qb');
  assert.equal(moved.via, 'name_position');
});

test('an ambiguous name is not guessed, but the team can settle it', () => {
  const resolve = buildAthleteResolver({ links, athletes });
  assert.equal(resolve(row(20, 'Mike', 'Smith', 'WR', 'PHI')).athleteId, null);
  assert.equal(resolve(row(21, 'Mike', 'Smith', 'WR', 'NYG')).athleteId, 'smith-b');
});

test('an athlete that already has a different provider id is never re-linked', () => {
  const resolve = buildAthleteResolver({ links, athletes });
  assert.equal(resolve(row(901, 'Chris', 'Boswell', 'K', 'PIT')).athleteId, null);
});

test('two provider ids cannot claim the same athlete in one run; the same id resolves again without a new link', () => {
  const resolve = buildAthleteResolver({ links, athletes });
  assert.equal(resolve(row(77, 'Jason', 'Myers', 'K', 'SEA')).athleteId, 'myers');
  assert.equal(resolve(row(78, 'Jason', 'Myers', 'K', 'SEA')).athleteId, null);
  assert.deepEqual(resolve(row(77, 'Jason', 'Myers', 'K', 'SEA')), { athleteId: 'myers', via: 'provider_id' });
});

test('rows without a player id, name or position resolve to nothing', () => {
  const resolve = buildAthleteResolver({ links, athletes });
  assert.equal(resolve({ player: { first_name: 'Jason', last_name: 'Myers', position_abbreviation: 'K' } }).athleteId, null);
  assert.equal(resolve(row(5, '', '', 'K', 'SEA')).athleteId, null);
});
