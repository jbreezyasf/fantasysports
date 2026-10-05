/* Local-only visual harness for Chaos Week rule cards (same approach as
   scripts/qa-executive-world.cjs). It renders the REAL matchup and team page
   components with synthetic data through a stub database client, serves them
   on 127.0.0.1, and uses the installed Playwright Chromium to take screenshots,
   run axe and measure layout. No app route is added, nothing is authenticated,
   and no production system is contacted. Mutations are stubbed out.

   Run: node scripts/qa-chaos-cards.cjs
   Output: qa-artifacts/2026-10-04-chaos-cards/ */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), Module = require('node:module');
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..'), app = path.join(root, 'apps/web/app'), out = path.join(root, 'qa-artifacts/2026-10-04-chaos-cards');
fs.mkdirSync(out, { recursive: true });
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);

// ---- synthetic league -------------------------------------------------------
const names = ['High Volts', 'Waiver Wire Kings', 'Gridiron Alchemists', 'Fourth Quarter', 'Sunday Standard', 'Gold Standard', 'Night Shift', 'Prime Time', 'The Architects', 'Legacy Club'];
const franchises = names.map((name, i) => ({ id: 'f' + i, league_id: 'fixture', name, abbreviation: ['HV', 'WWK', 'GA', 'FQ', 'SS', 'GS', 'NS', 'PT', 'ARC', 'LC'][i], primary_color: i ? '#c49c51' : '#276b51', secondary_color: '#e6c584', avatar_key: i ? 'crown' : 'classic' }));
const seasonFranchises = franchises.map((f, i) => ({ id: 'sf' + i, franchise_id: f.id, league_season_id: 'season', franchises: f }));
const standings = seasonFranchises.map((sf, i) => ({ league_season_id: 'season', season_franchise_id: sf.id, wins: 11 - i, losses: 1 + i, ties: 0, points_for: 1500 - i * 40, points_against: 1300 + i * 20 }));
const HOME = 'sf0', AWAY = 'sf9'; // seed 1 hosts seed 10
const teamAbbr = { t1: 'NOR', t2: 'EAS', t3: 'SOU', t4: 'WES' };
// [id, name, position, real team, owner, lineup slot or null, slot index, points, breakdown]
const cast = [
  ['hq', 'Avery Stone', 'QB', 't1', HOME, 'QB', 1, 20.0, { passing: 18, rushing: 4, fumbles_lost: -2 }],
  ['hr1', 'Deon Mercer', 'RB', 't1', HOME, 'RB', 1, 12.5, { rushing: 9.5, receiving: 3 }],
  ['hr2', 'Kellan Voss', 'RB', 't3', HOME, 'RB', 2, 7.4, { rushing: 5.4, receiving: 2 }],
  ['hw1', 'Jalen Abara', 'WR', 't3', HOME, 'WR', 1, 14.2, { receiving: 14.2 }],
  ['hw2', 'Tobias Rennick', 'WR', 't1', HOME, 'WR', 2, 6.1, { receiving: 6.1 }],
  ['hte', 'Miles Okafor', 'TE', 't3', HOME, 'TE', 1, 8.0, { receiving: 8 }],
  ['hfx', 'Corin Delacroix', 'WR', 't1', HOME, 'FLEX', 1, 9.3, { receiving: 9.3 }],
  ['hk', 'Soren Lindqvist', 'K', 't3', HOME, 'K', 1, 9.0, { kicking: 9 }],
  ['hb1', 'Dre Halloran', 'WR', 't3', HOME, null, 1, 15.0, { receiving: 15 }],
  ['hb2', 'Marcus Yeo', 'RB', 't1', HOME, null, 1, 6.0, { rushing: 6 }],
  ['hb3', 'Elias Brandt', 'QB', 't3', HOME, null, 1, 11.2, { passing: 11.2 }],
  ['aq', 'Sam Whitlock', 'QB', 't2', AWAY, 'QB', 1, 16.0, { passing: 16 }],
  ['ar1', 'Tariq Bellamy', 'RB', 't2', AWAY, 'RB', 1, 10.0, { rushing: 7, receiving: 3 }],
  ['ar2', 'Owen Castaneda', 'RB', 't4', AWAY, 'RB', 2, 5.5, { rushing: 5.5 }],
  ['aw1', 'Lucian Ferro', 'WR', 't4', AWAY, 'WR', 1, 12.8, { receiving: 12.8 }],
  ['aw2', 'Nico Varga', 'WR', 't2', AWAY, 'WR', 2, 4.9, { receiving: 4.9 }],
  ['ate', 'Hollis Grant', 'TE', 't4', AWAY, 'TE', 1, 11.0, { receiving: 11 }],
  ['afx', 'Bram Oyelaran', 'RB', 't2', AWAY, 'FLEX', 1, 7.7, { rushing: 7.7 }],
  ['ak', 'Pieter Vance', 'K', 't4', AWAY, 'K', 1, 6.0, { kicking: 6 }],
  ['ab1', 'Rio Castellan', 'WR', 't4', AWAY, null, 1, 13.0, { receiving: 13 }],
  ['ab2', 'Jonah Pruitt', 'TE', 't2', AWAY, null, 1, 3.4, { receiving: 3.4 }],
];
const athleteRef = (c) => ({ display_name: c[1], position: c[2], real_team_id: c[3], real_teams: { abbreviation: teamAbbr[c[3]] } });
const dst = [{ team: 't1', owner: HOME, points: 7.0 }, { team: 't2', owner: AWAY, points: -1.0 }];
const rosterEntries = [
  ...cast.map((c, i) => ({ id: 're-' + c[0], season_franchise_id: c[4], athlete_id: c[0], real_team_id: null, added_at: i, athletes: athleteRef(c), real_teams: null })),
  ...dst.map((d) => ({ id: 're-' + d.team, season_franchise_id: d.owner, athlete_id: null, real_team_id: d.team, added_at: 99, athletes: null, real_teams: { display_name: teamAbbr[d.team], abbreviation: teamAbbr[d.team] } })),
];
const lineups = [
  ...cast.filter((c) => c[5]).map((c) => ({ season_franchise_id: c[4], week: 13, slot: c[5], slot_index: c[6], athlete_id: c[0], real_team_id: null, athletes: athleteRef(c), real_teams: null })),
  ...dst.map((d) => ({ season_franchise_id: d.owner, week: 13, slot: 'DST', slot_index: 1, athlete_id: null, real_team_id: d.team, athletes: null, real_teams: { abbreviation: teamAbbr[d.team] } })),
];
const playerScores = cast.map((c) => ({ league_season_id: 'season', week: 13, athlete_id: c[0], game_id: 'g-' + c[3], points: c[7], breakdown: { kicking: 0, passing: 0, rushing: 0, receiving: 0, two_point: 0, fumbles_lost: 0, special_teams_td: 0, ...c[8] }, calculated_at: new Date().toISOString() }));
const teamScores = dst.map((d) => ({ league_season_id: 'season', week: 13, real_team_id: d.team, game_id: 'g-' + d.team, points: d.points, breakdown: { sacks: 2, interceptions: 1, points_allowed: 20 }, calculated_at: new Date().toISOString() }));
const baseOf = (sf) => +(cast.filter((c) => c[4] === sf && c[5]).reduce((sum, c) => sum + c[7], 0) + dst.find((d) => d.owner === sf).points).toFixed(2);
const pointsOf = (id) => cast.find((c) => c[0] === id)[7];
const hours = (n) => new Date(Date.now() + n * 3600e3).toISOString();

