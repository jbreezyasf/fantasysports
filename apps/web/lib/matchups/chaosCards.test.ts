import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { translateMessage } from '../../app/components/LocaleProvider';
import {
  CHAOS_CARD_CATALOG,
  CHAOS_CARD_STRINGS,
  CHAOS_RAID_DEADLINE_PASSED,
  CHAOS_SELECTION_TEXT,
  CHAOS_WEEK_CLOSED,
  adjustmentLabel,
  buildChaosAssets,
  chaosCardAllStrings,
  chaosCardSurface,
  chaosCardsEnabled,
  chaosLineupBlockedIds,
  chaosLowerSeedSide,
  chaosSelectionView,
  firstKickoff,
  presentAutoCaptain,
  presentChaosScoreBuild,
  selectionKind,
  signedPoints,
  teamGameStarted,
  weekGamesOver,
  type ChaosAsset,
  type ChaosGame,
} from './chaosCards';

const migration = readFileSync(fileURLToPath(new URL('../../../../supabase/migrations/20261004020000_chaos_week_rule_cards.sql', import.meta.url)), 'utf8');
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

const NOW = Date.parse('2026-12-03T12:00:00Z');
const draw = { matchup_id: 'm1', card_code: 'CAPTAIN', revealed_at: '2026-12-01T10:00:00Z' };
const ON = { CHAOS_CARDS_ENABLED: 'true' };

describe('CHAOS_CARDS_ENABLED flag', () => {
  it('is off by default and only on for explicit values', () => {
    expect(chaosCardsEnabled({})).toBe(false);
    for (const value of ['', '0', 'false', 'off', 'no', 'enabled', undefined]) expect(chaosCardsEnabled({ CHAOS_CARDS_ENABLED: value }), String(value)).toBe(false);
    for (const value of ['1', 'true', 'TRUE', ' on ', 'yes']) expect(chaosCardsEnabled({ CHAOS_CARDS_ENABLED: value }), value).toBe(true);
  });

  it('renders no card surface unless the flag is on AND a revealed draw exists for a Chaos Week game', () => {
    expect(chaosCardSurface({ env: ON, eventType: 'chaos', draw, now: NOW })?.code).toBe('CAPTAIN');
    expect(chaosCardSurface({ env: {}, eventType: 'chaos', draw, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: { CHAOS_CARDS_ENABLED: 'false' }, eventType: 'chaos', draw, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: 'chaos', draw: null, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: 'chaos', draw: undefined, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: 'chaos', draw: { ...draw, revealed_at: null }, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: 'chaos', draw: { ...draw, revealed_at: '2026-12-04T00:00:00Z' }, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: 'chaos', draw: { ...draw, revealed_at: 'not a date' }, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: 'circuit', draw, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: undefined, draw, now: NOW })).toBeNull();
    expect(chaosCardSurface({ env: ON, eventType: 'chaos', draw: { ...draw, card_code: 'SOMETHING_NEW' }, now: NOW })).toBeNull();
  });
});

