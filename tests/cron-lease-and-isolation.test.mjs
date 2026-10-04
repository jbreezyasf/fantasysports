import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withCronLease } from '../scripts/cron-lease.mjs';
import { rescoreLeagueWeeks } from '../scripts/import-balldontlie-nfl-live-stats.mjs';

// Stand-in for the two lease functions, with the same semantics as
// supabase/migrations/20261003050000_cron_job_leases.sql.
function leaseDb({ now = () => Date.now(), missing = false, failRelease = false } = {}) {
  const leases = new Map(); const calls = [];
  return { leases, calls, rpc: async (name, args) => {
    calls.push(name);
    if (missing) return { data: null, error: { message: `Could not find the function public.${name}(p_holder, p_job, p_ttl_seconds) in the schema cache` } };
    if (name === 'acquire_cron_job_lease') {
      const current = leases.get(args.p_job);
      if (current && current.expiresAt > now() && current.holder !== args.p_holder) return { data: false, error: null };
      leases.set(args.p_job, { holder: args.p_holder, expiresAt: now() + args.p_ttl_seconds * 1000 });
      return { data: true, error: null };
    }
    if (failRelease) return { data: null, error: { message: 'connection reset' } };
    const current = leases.get(args.p_job);
    if (current?.holder === args.p_holder) leases.delete(args.p_job);
    return { data: true, error: null };
  } };
}
const quiet = () => { const warnings = []; return { warnings, warn: line => warnings.push(JSON.parse(line)) }; };

test('a run takes the lease, runs, and releases it', async () => {
  const db = leaseDb(); const log = quiet();
  const result = await withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => { assert.equal(db.leases.size, 1); return { ok: 1 }; });
  assert.deepEqual(result, { ok: 1 });
  assert.equal(db.leases.size, 0);
  assert.deepEqual(log.warnings, []);
});

test('a second run is skipped while the first is still running, and runs again afterwards', async () => {
  const db = leaseDb(); const log = quiet(); let ran = 0;
  let finishFirst; const firstStarted = new Promise(started => {
    withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, () => new Promise(resolve => { finishFirst = resolve; started(); })).then(() => {});
  });
  await firstStarted;
  const second = await withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => { ran += 1; });
  assert.deepEqual(second, { skipped: true, reason: 'previous run still holds the lease', job: 'live-scoring' });
  assert.equal(ran, 0);
  assert.equal(log.warnings[0].warning, 'cron-run-skipped-previous-run-still-active');
  const other = await withCronLease({ db, job: 'weekly-scoring-reconciliation', ttlSeconds: 830, log }, async () => 'other job is independent');
  assert.equal(other, 'other job is independent');
  finishFirst(); await new Promise(resolve => setImmediate(resolve));
  await withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => { ran += 1; });
  assert.equal(ran, 1);
});

test('the lease is released when the job throws, and the error still surfaces', async () => {
  const db = leaseDb(); const log = quiet();
  await assert.rejects(withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => { throw new Error('provider down'); }), /provider down/);
  assert.equal(db.leases.size, 0);
});

test('a run that died without releasing stops blocking once its lease expires', async () => {
  let clock = 0; const db = leaseDb({ now: () => clock }); const log = quiet();
  db.leases.set('live-scoring', { holder: 'dead-run', expiresAt: 830_000 });
  clock = 829_000;
  assert.equal((await withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => 'ran')).skipped, true);
  clock = 830_001;
  assert.equal(await withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => 'ran'), 'ran');
});

test('fails open with a warning when the lease functions are not applied yet', async () => {
  const db = leaseDb({ missing: true }); const log = quiet();
  assert.equal(await withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => 'ran'), 'ran');
  assert.equal(log.warnings[0].warning, 'cron-lease-unavailable-running-unguarded');
  assert.match(log.warnings[0].message, /Could not find the function/);
  assert.deepEqual(db.calls, ['acquire_cron_job_lease'], 'no release is attempted for a lease that was never held');
});