// ---- scenarios --------------------------------------------------------------
// Each scenario fixes: the flag, the card, who is signed in, kickoff times,
// selections, and (as the database would have stored it) the score build-up.
const side = (sf, lines) => ({ base: baseOf(sf), adjustments: lines, total: +(baseOf(sf) + lines.reduce((s, l) => s + l.points, 0)).toFixed(2) });
const line = (effect, id) => ({ effect, athlete_id: id, real_team_id: null, points: pointsOf(id) });
const upcoming = [{ home_team_id: 't1', away_team_id: 't2', starts_at: hours(30), state: 'scheduled' }, { home_team_id: 't3', away_team_id: 't4', starts_at: hours(96), state: 'scheduled' }];
const thursdayPlayed = [{ home_team_id: 't1', away_team_id: 't2', starts_at: hours(-20), state: 'final' }, { home_team_id: 't3', away_team_id: 't4', starts_at: hours(40), state: 'scheduled' }];
const allFinal = upcoming.map((g, i) => ({ ...g, starts_at: hours(-90 + i * 40), state: 'final' }));
// What the chaos_auto_captain database function would return (the page only presents it).
const autoReply = (id, expected, games) => ({ athlete_id: id, real_team_id: null, basis: 'recent_average_v1', expected, games, season_total: expected * games, compared: [] });
// The row the database records once the automatic captain's game has kicked off.
const autoRow = (sf, id, expected, games) => ({ season_franchise_id: sf, athlete_id: id, source: 'automatic', locked_at: hours(-20), details: { basis: 'recent_average_v1', expected, games } });
// A selection whose player left the roster before kickoff ('gone' is on no roster; the page looks the name up in athletes).
const DROPPED = { voided_at: hours(-30), void_reason: 'dropped' };
const goneAthlete = { id: 'gone', display_name: 'Kit Marlowe', position: 'RB', real_team_id: 't1', real_teams: { abbreviation: teamAbbr.t1 } };
const homeBenchIds = new Set(cast.filter((c) => c[4] === HOME && !c[5]).map((c) => c[0]));
const scenarios = {
  // Seed 1 named a captain (locked). Seed 10 named nobody: its automatic captain kicked off on Thursday and is recorded and locked.
  'matchup-captain': { page: 'matchup', flag: 'true', user: 'f0', card: 'CAPTAIN', games: thursdayPlayed, selections: [{ season_franchise_id: HOME, athlete_id: 'hq', source: 'named' }, autoRow(AWAY, 'aq', 14.2, 3)], build: { home: side(HOME, [line('captain', 'hq')]), away: side(AWAY, [{ ...line('captain', 'aq'), automatic: true, basis: 'recent_average_v1', expected: 14.2, games: 3 }]) } },
  // Nobody has named a captain and nothing has kicked off: both automatic captains are shown as "if none is named".
  'matchup-captain-auto-pending': { page: 'matchup', flag: 'true', user: 'f0', card: 'CAPTAIN', games: upcoming, selections: [], auto: { [HOME]: autoReply('hq', 20, 3), [AWAY]: autoReply('aq', 14.2, 3) } },
  // The higher seed won a Bounty game: it moves up three places.
  'matchup-bounty-final': { page: 'matchup', flag: 'true', user: 'f0', card: 'BOUNTY', games: allFinal, final: true, selections: [], build: { home: side(HOME, []), away: side(AWAY, []), bounty: { season_franchise_id: HOME, grant: 'up_three', effective_until: hours(170) } } },
  'matchup-raid': { page: 'matchup', flag: 'true', user: 'f9', card: 'RAID', games: upcoming, selections: [{ season_franchise_id: AWAY, athlete_id: 'hb1' }], build: { home: side(HOME, []), away: side(AWAY, [line('raid', 'hb1')]) } },
  'matchup-twist-final': { page: 'matchup', flag: 'true', user: 'f0', card: 'TWIST_K_TRIPLE', games: allFinal, final: true, selections: [], build: { home: side(HOME, [{ ...line('twist', 'hk'), points: 18 }]), away: side(AWAY, [{ ...line('twist', 'ak'), points: 12 }]) } },
  'lineup-captain': { page: 'team', flag: 'true', user: 'f0', card: 'CAPTAIN', games: upcoming, selections: [{ season_franchise_id: HOME, athlete_id: 'hw1' }], auto: { [HOME]: autoReply('hq', 20, 3) } },
  // No captain was named before the automatic captain's kickoff: "Automatic captain: ... (locked at kickoff)", no choose control.
  'lineup-captain-auto-locked': { page: 'team', flag: 'true', user: 'f9', card: 'CAPTAIN', games: thursdayPlayed, selections: [autoRow(AWAY, 'aq', 14.2, 3)] },
  // No captain named yet: "If you do not choose, your captain will be ...".
  'lineup-captain-auto': { page: 'team', flag: 'true', user: 'f0', card: 'CAPTAIN', games: upcoming, selections: [], auto: { [HOME]: autoReply('hq', 20, 3) } },
  // No Wild Slot player named yet: "If you do not choose, the system will pick ...".
  'lineup-wild-slot': { page: 'team', flag: 'true', user: 'f0', card: 'WILD_SLOT', games: upcoming, selections: [], auto: { [HOME]: autoReply('hb1', 15.4, 3) } },
  // The named Wild Slot player was dropped before kickoff: shown as void, choose again, with the automatic pick that applies otherwise.
  'lineup-wild-slot-void': { page: 'team', flag: 'true', user: 'f0', card: 'WILD_SLOT', games: upcoming, selections: [{ season_franchise_id: HOME, athlete_id: 'gone', source: 'named', ...DROPPED }], auto: { [HOME]: autoReply('hb1', 15.4, 3) } },
  // Nobody was named before the automatic Wild Slot player's kickoff: recorded, locked, no choose control.
  'lineup-wild-slot-auto-locked': { page: 'team', flag: 'true', user: 'f0', card: 'WILD_SLOT', games: thursdayPlayed, selections: [autoRow(HOME, 'hb2', 9.8, 3)] },
  // Both sides: seed 1's void pick with its automatic replacement pending; seed 10's automatic pick shown as the system's choice.
  'matchup-wild-slot-auto': { page: 'matchup', flag: 'true', user: 'f0', card: 'WILD_SLOT', games: upcoming, selections: [{ season_franchise_id: HOME, athlete_id: 'gone', source: 'named', ...DROPPED }], auto: { [HOME]: autoReply('hb1', 15.4, 3), [AWAY]: autoReply('ab1', 12.1, 3) },
    build: { home: side(HOME, [{ ...line('wild_slot', 'hb1'), points: 0, automatic: true, expected: 15.4, games: 3 }]), away: side(AWAY, [{ ...line('wild_slot', 'ab1'), points: 0, automatic: true, expected: 12.1, games: 3 }]) } },
  // The lower seed has not raided yet: the normal bench picker, and "If you do not choose, the system will pick ...".
  'lineup-raid-lower-seed': { page: 'team', flag: 'true', user: 'f9', card: 'RAID', games: upcoming, selections: [], auto: { [AWAY]: { ...autoReply('hb1', 15.4, 3), penalty: false } } },
  'lineup-raid-higher-seed': { page: 'team', flag: 'true', user: 'f0', card: 'RAID', games: upcoming, selections: [{ season_franchise_id: AWAY, athlete_id: 'hb1' }] },
  // The raided player was dropped by the higher seed before the deadline: void, choose again.
  'lineup-raid-void': { page: 'team', flag: 'true', user: 'f9', card: 'RAID', games: upcoming, selections: [{ season_franchise_id: AWAY, athlete_id: 'gone', source: 'named', ...DROPPED }], auto: { [AWAY]: { ...autoReply('hb1', 15.4, 3), penalty: false } } },
  // RAID PENALTY: the higher seed has no bench, so the picker offers exactly its best-ranked starter and says why.
  'lineup-raid-penalty': { page: 'team', flag: 'true', user: 'f9', card: 'RAID', games: upcoming, noHomeBench: true, selections: [], auto: { [AWAY]: { ...autoReply('hq', 20, 3), penalty: true } } },
  // After the deadline nobody had raided: the system's raid, recorded, no choose control.
  'lineup-raid-auto-locked': { page: 'team', flag: 'true', user: 'f9', card: 'RAID', games: thursdayPlayed, selections: [{ ...autoRow(AWAY, 'hb1', 15.4, 3), details: { basis: 'recent_average_v1', expected: 15.4, games: 3, penalty: false } }] },
  // The higher seed's lineup page after a penalty raid: its starter is taken, stays in the lineup, and the notice says so.
  'lineup-raid-higher-seed-penalty': { page: 'team', flag: 'true', user: 'f0', card: 'RAID', games: upcoming, noHomeBench: true, selections: [{ season_franchise_id: AWAY, athlete_id: 'hq', source: 'named', locked_at: hours(-2), details: { penalty: true } }] },
  // Matchup page, automatic penalty raid made at the deadline, with "Automatic penalty raid" on the score build-up.
  'matchup-raid-auto-penalty': { page: 'matchup', flag: 'true', user: 'f9', card: 'RAID', games: thursdayPlayed, noHomeBench: true, selections: [{ ...autoRow(AWAY, 'hq', 20, 3), details: { basis: 'recent_average_v1', expected: 20, games: 3, penalty: true } }],
    build: { home: side(HOME, []), away: side(AWAY, [{ ...line('raid', 'hq'), automatic: true, penalty: true, expected: 20, games: 3 }]) } },
  // Inert states: these must render NO card surface.
  'matchup-flag-off': { page: 'matchup', flag: '', user: 'f0', card: 'CAPTAIN', games: upcoming, selections: [], expectNoCard: true },
  'lineup-flag-off': { page: 'team', flag: '', user: 'f0', card: 'CAPTAIN', games: upcoming, selections: [], expectNoCard: true },
  'matchup-flag-on-no-deal': { page: 'matchup', flag: 'true', user: 'f0', card: null, games: upcoming, selections: [], expectNoCard: true },
  'lineup-flag-on-no-deal': { page: 'team', flag: 'true', user: 'f0', card: null, games: upcoming, selections: [], expectNoCard: true },
};
let scenario = scenarios['matchup-captain'];