describe('card catalog', () => {
  it('has the ten cards of the deck: four named cards and six scoring twists', () => {
    const cards = Object.values(CHAOS_CARD_CATALOG);
    expect(cards.map((card) => card.code).sort()).toEqual(['BOUNTY', 'CAPTAIN', 'RAID', 'TWIST_DST_DOUBLE', 'TWIST_FUMBLE_TRIPLE', 'TWIST_K_TRIPLE', 'TWIST_PASS_DOUBLE', 'TWIST_RUSH_DOUBLE', 'TWIST_TE_DOUBLE', 'WILD_SLOT']);
    expect(cards.filter((card) => card.kind === 'twist')).toHaveLength(6);
    for (const [code, card] of Object.entries(CHAOS_CARD_CATALOG)) expect(card.code).toBe(code);
  });

  it('matches the name, kind and English rules stored by the migration, word for word', () => {
    for (const card of Object.values(CHAOS_CARD_CATALOG)) {
      expect(migration, card.code).toContain(`(${sql(card.code)}, ${sql(card.kind)}, ${sql(card.name)}, `);
      expect(migration, `${card.code} rules`).toContain(`${sql(card.rules)},`);
    }
  });

  it('has a Spanish catalog entry for every string, and the Spanish rules equal the migration', () => {
    for (const text of chaosCardAllStrings()) {
      const spanish = translateMessage(text);
      expect(spanish, text).toBeTruthy();
      if (text !== 'Final') expect(spanish, text).not.toBe(text);
    }
    for (const card of Object.values(CHAOS_CARD_CATALOG)) {
      expect(migration, `${card.code} name_es`).toContain(`${sql(card.name)}, ${sql(translateMessage(card.name))},`);
      expect(migration, `${card.code} rules_es`).toContain(`${sql(translateMessage(card.rules))},`);
    }
  });

  it('uses no wagering language', () => {
    const banned = /\b(bet|bets|betting|wager|wagers|odds|jackpot|gamble|gambling|payout|stake|stakes|casino|ante|pot)\b/i;
    for (const text of chaosCardAllStrings()) {
      expect(banned.test(text), text).toBe(false);
      expect(/\b(apuesta|apuestas|apostar|casino|premio en dinero)\b/i.test(translateMessage(text)), text).toBe(false);
    }
  });

  it('names the Bounty card for both outcomes and no longer says a captain can be missed', () => {
    expect(CHAOS_CARD_CATALOG.BOUNTY).toMatchObject({ code: 'BOUNTY', kind: 'bounty', name: 'Bounty' });
    expect(translateMessage('Bounty')).toBe('Recompensa');
    expect(CHAOS_CARD_CATALOG.BOUNTY.rules).toMatch(/lower seed wins, it goes to the front.*higher seed wins, it moves up three places.*tie changes nothing/i);
    expect(translateMessage(CHAOS_CARD_CATALOG.BOUNTY.rules)).toMatch(/peor clasificación, pasa al frente.*mejor clasificado, sube tres puestos.*empate no cambia nada/i);
    expect('UPSET_BOUNTY' in CHAOS_CARD_CATALOG).toBe(false);
    expect(migration).not.toMatch(/UPSET_BOUNTY|Upset Bounty|Recompensa por Sorpresa/);
    expect(CHAOS_CARD_CATALOG.CAPTAIN.rules).toContain('becomes captain automatically');
    expect(translateMessage(CHAOS_CARD_CATALOG.CAPTAIN.rules)).toContain('pasa a ser capitán automáticamente');
    expect(chaosCardAllStrings().some((text) => /no bonus/i.test(text))).toBe(false);
  });

  it('knows which cards take a selection', () => {
    expect(Object.values(CHAOS_CARD_CATALOG).filter((card) => selectionKind(card.kind)).map((card) => card.code)).toEqual(['CAPTAIN', 'WILD_SLOT', 'RAID']);
    expect(selectionKind(null)).toBeNull();
  });
});

