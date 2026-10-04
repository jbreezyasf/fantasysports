import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHAOS_WEEK, chaosCardsEnabled, chaosDealDeadline, dealChaosWeekCards } from '../scripts/advance-fantasy-season.mjs';

// Minimal stand-in for the Supabase client. `seasons` maps a league season id
// to { matchups, dealt }. The rpc behaves like deal_chaos_week_cards. `games`
// are the Week 13 real_games rows of the one competition season ('cs').
function fakeDb({ seasons, missing = null, kickedOff = new Set(), failFor = new Set(), games = [], gamesError = null }) {
  const calls = { rpc: [], reads: 0 };
  const from = table => {
    const filters = {};
    const api = {
      select: () => api,
      eq: (column, value) => { filters[column] = value; return api; },
      then: (resolve, reject) => {
        calls.reads += 1;
        const season = seasons[filters.league_season_id];
        if (table === 'chaos_card_deals' && missing === 'table') return Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.chaos_card_deals' in the schema cache" } }).then(resolve, reject);
        if (table === 'league_seasons' && missing === 'column') return Promise.resolve({ data: null, error: { code: '42703', message: 'column league_seasons.chaos_cards_enabled does not exist' } }).then(resolve, reject);
        // A league season is opted in unless the test says `optedIn: false` (the database default is false; see the opt-in tests below).
        if (table === 'league_seasons') return Promise.resolve({ data: seasons[filters.id] ? [{ competition_season_id: 'cs', chaos_cards_enabled: seasons[filters.id].optedIn !== false }] : [], error: null }).then(resolve, reject);
        if (table === 'real_games') return Promise.resolve(gamesError ? { data: null, error: { message: gamesError } } : { data: filters.competition_season_id === 'cs' && filters.week === CHAOS_WEEK ? games : [], error: null }).then(resolve, reject);
        const data = table === 'matchups' ? (season?.matchups ?? []).filter(m => m.week === filters.week) : season?.dealt ? [{ week: CHAOS_WEEK }] : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  return { calls, seasons, from, rpc: async (name, args) => {
    calls.rpc.push(`${name}:${args.p_league_season_id}:${args.p_week}`);
    if (missing === 'function') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.deal_chaos_week_cards(p_league_season_id, p_week) in the schema cache' } };
    if (seasons[args.p_league_season_id]?.optedOutInDatabase) return { data: null, error: { message: 'Rule cards are not enabled for this league season' } };
    if (kickedOff.has(args.p_league_season_id)) return { data: null, error: { message: 'Week 13 has already kicked off; rule cards can no longer be dealt' } };
    if (failFor.has(args.p_league_season_id)) return { data: null, error: { message: 'Chaos Week matchups must be open and carry both seeds before cards are dealt' } };
    const season = seasons[args.p_league_season_id];
    const cards = season.matchups.filter(m => m.week === CHAOS_WEEK).map((m, i) => ({ matchup_id: m.id, deal_position: i + 1, card_code: ['CAPTAIN', 'RAID', 'WILD_SLOT', 'BOUNTY', 'TWIST_K_TRIPLE'][i] }));
    if (season.dealt) return { data: { status: 'exists', week: CHAOS_WEEK, cards }, error: null };
    season.dealt = true;
    return { data: { status: 'dealt', week: CHAOS_WEEK, cards }, error: null };
  } };
}
const chaosWeek = (final = false) => Array.from({ length: 5 }, (_, i) => ({ id: `m${i + 1}`, week: 13, event_type: 'chaos', is_final: final }));
const quiet = () => { const lines = { log: [], warn: [], error: [] }; return { lines, log: l => lines.log.push(JSON.parse(l)), warn: l => lines.warn.push(JSON.parse(l)), error: l => lines.error.push(JSON.parse(l)) }; };
const leagues = ids => ids.map(id => ({ id }));
// Production's first Week 13 kickoff (read 2026-10-04): Thursday 2026-12-03 20:15 in New York.
const FIRST_KICKOFF = '2026-12-04T01:15:00Z';
const week13Games = [{ starts_at: '2026-12-06T18:00:00Z', state: 'scheduled' }, { starts_at: FIRST_KICKOFF, state: 'scheduled' }, { starts_at: '2026-12-03T18:00:00Z', state: 'postponed' }];
const DEADLINE = Date.parse('2026-12-01T17:00:00Z'); // Tuesday 12:00 EST
const AFTER_DEADLINE = Date.parse('2026-12-02T13:15:00Z'); // 36 hours before the first kickoff

test('the flag is off by default and only on for explicit values', () => {
  assert.equal(chaosCardsEnabled({}), false);
  for (const value of ['', '0', 'false', 'off', 'no', 'enabled', undefined]) assert.equal(chaosCardsEnabled({ CHAOS_CARDS_ENABLED: value }), false, String(value));
  for (const value of ['1', 'true', 'TRUE', ' on ', 'yes']) assert.equal(chaosCardsEnabled({ CHAOS_CARDS_ENABLED: value }), true, value);
});

test('disabled: nothing is read or written', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() } } });
  assert.deepEqual(await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), enabled: false, log: quiet(), now: AFTER_DEADLINE }), { enabled: false, results: [], failures: [] });
  assert.deepEqual(db.calls, { rpc: [], reads: 0 });
});