function tables() {
  const s = scenario;
  const home = s.build?.home.total ?? baseOf(HOME), away = s.build?.away.total ?? baseOf(AWAY);
  const matchup = { id: 'chaos-matchup', league_season_id: 'season', week: 13, event_type: 'chaos', home_season_franchise_id: HOME, away_season_franchise_id: AWAY, home_points: home, away_points: away, is_final: !!s.final, winner_season_franchise_id: s.final ? (home > away ? HOME : AWAY) : null,
    context: { home_seed: 1, away_seed: 10, format: 'standings_inversion', ...(s.card && s.build ? { chaos_cards: { version: 1, card_code: s.card, ...s.build } } : {}) } };
  return {
    matchups: [matchup], season_franchises: seasonFranchises, franchises, standings, lineups,
    // noHomeBench: the higher seed has dropped every bench player (the raid penalty scenarios).
    roster_entries: s.noHomeBench ? rosterEntries.filter((row) => !homeBenchIds.has(row.athlete_id)) : rosterEntries,
    athletes: [goneAthlete, ...cast.map((c) => ({ id: c[0], ...athleteRef(c) }))], real_teams: Object.entries(teamAbbr).map(([id, abbreviation]) => ({ id, abbreviation, display_name: abbreviation })),
    league_seasons: [{ id: 'season', league_id: 'fixture', competition_season_id: 'cs', is_current: true, trade_deadline_at: null, roster_integrity_mode: 'open' }],
    franchise_owners: [{ franchise_id: s.user, user_id: 'qa', ends_on: null }],
    fantasy_player_scores: playerScores, fantasy_team_scores: teamScores,
    real_games: s.games.map((g) => ({ ...g, competition_season_id: 'cs', week: 13 })),
    chaos_card_draws: s.card ? [{ matchup_id: 'chaos-matchup', card_code: s.card, revealed_at: hours(-48) }] : [],
    chaos_card_selections: s.selections.map((row) => ({ matchup_id: 'chaos-matchup', card_code: s.card, real_team_id: null, locked_at: null, ...row })),
  };
}
// A stub query builder that honours eq / in / is filters on columns the rows have.
const db = {
  auth: { getUser: async () => ({ data: { user: { id: 'qa', user_metadata: {} } } }) },
  // chaos_auto_pick (and chaos_auto_captain): a fixed stand-in for the database reply; the ranking is tested in supabase/tests.
  rpc: async (name, args) => ({ data: name === 'chaos_auto_pick' || name === 'chaos_auto_captain' ? (scenario.auto?.[args.p_season_franchise_id] ?? null) : null, error: null }),
  from(table) {
    const filters = []; let single = false;
    const run = () => {
      const rows = (tables()[table] ?? []).filter((row) => filters.every(([kind, column, value]) => !(column in row) || (kind === 'in' ? value.includes(row[column]) : kind === 'is' ? (row[column] ?? null) === value : row[column] === value)));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    const q = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve) => resolve(run());
      if (key === 'maybeSingle' || key === 'single') return () => { single = true; return q; };
      if (key === 'eq' || key === 'in' || key === 'is') return (column, value) => { filters.push([key, column, value]); return q; };
      return () => q;
    } });
    return q;
  },
};
const original = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === 'next/navigation') return { notFound() { throw Error('Not found'); }, redirect(p) { throw Error('Redirect ' + p); }, usePathname: () => (scenario.page === 'matchup' ? '/matchups/chaos-matchup' : '/franchises/' + scenario.user + '/team'), useRouter: () => ({ refresh() {} }) };
  if (/supabase\/(server|client)$/.test(request)) return { createClient: () => db };
  if (/\/chaosCardActions$/.test(request)) return { setChaosCardSelection: async (state) => state };
  if (/\/actions$/.test(request)) return new Proxy({}, { get: (_, name) => (name === '__esModule' ? true : () => { throw Error('Mutation disabled in visual fixture'); }) });
  return original.call(this, request, parent, ...args);
};
const Matchup = require(path.join(app, 'matchups/[matchupId]/page.tsx')).default, Team = require(path.join(app, 'franchises/[franchiseId]/team/page.tsx')).default, Nav = require(path.join(app, 'components/BigExecMobileNavClient.tsx')).default;
const items = [{ label: 'Front Office', icon: 'office', href: '/leagues/fixture' }, { label: 'Matchup', icon: 'matchup', href: '/matchups/chaos-matchup' }, { label: 'Locker Room', icon: 'locker', href: '/leagues/fixture/locker-room' }, { label: 'League', icon: 'league', href: '/leagues/fixture/schedule' }, { label: 'Stadium', icon: 'stadium', href: '/franchises/f0/stadium' }];
// The same stylesheets, in the same order, as apps/web/app/layout.tsx.
const css = ['globals', 'brand', 'brand-polish', 'dashboard', 'gate5', 'mobile-nav', 'forms-gate5', 'stadium-gate5', 'ops', 'product-shell', 'chaos-cards'].map((x) => fs.readFileSync(path.join(app, x + '.css'), 'utf8')).join('\n');
async function html(name) {
  scenario = scenarios[name];
  process.env.CHAOS_CARDS_ENABLED = scenario.flag;
  const content = scenario.page === 'matchup'
    ? await Matchup({ params: Promise.resolve({ matchupId: 'chaos-matchup' }), searchParams: Promise.resolve({}) })
    : await Team({ params: Promise.resolve({ franchiseId: scenario.user }), searchParams: Promise.resolve({ week: '13' }) });
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Big Exec · visual fixture</title><style>' + css + '</style></head><body><a class="skipLink" href="#main-content">Skip to main content</a><div id="main-content" tabindex="-1">' + renderToStaticMarkup(content) + '</div>' + renderToStaticMarkup(React.createElement(Nav, { items })) + '<footer style="padding:20px;color:#d5d9d2;font:12px Arial">VISUAL TEST FIXTURE · Synthetic data · No production actions</footer></body></html>';
}