describe('score build-up from matchups.context', () => {
  const context = {
    home_seed: 1,
    away_seed: 10,
    chaos_cards: {
      version: 1,
      card_code: 'CAPTAIN',
      kind: 'captain',
      home: { base: 56.5, adjustments: [{ effect: 'captain', athlete_id: 'a1', real_team_id: null, points: 20 }], total: 76.5 },
      away: { base: '42.00', adjustments: [], total: '42.00' },
    },
  };

  it('reads base, each line and total for both sides', () => {
    const build = presentChaosScoreBuild(context);
    expect(build?.cardCode).toBe('CAPTAIN');
    expect(build?.home).toEqual({ base: 56.5, total: 76.5, lines: [{ effect: 'captain', label: 'Captain bonus', athleteId: 'a1', realTeamId: null, points: 20, automatic: false, expected: null, games: null }] });
    expect(build?.away).toEqual({ base: 42, total: 42, lines: [] });
    expect(build?.bounty).toBeNull();
    expect(presentChaosScoreBuild(context.chaos_cards)?.home.total).toBe(76.5);
  });

  it('reads a recorded bounty and negative twist lines', () => {
    const build = presentChaosScoreBuild({
      chaos_cards: { card_code: 'BOUNTY', home: { base: 60, adjustments: [], total: 60 }, away: { base: 150, adjustments: [], total: 150 }, bounty: { season_franchise_id: 'sf6', grant: 'first', effective_until: '2026-12-15T01:15:00Z' } },
    });
    expect(build?.bounty).toEqual({ seasonFranchiseId: 'sf6', grant: 'first', effectiveUntil: '2026-12-15T01:15:00Z' });
    const favourite = presentChaosScoreBuild({ card_code: 'BOUNTY', home: { base: 150, adjustments: [], total: 150 }, away: { base: 60, adjustments: [], total: 60 }, bounty: { season_franchise_id: 'sf1', grant: 'up_three', effective_until: null } });
    expect(favourite?.bounty).toEqual({ seasonFranchiseId: 'sf1', grant: 'up_three', effectiveUntil: null });
    expect(presentChaosScoreBuild({ card_code: 'UPSET_BOUNTY', home: { base: 1, adjustments: [], total: 1 }, away: { base: 1, adjustments: [], total: 1 } })).toBeNull();
    const twist = presentChaosScoreBuild({ card_code: 'TWIST_DST_DOUBLE', home: { base: 10, adjustments: [], total: 10 }, away: { base: 42, adjustments: [{ effect: 'twist', athlete_id: null, real_team_id: 't2', points: -1 }], total: 41 } });
    expect(twist?.away.lines[0]).toMatchObject({ label: 'Card twist', realTeamId: 't2', points: -1 });
  });

  it('returns nothing for a matchup with no card, an unknown card or a malformed record', () => {
    expect(presentChaosScoreBuild(null)).toBeNull();
    expect(presentChaosScoreBuild({ home_seed: 1, away_seed: 10 })).toBeNull();
    expect(presentChaosScoreBuild({ chaos_cards: { ...context.chaos_cards, card_code: 'NOPE' } })).toBeNull();
    expect(presentChaosScoreBuild({ chaos_cards: { ...context.chaos_cards, away: null } })).toBeNull();
    expect(presentChaosScoreBuild({ chaos_cards: { ...context.chaos_cards, home: { base: 'x', adjustments: [], total: 1 } } })).toBeNull();
    expect(presentChaosScoreBuild({ chaos_cards: { ...context.chaos_cards, home: { base: 1, adjustments: [{ effect: 'mystery', points: 1 }], total: 2 } } })).toBeNull();
  });

  it('never shows a build-up that does not add up to the stored total', () => {
    expect(presentChaosScoreBuild({ chaos_cards: { ...context.chaos_cards, home: { base: 56.5, adjustments: [{ effect: 'captain', athlete_id: 'a1', points: 20 }], total: 80 } } })).toBeNull();
  });

  it('reads an automatic captain line: marked, labelled, with the average it was chosen on', () => {
    const build = presentChaosScoreBuild({
      card_code: 'CAPTAIN',
      home: { base: 56.5, total: 76.5, adjustments: [{ effect: 'captain', athlete_id: 'a1', real_team_id: null, points: 20, automatic: true, basis: 'recent_average_v1', expected: 20, games: 3, season_total: 100, compared: [{ athlete_id: 'a1', real_team_id: null, expected: 20, games: 3, season_total: 100 }] }] },
      away: { base: 42, total: 41, adjustments: [{ effect: 'captain', athlete_id: null, real_team_id: 't2', points: -1, automatic: true, basis: 'recent_average_v1', expected: null, games: 0, season_total: 0, compared: [] }] },
    });
    expect(build?.home.lines[0]).toEqual({ effect: 'captain', label: 'Automatic captain', athleteId: 'a1', realTeamId: null, points: 20, automatic: true, expected: 20, games: 3 });
    expect(build?.away.lines[0]).toMatchObject({ label: 'Automatic captain', realTeamId: 't2', points: -1, automatic: true, expected: null, games: 0 });
    // Only a captain line can be automatic.
    expect(presentChaosScoreBuild({ card_code: 'WILD_SLOT', home: { base: 1, total: 2, adjustments: [{ effect: 'wild_slot', athlete_id: 'x', points: 1, automatic: true }] }, away: { base: 1, total: 1, adjustments: [] } })?.home.lines[0]).toMatchObject({ label: 'Wild Slot player', automatic: false });
    expect([adjustmentLabel('captain', true), adjustmentLabel('captain'), adjustmentLabel('twist', true)]).toEqual(['Automatic captain', 'Captain bonus', 'Card twist']);
  });

  it('formats signed points and labels each effect', () => {
    expect([signedPoints(20), signedPoints(-4), signedPoints(0)]).toEqual(['+20.00', '−4.00', '0.00']);
    expect(['captain', 'wild_slot', 'raid', 'twist'].map((effect) => adjustmentLabel(effect))).toEqual(['Captain bonus', 'Wild Slot player', 'Raided player', 'Card twist']);
  });

  it('finds the lower seed from the seeds the generator recorded', () => {
    expect(chaosLowerSeedSide({ home_seed: 1, away_seed: 10 })).toBe('away');
    expect(chaosLowerSeedSide({ home_seed: '9', away_seed: '2' })).toBe('home');
    expect(chaosLowerSeedSide({ home_seed: 3, away_seed: 3 })).toBeNull();
    expect(chaosLowerSeedSide({})).toBeNull();
    expect(chaosLowerSeedSide(null)).toBeNull();
  });
});