test('the weekly job deals after the season step and leaves the flag at its default', async () => {
  const source = await readFile('scripts/import-balldontlie-nfl-weekly-stats.mjs', 'utf8');
  const advance = source.indexOf('const seasonAdvance=await advanceFantasySeasons({db,leagueSeasons});');
  const deal = source.indexOf('const chaosCards=await dealChaosWeekCards({db,leagueSeasons});');
  assert.ok(advance > -1 && deal > advance, 'dealChaosWeekCards runs after advanceFantasySeasons, with no enabled override');
  const saved = process.env.CHAOS_CARDS_ENABLED; delete process.env.CHAOS_CARDS_ENABLED;
  try {
    const db = fakeDb({ seasons: { A: { matchups: chaosWeek() } } });
    assert.equal((await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), log: quiet() })).enabled, false);
    assert.deepEqual(db.calls, { rpc: [], reads: 0 });
  } finally { if (saved !== undefined) process.env.CHAOS_CARDS_ENABLED = saved; }
});

test('enabled: deals once, then does nothing on later runs', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() } } }); const log = quiet();
  const first = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), enabled: true, log });
  assert.equal(first.results[0].status, 'dealt');
  assert.deepEqual(first.results[0].cards.map(card => card.matchupId), ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.equal(new Set(first.results[0].cards.map(card => card.cardCode)).size, 5);
  for (let run = 0; run < 3; run += 1) {
    const again = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), enabled: true, log });
    assert.deepEqual(again.results, [{ leagueSeasonId: 'A', status: 'skipped', reason: 'already dealt' }]);
  }
  assert.deepEqual(db.calls.rpc, ['deal_chaos_week_cards:A:13']);
});

test('enabled: this code never chooses a card; it only passes the league season and the week', async () => {
  const source = await readFile('scripts/advance-fantasy-season.mjs', 'utf8');
  assert.match(source, /db\.rpc\('deal_chaos_week_cards', \{ p_league_season_id: leagueSeason\.id, p_week: CHAOS_WEEK \}\)/);
  assert.doesNotMatch(source, /Math\.random|randomUUID|randomBytes|p_seed|p_card/);
});

test('enabled: league seasons with no Chaos Week yet, or a finished one, are left alone', async () => {
  const db = fakeDb({ seasons: { early: { matchups: [{ id: 'x', week: 12, event_type: 'position', is_final: true }] }, other: { matchups: [{ id: 'y', week: 13, event_type: 'circuit', is_final: false }] }, done: { matchups: chaosWeek(true) } } });
  const { results } = await dealChaosWeekCards({ db, leagueSeasons: leagues(['early', 'other', 'done']), enabled: true, log: quiet() });
  assert.deepEqual(results.map(r => [r.leagueSeasonId, r.status, r.reason]), [['early', 'skipped', 'no Chaos Week matchups'], ['other', 'skipped', 'no Chaos Week matchups'], ['done', 'skipped', 'Chaos Week is already final']]);
  assert.deepEqual(db.calls.rpc, []);
});

test('enabled after kickoff: reported as skipped, not as a failure', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() } }, kickedOff: new Set(['A']) });
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), enabled: true, log: quiet() });
  assert.deepEqual(outcome.failures, []);
  assert.deepEqual(outcome.results, [{ leagueSeasonId: 'A', status: 'skipped', reason: 'Chaos Week has kicked off; no cards are dealt' }]);
});