(async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname;
      if (route.startsWith('/environments/') || route.startsWith('/brand/')) { res.setHeader('Content-Type', route.endsWith('.webp') ? 'image/webp' : route.endsWith('.png') ? 'image/png' : 'image/jpeg'); res.end(fs.readFileSync(path.join(root, 'apps/web/public', route))); }
      else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await html(route.slice(1))); }
    } catch (error) { res.statusCode = 500; res.end(String(error.stack)); }
  });
  await new Promise((resolve) => server.listen(4319, '127.0.0.1', resolve));
  const { chromium } = require('playwright'); const options = {};
  if (process.env.QA_BROWSER_EXECUTABLE) { options.executablePath = process.env.QA_BROWSER_EXECUTABLE; options.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const browser = await chromium.launch(options); const checks = [];
  try {
    for (const width of [1440, 390]) {
      for (const reducedMotion of width === 1440 ? ['no-preference'] : ['no-preference', 'reduce']) {
        const page = await browser.newPage({ viewport: { width, height: width > 900 ? 1050 : 844 }, deviceScaleFactor: 1, reducedMotion });
        for (const name of Object.keys(scenarios)) {
          await page.goto('http://127.0.0.1:4319/' + name);
          await page.evaluate(() => document.fonts.ready);
          if (!(await page.title()).includes('visual fixture')) throw Error(name + ': ' + (await page.locator('body').innerText()).slice(0, 600));
          const panels = await page.locator('.chaosCardPanel').count();
          const check = { name, width, reducedMotion, cardPanels: panels };
          check.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          check.overflowOffenders = check.overflow ? await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((e) => ({ tag: e.tagName, class: String(e.className).slice(0, 60), inCard: !!e.closest('.chaosCardPanel') }))) : [];
          if (scenarios[name].expectNoCard) {
            // Flag off, or flag on with no deal: nothing about cards may be in the document.
            check.cardText = await page.evaluate(() => /RULE CARD|chaosCard|Captain|Wild Slot|Raid/.test(document.getElementById('main-content').innerHTML));
            checks.push(check); continue;
          }
          if (reducedMotion === 'reduce') {
            check.motion = await page.evaluate(() => Array.from(document.querySelectorAll('.chaosCardPanel, .chaosCardPanel *')).filter((e) => { const s = getComputedStyle(e); return (s.animationName !== 'none' && s.animationDuration !== '0s') || (s.transitionDuration.split(',').some((d) => parseFloat(d) > 0)); }).length);
            checks.push(check); continue;
          }
          check.panelOverflow = await page.evaluate(() => Array.from(document.querySelectorAll('.chaosCardPanel *')).filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).length);
          // Every control in the card must be at least 44 CSS px in both directions.
          check.smallTargets = await page.evaluate(() => Array.from(document.querySelectorAll('.chaosCardPanel a, .chaosCardPanel button, .chaosCardPanel label.chaosChoice')).map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((t) => t.w < 44 || t.h < 44));
          await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
          const axe = await page.evaluate(async () => await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
          check.axe = axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) }));
          check.axeInCard = check.axe.filter((v) => v.nodes.some((n) => String(n.target).includes('chaos'))).map((v) => v.id);
          // A tall viewport for the pictures, so fixed and sticky shell elements (bottom nav, franchise nav) do not overlap a card that is taller than the phone screen.
          await page.setViewportSize({ width, height: 3200 });
          await page.locator('.chaosCardPanel').first().screenshot({ path: path.join(out, `${name}-${width}.png`) });
          // Keyboard: Tab to the first choice, move with arrow keys, and confirm a visible focus ring.
          if (await page.locator('.chaosChoice input').count()) {
            await page.locator('.chaosCardPanel a').first().focus();
            await page.keyboard.press('Tab');
            check.focusOnRadio = await page.evaluate(() => document.activeElement?.matches('.chaosChoice input[type=radio]'));
            await page.keyboard.press('ArrowDown');
            check.keyboardSelected = await page.evaluate(() => document.activeElement?.matches('.chaosChoice input[type=radio]:checked'));
            check.focusRing = await page.evaluate(() => { const s = getComputedStyle(document.activeElement.closest('.chaosChoice')); return s.outlineStyle + ' ' + s.outlineWidth; });
            await page.keyboard.press('Tab');
            check.focusOnSubmit = await page.evaluate(() => document.activeElement?.matches('.chaosSelectionForm button[type=submit]'));
            await page.keyboard.press('Shift+Tab');
            await page.locator('.chaosCardPanel').first().screenshot({ path: path.join(out, `${name}-${width}-keyboard-focus.png`) });
          }
          await page.setViewportSize({ width, height: width > 900 ? 1050 : 844 });
          checks.push(check);
        }
        await page.close();
      }
    }
    fs.writeFileSync(path.join(out, 'layout-checks.json'), JSON.stringify(checks, null, 2));
    console.log(JSON.stringify(checks.map((x) => ({ name: x.name, width: x.width, rm: x.reducedMotion, panels: x.cardPanels, overflow: x.overflow, panelOverflow: x.panelOverflow, small: x.smallTargets, axe: x.axe?.map((a) => a.id), axeInCard: x.axeInCard, cardText: x.cardText, motion: x.motion, focus: [x.focusOnRadio, x.keyboardSelected, x.focusRing, x.focusOnSubmit] })), null, 1));
    // Page-level overflow only counts against the cards when the same page does not overflow with the flag off.
    const baselineOverflow = (x) => checks.some((b) => b.name === (scenarios[x.name].page === 'matchup' ? 'matchup-flag-off' : 'lineup-flag-off') && b.width === x.width && b.reducedMotion === x.reducedMotion && b.overflow);
    const bad = checks.filter((x) => (scenarios[x.name].expectNoCard ? x.cardPanels !== 0 || x.cardText : x.cardPanels !== 1 || (x.overflow && !baselineOverflow(x)) || x.overflowOffenders?.some((o) => o.inCard) || x.panelOverflow || x.smallTargets?.length || x.axe?.length || x.motion || (x.focusOnRadio !== undefined && !(x.focusOnRadio && x.keyboardSelected && x.focusOnSubmit && /^solid/.test(x.focusRing)))));
    if (bad.length) { console.error('FAILED: ' + bad.map((x) => `${x.name}@${x.width}`).join(', ')); process.exitCode = 1; }
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