// T1-T2 kicks off Thursday night, T3-T4 on Sunday.
const games: ChaosGame[] = [
  { home_team_id: 't1', away_team_id: 't2', starts_at: '2026-12-04T01:15:00Z', state: 'scheduled' },
  { home_team_id: 't3', away_team_id: 't4', starts_at: '2026-12-06T18:00:00Z', state: 'scheduled' },
];
const BEFORE = Date.parse('2026-12-03T12:00:00Z');
const AFTER_FIRST = Date.parse('2026-12-04T02:00:00Z');
const asset = (id: string, teamId: string, isStarter: boolean): ChaosAsset => ({ key: `athlete:${id}`, athleteId: id, realTeamId: null, teamId, label: id, isStarter });
const own = [asset('qb', 't1', true), asset('te', 't3', true), asset('wr-bench', 't3', false), asset('rb-bench', 't1', false)];
const opponent = [asset('opp-qb', 't2', true), asset('opp-wr-bench', 't4', false), asset('opp-rb-bench', 't2', false)];
const base = { isLowerSeed: false, ownAssets: own, opponentAssets: opponent, selection: null, games, matchupFinal: false, now: BEFORE };
const pick = (id: string, card: string, franchise = 'sf-own') => ({ season_franchise_id: franchise, card_code: card, athlete_id: id, real_team_id: null });

describe('kickoff helpers', () => {
  it('lock a team at kickoff, never for a canceled or postponed game', () => {
    expect(teamGameStarted('t1', games, BEFORE)).toBe(false);
    expect(teamGameStarted('t1', games, AFTER_FIRST)).toBe(true);
    expect(teamGameStarted('t3', games, AFTER_FIRST)).toBe(false);
    expect(teamGameStarted('t1', [{ ...games[0], state: 'postponed' }], AFTER_FIRST)).toBe(false);
    expect(teamGameStarted('t1', [{ ...games[0], state: 'canceled' }], AFTER_FIRST)).toBe(false);
    expect(teamGameStarted(null, games, AFTER_FIRST)).toBe(false);
    expect(firstKickoff(games)).toBe('2026-12-04T01:15:00Z');
    expect(firstKickoff([{ ...games[0], state: 'postponed' }, games[1]])).toBe('2026-12-06T18:00:00Z');
    expect(weekGamesOver(games)).toBe(false);
    expect(weekGamesOver(games.map((game) => ({ ...game, state: 'final' })))).toBe(true);
    expect(weekGamesOver([{ ...games[0], state: 'postponed' }])).toBe(false);
  });
});

describe('CAPTAIN selection view', () => {
  it('offers only starters whose game has not kicked off', () => {
    const view = chaosSelectionView({ ...base, kind: 'captain' });
    expect(view.status).toBe('open');
    expect(view.candidates.map((item) => item.athleteId)).toEqual(['qb', 'te']);
    expect(view.current).toBeNull();
    expect(view.canClear).toBe(false);
    expect(chaosSelectionView({ ...base, kind: 'captain', now: AFTER_FIRST }).candidates.map((item) => item.athleteId)).toEqual(['te']);
  });

  it('lets the captain be changed or cleared until that player kicks off, then locks', () => {
    const chosen = chaosSelectionView({ ...base, kind: 'captain', selection: pick('qb', 'CAPTAIN') });
    expect(chosen).toMatchObject({ status: 'open', canClear: true, currentCounts: true, deadlineAt: '2026-12-04T01:15:00Z' });
    expect(chosen.current?.athleteId).toBe('qb');
    expect(chosen.candidates.map((item) => item.athleteId)).toEqual(['te']);
    const locked = chaosSelectionView({ ...base, kind: 'captain', selection: pick('qb', 'CAPTAIN'), now: AFTER_FIRST });
    expect(locked).toMatchObject({ status: 'locked', statusLabel: 'Locked', canClear: false, message: CHAOS_SELECTION_TEXT.captain.lockedReason });
    expect(locked.candidates).toEqual([]);
  });

  it('treats a captain who was moved to the bench as not counting, and replaceable', () => {
    const view = chaosSelectionView({ ...base, kind: 'captain', selection: pick('rb-bench', 'CAPTAIN'), now: AFTER_FIRST });
    expect(view).toMatchObject({ status: 'open', currentCounts: false });
    expect(view.candidates.map((item) => item.athleteId)).toEqual(['te']);
  });

  it('closes when the week is over', () => {
    const over = games.map((game) => ({ ...game, state: 'final' }));
    expect(chaosSelectionView({ ...base, kind: 'captain', games: over, now: AFTER_FIRST + 1e9 })).toMatchObject({ status: 'closed', statusLabel: 'Final', message: CHAOS_WEEK_CLOSED });
    expect(chaosSelectionView({ ...base, kind: 'captain', matchupFinal: true, selection: pick('qb', 'CAPTAIN') })).toMatchObject({ status: 'closed', message: null, currentCounts: true });
  });
});