test('enabled: one league failing does not stop the others, and the failure is reported', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() }, B: { matchups: chaosWeek() } }, failFor: new Set(['A']) }); const log = quiet();
  const { results, failures } = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A', 'B']), enabled: true, log });
  assert.deepEqual(failures, [{ leagueSeasonId: 'A', message: 'Chaos Week matchups must be open and carry both seeds before cards are dealt' }]);
  assert.deepEqual(results.map(r => [r.leagueSeasonId, r.status]), [['B', 'dealt']]);
  assert.equal(log.lines.error[0].error, 'deal-failed');
});

for (const missing of ['table', 'function']) {
  test(`enabled before the migration is applied (${missing} missing): warns once, changes nothing, reports no failure`, async () => {
    const db = fakeDb({ seasons: { A: { matchups: chaosWeek() }, B: { matchups: chaosWeek() } }, missing }); const log = quiet();
    const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A', 'B']), enabled: true, log });
    assert.deepEqual(outcome, { enabled: true, available: false, results: [], failures: [], alerts: [] });
    assert.equal(log.lines.warn.length, 1);
    assert.equal(log.lines.warn[0].warning, 'chaos-cards-migration-not-applied');
    assert.equal(db.calls.rpc.length, missing === 'function' ? 1 : 0);
  });
}

// PER-LEAGUE-SEASON OPT-IN (owner decision 2026-10-04): the flag alone deals nothing.
test('opt-in off, flag on: no deal, no alert, one read; an opted-in league season in the same run is still dealt', async () => {
  const db = fakeDb({ seasons: { off: { matchups: chaosWeek(), optedIn: false }, on: { matchups: chaosWeek() } }, games: week13Games }); const log = quiet();
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['off', 'on']), enabled: true, log, now: AFTER_DEADLINE });
  assert.deepEqual(outcome.results.map(r => [r.leagueSeasonId, r.status, r.reason]), [['off', 'skipped', 'rule cards are not enabled for this league season'], ['on', 'dealt', undefined]]);
  assert.deepEqual(db.calls.rpc, ['deal_chaos_week_cards:on:13'], 'the deal function is never called for the league season that is not opted in');
  assert.equal(db.seasons.off.dealt, undefined);
  assert.deepEqual(outcome.alerts, [], 'past the deal deadline, with open Chaos Week matchups and no deal: still NO alert for a league season that is not opted in');
  assert.deepEqual([outcome.failures, log.lines.error, log.lines.warn], [[], [], []]);
  const only = fakeDb({ seasons: { off: { matchups: chaosWeek(), optedIn: false } }, games: week13Games });
  await dealChaosWeekCards({ db: only, leagueSeasons: leagues(['off']), enabled: true, log: quiet(), now: AFTER_DEADLINE });
  assert.deepEqual(only.calls, { rpc: [], reads: 1 }, 'one read (the opt-in) and nothing else: no matchups, no deals, no games');
});

test('opt-in: the alert fires for an opted-in league season and not for the others, in the same run', async () => {
  const db = fakeDb({ seasons: { off: { matchups: chaosWeek(), optedIn: false }, on: { matchups: chaosWeek() } }, failFor: new Set(['off', 'on']), games: week13Games }); const log = quiet();
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['off', 'on']), enabled: true, log, now: AFTER_DEADLINE });
  assert.deepEqual(outcome.alerts.map(a => [a.leagueSeasonId, a.reason]), [['on', 'the deal failed']]);
  assert.deepEqual(log.lines.error.filter(line => line.error === 'deal-deadline-missed').map(line => line.leagueSeasonId), ['on']);
  assert.deepEqual(outcome.failures.map(f => f.leagueSeasonId), ['on']);
});

test('opt-in withdrawn between the read and the deal: the database refuses; reported as skipped, no failure, no alert', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek(), optedOutInDatabase: true } }, games: week13Games }); const log = quiet();
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), enabled: true, log, now: AFTER_DEADLINE });
  assert.deepEqual([outcome.results, outcome.failures, outcome.alerts], [[{ leagueSeasonId: 'A', status: 'skipped', reason: 'rule cards are not enabled for this league season' }], [], []]);
});

test('opt-in column missing (migration not applied): warns once, nothing is dealt, no alert, no failure', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() }, B: { matchups: chaosWeek() } }, missing: 'column', games: week13Games }); const log = quiet();
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A', 'B']), enabled: true, log, now: AFTER_DEADLINE });
  assert.deepEqual(outcome, { enabled: true, available: false, results: [], failures: [], alerts: [] });
  assert.deepEqual(log.lines.warn.map(line => line.warning), ['chaos-cards-migration-not-applied']);
  assert.deepEqual(db.calls.rpc, []);
});

