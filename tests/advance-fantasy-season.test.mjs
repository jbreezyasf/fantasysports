import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceFantasySeasons, nextSeasonStep, seasonSteps, secondHalfAutomationEnabled } from '../scripts/advance-fantasy-season.mjs';

const week = (number, final, count = 5) => Array.from({ length: count }, () => ({ week: number, is_final: final }));
const through = (last, final = true) => Array.from({ length: last - 8 }, (_, i) => week(9 + i, i + 9 < last ? true : final)).flat();

test('the flag is off by default and only on for explicit values', () => {
  assert.equal(secondHalfAutomationEnabled({}), false);
  for (const value of ['', '0', 'false', 'off', 'no', 'enabled', undefined]) assert.equal(secondHalfAutomationEnabled({ SECOND_HALF_AUTOMATION_ENABLED: value }), false, String(value));
  for (const value of ['1', 'true', 'TRUE', ' on ', 'yes']) assert.equal(secondHalfAutomationEnabled({ SECOND_HALF_AUTOMATION_ENABLED: value }), true, value);
});

test('each week maps to the generator the product defines for it', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(seasonSteps).map(([w, step]) => [w, step.fn])), {
    10: 'generate_rivalry_week', 11: 'generate_revenge_week', 12: 'generate_position_week', 13: 'generate_chaos_week', 14: 'generate_judgment_week',
    15: 'initialize_postseason', 16: 'generate_postseason_week16', 17: 'generate_postseason_week17', 18: 'close_league_season',
  });
});

test('the commissioner buttons in the app call the same functions for the same weeks', async () => {
  const source = await readFile('apps/web/app/leagues/actions.ts', 'utf8');
  for (const w of [10, 11, 12, 13, 14]) assert.match(source, new RegExp(`rpc:'${seasonSteps[w].fn}', week:${w} `));
  for (const [phase, w] of [['seed', 15], ['week16', 16], ['week17', 17], ['close', 18]]) assert.match(source, new RegExp(`${phase}: '${seasonSteps[w].fn}'`));
});

test('the next step follows the latest scheduled week, only once that week is final', () => {
  assert.deepEqual(nextSeasonStep([]), { ready: false, reason: 'no matchups' });
  assert.deepEqual(nextSeasonStep(week(8, true)), { ready: false, reason: 'latest scheduled week is 8' });
  assert.deepEqual(nextSeasonStep(through(9, false)), { ready: false, reason: 'week 9 is not final' });
  assert.deepEqual(nextSeasonStep([...week(9, true, 4), { week: 9, is_final: false }]), { ready: false, reason: 'week 9 is not final' });
  for (let last = 9; last <= 17; last += 1) {
    const step = nextSeasonStep(through(last));
    assert.deepEqual([step.ready, step.week, step.fn], [true, last + 1, seasonSteps[last + 1].fn], `after week ${last}`);
  }
  assert.equal(nextSeasonStep(through(13, false)).ready, false, 'week 14 is not generated while week 13 is open');
  assert.equal(nextSeasonStep([...through(17), ...week(18, true)]).ready, false);
});