describe('automatic captain', () => {
  // The reply of the chaos_auto_captain database function; this module only presents it.
  const reply = { athlete_id: 'qb', real_team_id: null, basis: 'recent_average_v1', expected: 20, games: 3, weeks: [10, 11, 12], season_total: 100, compared: [] };

  it('reads the database reply and matches it to a starter; anything else is ignored', () => {
    expect(presentAutoCaptain(reply, own)).toEqual({ asset: own[0], expected: 20, games: 3 });
    expect(presentAutoCaptain({ ...reply, expected: '18.50' }, own)?.expected).toBe(18.5);
    expect(presentAutoCaptain({ ...reply, expected: null, games: 0 }, own)).toEqual({ asset: own[0], expected: null, games: 0 });
    expect(presentAutoCaptain({ athlete_id: null, real_team_id: 't9', expected: 7, games: 3 }, [{ key: 'team:t9', athleteId: null, realTeamId: 't9', teamId: 't9', label: 'ZZZ D/ST', isStarter: true }])?.asset.label).toBe('ZZZ D/ST');
    expect(presentAutoCaptain(null, own)).toBeNull();
    expect(presentAutoCaptain({}, own)).toBeNull();
    expect(presentAutoCaptain({ ...reply, athlete_id: 'wr-bench' }, own)).toBeNull();
    expect(presentAutoCaptain({ ...reply, athlete_id: 'unknown' }, own)).toBeNull();
  });

  it('is shown before a manager chooses, and as applied once that player has kicked off or the week is over', () => {
    const before = chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply });
    expect(before.autoCaptain).toEqual({ asset: own[0], expected: 20, games: 3, started: false });
    expect(before).toMatchObject({ status: 'open', current: null });
    expect(before.candidates.map((item) => item.athleteId)).toEqual(['qb', 'te']);
    const after = chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, now: AFTER_FIRST });
    expect(after.autoCaptain?.started).toBe(true);
    expect(after.status).toBe('open');
    const over = chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, matchupFinal: true });
    expect(over).toMatchObject({ status: 'closed', autoCaptain: { started: true } });
  });

  it('gives way to a named captain who counts, and returns when the named captain was moved to the bench', () => {
    expect(chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, selection: pick('te', 'CAPTAIN') }).autoCaptain).toBeNull();
    expect(chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, selection: pick('te', 'CAPTAIN'), now: AFTER_FIRST + 3 * 864e5 }).autoCaptain).toBeNull();
    expect(chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, selection: pick('rb-bench', 'CAPTAIN') }).autoCaptain?.asset.athleteId).toBe('qb');
  });

  it('follows whatever the database says after a lineup change, and exists only under CAPTAIN', () => {
    expect(chaosSelectionView({ ...base, kind: 'captain', autoCaptain: { ...reply, athlete_id: 'te', expected: 8, games: 1 } }).autoCaptain).toMatchObject({ asset: { athleteId: 'te' }, expected: 8, games: 1 });
    expect(chaosSelectionView({ ...base, kind: 'captain' }).autoCaptain).toBeNull();
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', autoCaptain: reply }).autoCaptain).toBeNull();
    expect(chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: true, autoCaptain: reply }).autoCaptain).toBeNull();
  });
});