test('the opt-in is read from league_seasons.chaos_cards_enabled and must be exactly true', async () => {
  const source = await readFile('scripts/advance-fantasy-season.mjs', 'utf8');
  assert.match(source, /db\.from\('league_seasons'\)\.select\('chaos_cards_enabled'\)\.eq\('id', leagueSeason\.id\)/);
  assert.match(source, /chaos_cards_enabled !== true/);
  const migration = await readFile('supabase/migrations/20261004020000_chaos_week_rule_cards.sql', 'utf8');
  assert.match(migration, /add column if not exists chaos_cards_enabled boolean not null default false/);
  assert.doesNotMatch(migration, /set\s+chaos_cards_enabled\s*=\s*true/i, 'the migration opts no league season in');
});

test('the deal deadline is Tuesday 12:00 America/New_York before the first Week 13 kickoff, in winter and summer time', () => {
  assert.equal(chaosDealDeadline(FIRST_KICKOFF), DEADLINE);
  assert.equal(new Date(chaosDealDeadline('2026-12-06T18:00:00Z')).toISOString(), '2026-12-01T17:00:00.000Z', 'a Sunday opener: the Tuesday before it');
  assert.equal(new Date(chaosDealDeadline('2026-10-30T00:15:00Z')).toISOString(), '2026-10-27T16:00:00.000Z', 'daylight saving time: noon is 16:00 UTC');
  assert.equal(new Date(chaosDealDeadline('2026-12-01T17:00:00Z')).toISOString(), '2026-11-24T17:00:00.000Z', 'a kickoff at Tuesday noon itself: the Tuesday before');
  assert.equal(chaosDealDeadline('not a date'), null);
});

test('deal deadline alert: one structured error line per undealt league season per run, also in the returned report; it does not throw', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() }, B: { matchups: chaosWeek() }, C: { matchups: chaosWeek() } }, failFor: new Set(['A', 'B']), games: week13Games }); const log = quiet();
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A', 'B', 'C']), enabled: true, log, now: AFTER_DEADLINE });
  assert.deepEqual(outcome.alerts.map(a => [a.leagueSeasonId, a.hoursUntilFirstKickoff, a.firstKickoff, a.deadline, a.reason]), [
    ['A', 36, '2026-12-04T01:15:00.000Z', '2026-12-01T17:00:00.000Z', 'the deal failed'],
    ['B', 36, '2026-12-04T01:15:00.000Z', '2026-12-01T17:00:00.000Z', 'the deal failed'],
  ]);
  assert.match(outcome.alerts[0].action, /select public\.deal_chaos_week_cards\('<league_season_id>', 13\);/);
  const lines = log.lines.error.filter(line => line.error === 'deal-deadline-missed');
  assert.deepEqual(lines.map(line => [line.job, line.leagueSeasonId, line.hoursUntilFirstKickoff]), [['chaos-cards', 'A', 36], ['chaos-cards', 'B', 36]]);
  assert.deepEqual(outcome.results.map(r => [r.leagueSeasonId, r.status]), [['C', 'dealt']], 'the league that was dealt in this run raises no alert');
  assert.equal(outcome.failures.length, 2, 'the failed deals are still reported as failures, separately');
  const again = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A', 'B', 'C']), enabled: true, log: quiet(), now: AFTER_DEADLINE + 3600e3 });
  assert.deepEqual(again.alerts.map(a => [a.leagueSeasonId, a.hoursUntilFirstKickoff]), [['A', 35], ['B', 35]], 'the next run alerts again, once per league season');
});

