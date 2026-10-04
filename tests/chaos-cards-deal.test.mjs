import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHAOS_WEEK, chaosCardsEnabled, dealChaosWeekCards } from '../scripts/advance-fantasy-season.mjs';

// Minimal stand-in for the Supabase client. `seasons` maps a league season id
// to { matchups, dealt }. The rpc behaves like deal_chaos_week_cards.
function fakeDb({ seasons, missing = null, kickedOff = new Set(), failFor = new Set() }) {
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
        const data = table === 'matchups' ? (season?.matchups ?? []).filter(m => m.week === filters.week) : season?.dealt ? [{ week: CHAOS_WEEK }] : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  return { calls, seasons, from, rpc: async (name, args) => {
    calls.rpc.push(`${name}:${args.p_league_season_id}:${args.p_week}`);
    if (missing === 'function') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.deal_chaos_week_cards(p_league_season_id, p_week) in the schema cache' } };
    if (kickedOff.has(args.p_league_season_id)) return { data: null, error: { message: 'Week 13 has already kicked off; rule cards can no longer be dealt' } };
    if (failFor.has(args.p_league_season_id)) return { data: null, error: { message: 'Chaos Week matchups must be open and carry both seeds before cards are dealt' } };
    const season = seasons[args.p_league_season_id];
    const cards = season.matchups.filter(m => m.week === CHAOS_WEEK).map((m, i) => ({ matchup_id: m.id, deal_position: i + 1, card_code: ['CAPTAIN', 'RAID', 'WILD_SLOT', 'UPSET_BOUNTY', 'TWIST_K_TRIPLE'][i] }));
    if (season.dealt) return { data: { status: 'exists', week: CHAOS_WEEK, cards }, error: null };
    season.dealt = true;
    return { data: { status: 'dealt', week: CHAOS_WEEK, cards }, error: null };
  } };
}
const chaosWeek = (final = false) => Array.from({ length: 5 }, (_, i) => ({ id: `m${i + 1}`, week: 13, event_type: 'chaos', is_final: final }));
const quiet = () => { const lines = { log: [], warn: [], error: [] }; return { lines, log: l => lines.log.push(JSON.parse(l)), warn: l => lines.warn.push(JSON.parse(l)), error: l => lines.error.push(JSON.parse(l)) }; };
const leagues = ids => ids.map(id => ({ id }));

test('the flag is off by default and only on for explicit values', () => {
  assert.equal(chaosCardsEnabled({}), false);
  for (const value of ['', '0', 'false', 'off', 'no', 'enabled', undefined]) assert.equal(chaosCardsEnabled({ CHAOS_CARDS_ENABLED: value }), false, String(value));
  for (const value of ['1', 'true', 'TRUE', ' on ', 'yes']) assert.equal(chaosCardsEnabled({ CHAOS_CARDS_ENABLED: value }), true, value);
});

test('disabled: nothing is read or written', async () => {
  const db = fakeDb({ seasons: { A: { matchups: chaosWeek() } } });
  assert.deepEqual(await dealChaosWeekCards({ db, leagueSeasons: leagues(['A']), enabled: false, log: quiet() }), { enabled: false, results: [], failures: [] });
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
    assert.deepEqual(outcome, { enabled: true, available: false, results: [], failures: [] });
    assert.equal(log.lines.warn.length, 1);
    assert.equal(log.lines.warn[0].warning, 'chaos-cards-migration-not-applied');
    assert.equal(db.calls.rpc.length, missing === 'function' ? 1 : 0);
  });
}