describe('WILD SLOT selection view', () => {
  it('offers only non-starters whose game has not kicked off', () => {
    expect(chaosSelectionView({ ...base, kind: 'wild_slot' }).candidates.map((item) => item.athleteId)).toEqual(['wr-bench', 'rb-bench']);
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', now: AFTER_FIRST }).candidates.map((item) => item.athleteId)).toEqual(['wr-bench']);
  });

  it('locks at the pick’s kickoff', () => {
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', selection: pick('rb-bench', 'WILD_SLOT') })).toMatchObject({ status: 'open', canClear: true, currentCounts: true });
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', selection: pick('rb-bench', 'WILD_SLOT'), now: AFTER_FIRST })).toMatchObject({ status: 'locked', message: CHAOS_SELECTION_TEXT.wild_slot.lockedReason });
  });
});

describe('RAID selection view', () => {
  it('gives the higher seed nothing to choose', () => {
    expect(chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: false })).toMatchObject({ status: 'not_eligible', message: CHAOS_CARD_STRINGS.raidOnlyLowerSeed, candidates: [] });
  });

  it('offers the lower seed the opponent’s bench only, with the first kickoff as the deadline', () => {
    const view = chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: true });
    expect(view).toMatchObject({ status: 'open', deadlineAt: '2026-12-04T01:15:00Z', canClear: false });
    expect(view.candidates.map((item) => item.athleteId)).toEqual(['opp-wr-bench', 'opp-rb-bench']);
  });

  it('closes at the first kickoff when no raid was made', () => {
    expect(chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: true, now: AFTER_FIRST })).toMatchObject({ status: 'closed', message: CHAOS_RAID_DEADLINE_PASSED, candidates: [] });
  });

  it('is final once made', () => {
    const view = chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: true, selection: pick('opp-wr-bench', 'RAID') });
    expect(view).toMatchObject({ status: 'locked', canClear: false, currentCounts: true, message: CHAOS_SELECTION_TEXT.raid.lockedReason });
    expect(view.current?.athleteId).toBe('opp-wr-bench');
  });
});

describe('roster helpers', () => {
  it('builds assets from roster and lineup rows, starters first', () => {
    const assets = buildChaosAssets(
      [
        { athlete_id: 'b', real_team_id: null, athletes: { display_name: 'Bench Back', position: 'RB', real_team_id: 't1', real_teams: { abbreviation: 'AAA' } } },
        { athlete_id: 'q', real_team_id: null, athletes: [{ display_name: 'Start Passer', position: 'QB', real_team_id: 't1', real_teams: [{ abbreviation: 'AAA' }] }] },
        { athlete_id: null, real_team_id: 't9', real_teams: { abbreviation: 'ZZZ' } },
      ],
      [
        { slot: 'QB', athlete_id: 'q', real_team_id: null },
        { slot: 'DST', athlete_id: null, real_team_id: 't9' },
        { slot: 'BENCH', athlete_id: 'b', real_team_id: null },
      ],
    );
    expect(assets.map((item) => [item.label, item.isStarter, item.teamId])).toEqual([
      ['Start Passer • QB • AAA', true, 't1'],
      ['ZZZ D/ST', true, 't9'],
      ['Bench Back • RB • AAA', false, 't1'],
    ]);
  });

  it('blocks a raided player for the lender and the Wild Slot pick for its own franchise, and nothing else', () => {
    const raid = [pick('x', 'RAID', 'sf-low')];
    expect(chaosLineupBlockedIds({ kind: 'raid', seasonFranchiseId: 'sf-high', selections: raid, raiderSeasonFranchiseId: 'sf-low' })).toEqual(['x']);
    expect(chaosLineupBlockedIds({ kind: 'raid', seasonFranchiseId: 'sf-low', selections: raid, raiderSeasonFranchiseId: 'sf-low' })).toEqual([]);
    const wild = [pick('w', 'WILD_SLOT', 'sf-a'), pick('v', 'WILD_SLOT', 'sf-b')];
    expect(chaosLineupBlockedIds({ kind: 'wild_slot', seasonFranchiseId: 'sf-a', selections: wild, raiderSeasonFranchiseId: null })).toEqual(['w']);
    expect(chaosLineupBlockedIds({ kind: 'captain', seasonFranchiseId: 'sf-a', selections: [pick('c', 'CAPTAIN', 'sf-a')], raiderSeasonFranchiseId: null })).toEqual([]);
  });
});