test('fails open when the database call itself throws, and a failed release does not fail the run', async () => {
  const log = quiet();
  const throwing = { rpc: async () => { throw new Error('fetch failed'); } };
  assert.equal(await withCronLease({ db: throwing, job: 'live-scoring', ttlSeconds: 830, log }, async () => 'ran'), 'ran');
  const db = leaseDb({ failRelease: true });
  assert.equal(await withCronLease({ db, job: 'live-scoring', ttlSeconds: 830, log }, async () => 'ran'), 'ran');
  assert.equal(log.warnings.at(-1).warning, 'cron-lease-release-failed');
});

test('both cron routes run through the lease with a duration longer than the function limit', async () => {
  for (const [route, job] of [['live-scoring', 'live-scoring'], ['weekly-scoring-reconciliation', 'weekly-scoring-reconciliation']]) {
    const source = await readFile(`apps/web/app/api/cron/${route}/route.ts`, 'utf8');
    assert.match(source, new RegExp(`withCronLeaseFromEnv\\('${job}', LEASE_SECONDS, \\(\\) => run`));
    assert.match(source, /const LEASE_SECONDS = maxDuration \+ 30;/);
  }
});

// Minimal stand-in for the Supabase client used by the live rescoring step.
function scoringDb({ matchups, failScoresFor = new Set(), failRecomputeFor = new Set(), failMatchupQueryFor = new Set() }) {
  const calls = { scores: [], recompute: [] };
  const from = () => {
    const filters = {};
    const api = {
      select: () => api,
      eq: (column, value) => { filters[column] = value; return api; },
      then: (resolve, reject) => Promise.resolve(
        failMatchupQueryFor.has(filters.league_season_id)
          ? { data: null, error: { message: 'matchups unavailable' } }
          : { data: matchups.filter(m => m.league_season_id === filters.league_season_id && m.week === filters.week && m.is_final === filters.is_final), error: null }
      ).then(resolve, reject),
    };
    return api;
  };
  return { calls, from, rpc: async (name, args) => {
    if (name === 'calculate_pro_football_week_scores') {
      if (failScoresFor.has(args.p_league_season_id)) return { error: { message: 'score calculation failed' } };
      calls.scores.push(`${args.p_league_season_id}:${args.p_week}`); return { data: {}, error: null };
    }
    assert.equal(args.p_finalize, false, 'the live job never finalizes');
    if (failRecomputeFor.has(args.p_matchup_id)) return { error: { message: 'boom' } };
    calls.recompute.push(args.p_matchup_id); return { data: {}, error: null };
  } };
}
const liveMatchups = () => [
  { id: 'mA', league_season_id: 'A', week: 4, is_final: false },
  { id: 'mA-final', league_season_id: 'A', week: 4, is_final: true },
  { id: 'mB', league_season_id: 'B', week: 4, is_final: false },
  { id: 'mC', league_season_id: 'C', week: 4, is_final: false },
];
const leagues = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

test('live rescoring: every league is rescored and final matchups are left alone', async () => {
  const db = scoringDb({ matchups: liveMatchups() });
  assert.deepEqual(await rescoreLeagueWeeks({ db, weeks: [4], leagueSeasons: leagues }), { rescored: 3, failures: [] });
  assert.deepEqual(db.calls.recompute, ['mA', 'mB', 'mC']);
});

test('live rescoring: one league failing does not stop the leagues after it', async () => {
  for (const failure of [{ failScoresFor: new Set(['A']) }, { failRecomputeFor: new Set(['mA']) }, { failMatchupQueryFor: new Set(['A']) }]) {
    const db = scoringDb({ matchups: liveMatchups(), ...failure });
    const result = await rescoreLeagueWeeks({ db, weeks: [4], leagueSeasons: leagues });
    assert.equal(result.rescored, 2);
    assert.equal(result.failures.length, 1);
    assert.deepEqual([result.failures[0].week, result.failures[0].leagueSeasonId], [4, 'A']);
    assert.deepEqual(db.calls.recompute, ['mB', 'mC'], 'leagues B and C were still rescored');
  }
});

test('live rescoring: the job reports failure after attempting every league', async () => {
  const source = await readFile('scripts/import-balldontlie-nfl-live-stats.mjs', 'utf8');
  assert.match(source, /const rescoring = await rescoreLeagueWeeks\(\{ db, weeks, leagueSeasons \}\);/);
  assert.match(source, /if \(rescoring\.failures\.length\) \{\s+const error = new Error\(`Live rescoring failed for/);
});
