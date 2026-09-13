import test from 'node:test';
import assert from 'node:assert/strict';
import { assertActionScope, validateStressConfig } from '../scripts/stress-season/config.mjs';
import { participationFor } from '../scripts/stress-season/schedule.mjs';

const managers = Array.from({ length: 9 }, (_, index) => ({ label: `Manager0${index + 1}`, email: `juanita.brazziel+qa-manager-0${index + 1}@gmail.com` }));
const config = { schemaVersion: 1, testId: 'BIG_EXEC_STRESS_SEASON_2026', sport: 'pro_football', seasonYear: 2026, leagueId: '11111111-1111-4111-8111-111111111111', leagueSeasonId: '33333333-3333-4333-8333-333333333333', humanManagerEmail: 'juanita.brazziel@gmail.com', draft: { startsAt: '2026-09-13T01:30:00.000Z', timezone: 'America/Chicago' }, disabledAt: '2027-03-01T00:00:00Z', syntheticManagers: managers };

test('stress harness is dry-run unless the exact execution phrase is present', () => {
  assert.equal(validateStressConfig(config, {}, new Date('2026-09-11')).mode, 'dry-run');
});

test('human and out-of-scope actions are blocked', () => {
  const env = { BIG_EXEC_STRESS_EXECUTE: 'BIG_EXEC_INTERNAL_STRESS_TEST_2026' };
  assert.throws(() => assertActionScope({ config, actorEmail: 'juanita.brazziel@gmail.com', leagueId: config.leagueId, env, now: new Date('2026-09-11') }), /non-synthetic/);
  assert.throws(() => assertActionScope({ config, actorEmail: managers[0].email, leagueId: '22222222-2222-4222-8222-222222222222', env, now: new Date('2026-09-11') }), /outside/);
});

test('mixed draft attendance is deterministic and includes autopick', () => {
  const modes = new Set(Array.from({ length: 150 }, (_, pick) => participationFor({ testId: config.testId, actorLabel: `Manager0${(pick % 9) + 1}`, overallPick: pick + 1 }).mode));
  assert.deepEqual(modes, new Set(['manual', 'late-manual', 'autopick']));
});