test('deal deadline alert: silent before the deadline, at the deadline, when dealt, when Chaos Week does not exist or is final, and when the flag is off', async () => {
  const seasons = () => ({ A: { matchups: chaosWeek() }, early: { matchups: [{ id: 'x', week: 12, event_type: 'position', is_final: true }] }, done: { matchups: chaosWeek(true) }, dealt: { matchups: chaosWeek(), dealt: true } });
  for (const now of [Date.parse('2026-11-30T12:00:00Z'), DEADLINE]) {
    const log = quiet();
    const outcome = await dealChaosWeekCards({ db: fakeDb({ seasons: seasons(), failFor: new Set(['A']), games: week13Games }), leagueSeasons: leagues(['A', 'early', 'done', 'dealt']), enabled: true, log, now });
    assert.deepEqual(outcome.alerts, [], new Date(now).toISOString());
    assert.equal(log.lines.error.filter(line => line.error === 'deal-deadline-missed').length, 0);
  }
  const late = await dealChaosWeekCards({ db: fakeDb({ seasons: seasons(), games: week13Games }), leagueSeasons: leagues(['A', 'early', 'done', 'dealt']), enabled: true, log: quiet(), now: AFTER_DEADLINE });
  assert.deepEqual(late.alerts, [], 'past the deadline: A is dealt in this run; the others have no open undealt Chaos Week');
  const off = fakeDb({ seasons: seasons(), failFor: new Set(['A']), games: week13Games });
  assert.deepEqual(await dealChaosWeekCards({ db: off, leagueSeasons: leagues(['A']), enabled: false, log: quiet(), now: AFTER_DEADLINE }), { enabled: false, results: [], failures: [] });
  assert.deepEqual(off.calls, { rpc: [], reads: 0 });
});

test('deal deadline alert after kickoff: hours are negative and the alert says the database now refuses', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() } }, kickedOff: new Set(['A']), games: week13Games }); const log = quiet();
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), enabled: true, log, now: Date.parse('2026-12-04T03:15:00Z') });
  assert.deepEqual(outcome.failures, []);
  assert.deepEqual(outcome.results, [{ leagueSeasonId: 'A', status: 'skipped', reason: 'Chaos Week has kicked off; no cards are dealt' }]);
  assert.equal(outcome.alerts.length, 1);
  assert.equal(outcome.alerts[0].hoursUntilFirstKickoff, -2);
  assert.match(outcome.alerts[0].action, /refuses to deal now/);
  assert.equal(log.lines.error.length, 1);
});

test('deal deadline alert with the migration not applied: every league season with an open Chaos Week is alerted, the warning is still logged once', async () => {
  for (const missing of ['table', 'function']) {
    const db = fakeDb({ seasons: { A: { matchups: chaosWeek() }, B: { matchups: chaosWeek() }, early: { matchups: [] } }, missing, games: week13Games }); const log = quiet();
    const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A', 'B', 'early']), enabled: true, log, now: AFTER_DEADLINE });
    assert.deepEqual(outcome.alerts.map(a => [a.leagueSeasonId, a.reason]), [['A', 'the rule cards migration is not applied'], ['B', 'the rule cards migration is not applied']], missing);
    assert.deepEqual([outcome.available, outcome.results, outcome.failures], [false, [], []]);
    assert.equal(log.lines.warn.length, 1);
  }
});

test('deal deadline alert: a failure of the safeguard itself is a warning; nothing is thrown and other leagues are still handled', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() }, B: { matchups: chaosWeek() } }, failFor: new Set(['A']), gamesError: 'real_games is unavailable' }); const log = quiet();
  const outcome = await dealChaosWeekCards({ db, leagueSeasons: leagues(['A', 'B']), enabled: true, log, now: AFTER_DEADLINE });
  assert.deepEqual(outcome.alerts, []);
  assert.deepEqual(log.lines.warn.map(line => [line.warning, line.leagueSeasonId, line.message]), [['deal-deadline-check-failed', 'A', 'real_games is unavailable']]);
  assert.deepEqual(outcome.results.map(r => [r.leagueSeasonId, r.status]), [['B', 'dealt']]);
});

test('the weekly job returns the alerts in its report and never throws because of one', async () => {
  const source = await readFile('scripts/import-balldontlie-nfl-weekly-stats.mjs', 'utf8');
  assert.match(source, /const report = \{[^}]*\bchaosCards\b[^}]*\};/, 'chaosCards (results, failures, alerts) is part of the returned report');
  assert.doesNotMatch(source, /alerts/, 'the job has no code path that reacts to an alert, so an alert cannot stop it');
  const report = source.indexOf('const report = {'); const deal = source.indexOf('const chaosCards=await dealChaosWeekCards({db,leagueSeasons});');
  const lifecycle = source.indexOf('finalizeCompleteFootballWeeks({db');
  assert.ok(lifecycle > -1 && lifecycle < deal && deal < report, 'scoring and week close run before the deal step, so the safeguard cannot block them');
});