// Minimal stand-in for the Supabase client. `seasons` maps a league season id
// to { status, matchups }. The rpc behaves like system_advance_fantasy_season:
// it creates the next week's (non-final) matchups, or reports 'exists'.
function fakeDb({ seasons, failFor = new Set(), missingFunction = false, wrongStep = false }) {
  const calls = { rpc: [], reads: 0 };
  const from = table => {
    const filters = {};
    const api = {
      select: () => api,
      eq: (column, value) => { filters[column] = value; return api; },
      gte: (column, value) => { filters.minWeek = value; return api; },
      then: (resolve, reject) => {
        calls.reads += 1;
        const data = table === 'league_seasons'
          ? Object.entries(seasons).filter(([id]) => id === filters.id).map(([id, s]) => ({ id, status: s.status ?? 'setup' }))
          : (seasons[filters.league_season_id]?.matchups ?? []).filter(m => m.week >= filters.minWeek);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  return { calls, seasons, from, rpc: async (name, args) => {
    calls.rpc.push(`${name}:${args.p_league_season_id}:${args.p_week}`);
    if (missingFunction) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.system_advance_fantasy_season(p_league_season_id, p_week) in the schema cache' } };
    if (failFor.has(args.p_league_season_id)) return { data: null, error: { message: 'A postseason matchup ended in a tie; a commissioner decision is required' } };
    const season = seasons[args.p_league_season_id];
    const fn = wrongStep ? 'generate_chaos_week' : seasonSteps[args.p_week].fn;
    if (args.p_week === 18) { season.status = 'complete'; return { data: { week: 18, step: fn, result: { status: 'complete', already_closed: false } }, error: null }; }
    if (season.matchups.some(m => m.week === args.p_week)) return { data: { week: args.p_week, step: fn, result: { status: 'exists', week: args.p_week } }, error: null };
    const count = args.p_week <= 14 ? 5 : args.p_week === 15 ? 4 : 2;
    season.matchups.push(...week(args.p_week, false, count));
    return { data: { week: args.p_week, step: fn, result: { status: 'created', week: args.p_week, matchups: count } }, error: null };
  } };
}
const quiet = () => { const lines = { log: [], warn: [], error: [] }; return { lines, log: l => lines.log.push(JSON.parse(l)), warn: l => lines.warn.push(JSON.parse(l)), error: l => lines.error.push(JSON.parse(l)) }; };
const leagues = ids => ids.map(id => ({ id }));

test('disabled: nothing is read or written', async () => {
  const db = fakeDb({ seasons: { A: { matchups: through(9) } } });
  assert.deepEqual(await advanceFantasySeasons({ db, leagueSeasons: leagues(['A']), enabled: false, log: quiet() }), { enabled: false, results: [], failures: [] });
  assert.deepEqual(db.calls, { rpc: [], reads: 0 });
});

test('the weekly job leaves the flag at its default', async () => {
  const source = await readFile('scripts/import-balldontlie-nfl-weekly-stats.mjs', 'utf8');
  assert.match(source, /const seasonAdvance=await advanceFantasySeasons\(\{db,leagueSeasons\}\);/);
  const saved = process.env.SECOND_HALF_AUTOMATION_ENABLED; delete process.env.SECOND_HALF_AUTOMATION_ENABLED;
  try {
    const db = fakeDb({ seasons: { A: { matchups: through(9) } } });
    assert.equal((await advanceFantasySeasons({ db, leagueSeasons: leagues(['A']), log: quiet() })).enabled, false);
    assert.deepEqual(db.calls.rpc, []);
  } finally { if (saved !== undefined) process.env.SECOND_HALF_AUTOMATION_ENABLED = saved; }
});

test('enabled: generates the next week once, then waits for it to be played', async () => {
  const db = fakeDb({ seasons: { A: { matchups: through(9) } } }); const log = quiet();
  const first = await advanceFantasySeasons({ db, leagueSeasons: leagues(['A']), enabled: true, log });
  assert.deepEqual(first.results, [{ leagueSeasonId: 'A', status: 'advanced', week: 10, step: 'generate_rivalry_week', label: 'Rivalry Week', result: { status: 'created', week: 10, matchups: 5 } }]);
  assert.deepEqual(first.failures, []);
  // The job runs every 15 minutes: later runs in the same week must do nothing.
  for (let run = 0; run < 3; run += 1) {
    const again = await advanceFantasySeasons({ db, leagueSeasons: leagues(['A']), enabled: true, log });
    assert.deepEqual(again.results, [{ leagueSeasonId: 'A', status: 'skipped', reason: 'week 10 is not final' }]);
  }
  assert.deepEqual(db.calls.rpc, ['system_advance_fantasy_season:A:10']);
});

test('enabled: a whole second half, one step per finalized week, ends with the season closed', async () => {
  const db = fakeDb({ seasons: { A: { matchups: through(9) } } }); const log = quiet();
  const steps = [];
  for (let run = 0; run < 12; run += 1) {
    const { results, failures } = await advanceFantasySeasons({ db, leagueSeasons: leagues(['A']), enabled: true, log });
    assert.deepEqual(failures, []);
    if (results[0].status === 'advanced') steps.push(`${results[0].week}:${results[0].step}`);
    for (const matchup of db.seasons.A.matchups) matchup.is_final = true; // the week is played and closed
  }
  assert.deepEqual(steps, [10, 11, 12, 13, 14, 15, 16, 17, 18].map(w => `${w}:${seasonSteps[w].fn}`));
  assert.equal(db.seasons.A.status, 'complete');
  assert.equal(db.calls.rpc.length, 9, 'a closed season is never asked to advance again');
});
test('enabled: leagues that are not ready are left alone', async () => {
  const db = fakeDb({ seasons: { early: { matchups: [] }, open: { matchups: through(12, false) }, done: { status: 'complete', matchups: through(17) } } });
  const { results } = await advanceFantasySeasons({ db, leagueSeasons: leagues(['early', 'open', 'done']), enabled: true, log: quiet() });
  assert.deepEqual(results.map(r => [r.leagueSeasonId, r.status, r.reason]), [['early', 'skipped', 'no matchups'], ['open', 'skipped', 'week 12 is not final'], ['done', 'skipped', 'season already complete']]);
  assert.deepEqual(db.calls.rpc, []);
});

test('enabled: one league failing does not stop the others, and the failure is reported', async () => {
  const db = fakeDb({ seasons: { A: { matchups: through(15) }, B: { matchups: through(9) }, C: { matchups: through(13) } }, failFor: new Set(['A']) }); const log = quiet();
  const { results, failures } = await advanceFantasySeasons({ db, leagueSeasons: leagues(['A', 'B', 'C']), enabled: true, log });
  assert.deepEqual(failures, [{ leagueSeasonId: 'A', message: 'A postseason matchup ended in a tie; a commissioner decision is required' }]);
  assert.deepEqual(results.map(r => [r.leagueSeasonId, r.week, r.step]), [['B', 10, 'generate_rivalry_week'], ['C', 14, 'generate_judgment_week']]);
  assert.equal(log.lines.error[0].error, 'season-step-failed');
});

test('enabled before the migration is applied: warns once, changes nothing, reports no failure', async () => {
  const db = fakeDb({ seasons: { A: { matchups: through(9) }, B: { matchups: through(9) } }, missingFunction: true }); const log = quiet();
  const outcome = await advanceFantasySeasons({ db, leagueSeasons: leagues(['A', 'B']), enabled: true, log });
  assert.deepEqual(outcome, { enabled: true, available: false, results: [], failures: [] });
  assert.equal(db.calls.rpc.length, 1);
  assert.equal(log.lines.warn[0].warning, 'system-advance-function-not-applied');
});

test('a database step that does not match the expected generator is a failure', async () => {
  const db = fakeDb({ seasons: { A: { matchups: through(9) } }, wrongStep: true });
  const { failures } = await advanceFantasySeasons({ db, leagueSeasons: leagues(['A']), enabled: true, log: quiet() });
  assert.match(failures[0].message, /database ran generate_chaos_week for week 10, expected generate_rivalry_week/);
});
