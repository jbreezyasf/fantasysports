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
  chaosAssetLabels,
  chaosCardAllStrings,
  chaosCardSurface,
  chaosCardsEnabled,
  chaosLineupBlockedIds,
  chaosLowerSeedSide,
  chaosPenaltyRaidedId,
  chaosSelectionView,
  chaosUnlistedSelectionIds,
  firstKickoff,
  presentAutoCaptain,
  presentAutoPick,
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
    expect(CHAOS_CARD_CATALOG.CAPTAIN.rules).toContain("becomes captain automatically and is locked in at that player's kickoff");
    expect(translateMessage(CHAOS_CARD_CATALOG.CAPTAIN.rules)).toContain('pasa a ser capitán automáticamente y queda fijado');
    expect(chaosCardAllStrings().some((text) => /no bonus/i.test(text))).toBe(false);
  });

  it('says in the Wild Slot and Raid rules what happens when nobody chooses, and the raid penalty (changed 2026-10-04)', () => {
    expect(CHAOS_CARD_CATALOG.WILD_SLOT.rules).toContain("If no player is named, the non-starting player with the highest recent scoring average is used automatically and is locked in at that player's kickoff.");
    expect(translateMessage(CHAOS_CARD_CATALOG.WILD_SLOT.rules)).toContain('se usa automáticamente al jugador no titular con el mejor promedio reciente de puntos');
    expect(CHAOS_CARD_CATALOG.RAID.rules).toMatch(/If no raid is made by the deadline, the bench player with the highest recent scoring average is raided automatically\. If the higher seed has no eligible bench player, the raid takes its best-ranked starter instead\.$/);
    expect(translateMessage(CHAOS_CARD_CATALOG.RAID.rules)).toMatch(/se asalta automáticamente al jugador de la banca.*el asalto se lleva a su titular mejor clasificado\.$/);
    // The old "nothing happens" wording is gone.
    expect(chaosCardAllStrings().some((text) => /Nothing changes|No extra points\.$/.test(text) && !/no automatic Wild Slot player/.test(text))).toBe(false);
    expect(CHAOS_CARD_STRINGS.raidPenalty).toContain('The higher seed keeps the starter in its lineup and still scores them.');
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
    expect(build?.home).toEqual({ base: 56.5, total: 76.5, lines: [{ effect: 'captain', label: 'Captain bonus', athleteId: 'a1', realTeamId: null, points: 20, automatic: false, penalty: false, expected: null, games: null }] });
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
    expect(build?.home.lines[0]).toEqual({ effect: 'captain', label: 'Automatic captain', athleteId: 'a1', realTeamId: null, points: 20, automatic: true, penalty: false, expected: 20, games: 3 });
    expect(build?.away.lines[0]).toMatchObject({ label: 'Automatic captain', realTeamId: 't2', points: -1, automatic: true, expected: null, games: 0 });
    expect([adjustmentLabel('captain', true), adjustmentLabel('captain'), adjustmentLabel('twist', true)]).toEqual(['Automatic captain', 'Captain bonus', 'Card twist']);
  });

  it('labels automatic Wild Slot and raid lines, and penalty raids, on the build-up (changed 2026-10-04: not only a captain line can be automatic)', () => {
    const wild = presentChaosScoreBuild({
      card_code: 'WILD_SLOT',
      home: { base: 56.5, total: 62.5, adjustments: [{ effect: 'wild_slot', athlete_id: 'hb2', real_team_id: null, points: 6, automatic: true, locked_at: '2026-12-04T01:15:00+00:00', basis: 'recent_average_v1', expected: 12, games: 3, season_total: 36, compared: [], replaced: { athlete_id: 'hb1', reason: 'dropped' } }] },
      away: { base: 42, total: 55, adjustments: [{ effect: 'wild_slot', athlete_id: 'ab1', real_team_id: null, points: 13 }] },
    });
    expect(wild?.home.lines[0]).toEqual({ effect: 'wild_slot', label: 'Automatic Wild Slot player', athleteId: 'hb2', realTeamId: null, points: 6, automatic: true, penalty: false, expected: 12, games: 3 });
    expect(wild?.away.lines[0]).toMatchObject({ label: 'Wild Slot player', automatic: false, penalty: false, expected: null });
    const raid = (line: Record<string, unknown>) => presentChaosScoreBuild({ card_code: 'RAID', home: { base: 56.5, total: 56.5, adjustments: [] }, away: { base: 42, total: 62, adjustments: [{ effect: 'raid', athlete_id: 'hq', real_team_id: null, points: 20, ...line }] } })?.away.lines[0];
    expect(raid({})).toMatchObject({ label: 'Raided player', automatic: false, penalty: false });
    expect(raid({ automatic: true, penalty: false, expected: 30, games: 3 })).toMatchObject({ label: 'Automatic raid', automatic: true, penalty: false, expected: 30, games: 3 });
    expect(raid({ penalty: true })).toMatchObject({ label: 'Penalty raid', automatic: false, penalty: true });
    expect(raid({ automatic: true, penalty: true, expected: 20, games: 3 })).toMatchObject({ label: 'Automatic penalty raid', automatic: true, penalty: true });
    // A twist line is never automatic, and only a raid line can be a penalty.
    expect(presentChaosScoreBuild({ card_code: 'TWIST_K_TRIPLE', home: { base: 1, total: 2, adjustments: [{ effect: 'twist', athlete_id: 'x', points: 1, automatic: true, penalty: true }] }, away: { base: 1, total: 1, adjustments: [] } })?.home.lines[0]).toMatchObject({ label: 'Card twist', automatic: false, penalty: false });
    expect([adjustmentLabel('wild_slot', true), adjustmentLabel('raid', true), adjustmentLabel('raid', false, true), adjustmentLabel('raid', true, true), adjustmentLabel('captain', false, true), adjustmentLabel('wild_slot', false, true)]).toEqual(['Automatic Wild Slot player', 'Automatic raid', 'Penalty raid', 'Automatic penalty raid', 'Captain bonus', 'Wild Slot player']);
    for (const label of ['Automatic Wild Slot player', 'Automatic raid', 'Penalty raid', 'Automatic penalty raid']) expect(translateMessage(label), label).not.toBe(label);
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
    expect(presentAutoCaptain(reply, own)).toEqual({ asset: own[0], expected: 20, games: 3, locked: false, penalty: false });
    expect(presentAutoCaptain({ ...reply, locked_at: '2026-12-04T01:15:00+00:00' }, own)?.locked).toBe(true);
    expect(presentAutoCaptain({ ...reply, expected: '18.50' }, own)?.expected).toBe(18.5);
    expect(presentAutoCaptain({ ...reply, expected: null, games: 0 }, own)).toEqual({ asset: own[0], expected: null, games: 0, locked: false, penalty: false });
    expect(presentAutoCaptain({ athlete_id: null, real_team_id: 't9', expected: 7, games: 3 }, [{ key: 'team:t9', athleteId: null, realTeamId: 't9', teamId: 't9', label: 'ZZZ D/ST', isStarter: true }])?.asset.label).toBe('ZZZ D/ST');
    expect(presentAutoCaptain(null, own)).toBeNull();
    expect(presentAutoCaptain({}, own)).toBeNull();
    expect(presentAutoCaptain({ ...reply, athlete_id: 'wr-bench' }, own)).toBeNull();
    expect(presentAutoCaptain({ ...reply, athlete_id: 'unknown' }, own)).toBeNull();
  });

  it('before its kickoff it is a preview and the manager can still choose', () => {
    const before = chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply });
    expect(before.autoCaptain).toEqual({ asset: own[0], expected: 20, games: 3, locked: false, penalty: false });
    expect(before).toMatchObject({ status: 'open', current: null });
    expect(before.candidates.map((item) => item.athleteId)).toEqual(['qb', 'te']);
    // A later game has kicked off for someone else, but the database still reports a preview: the choice stays open.
    const sundayCandidate = chaosSelectionView({ ...base, kind: 'captain', autoCaptain: { ...reply, athlete_id: 'te' }, now: AFTER_FIRST });
    expect(sundayCandidate).toMatchObject({ status: 'open', autoCaptain: { asset: { athleteId: 'te' }, locked: false } });
    expect(sundayCandidate.candidates.map((item) => item.athleteId)).toEqual(['te']);
  });

  it('LOCKS at kickoff: once the database reports the lock, there is nothing to choose, recorded or not', () => {
    const due = chaosSelectionView({ ...base, kind: 'captain', autoCaptain: { ...reply, locked_at: '2026-12-04T01:15:00+00:00' }, now: AFTER_FIRST });
    expect(due).toMatchObject({ status: 'locked', statusLabel: 'Locked', canClear: false, candidates: [], message: CHAOS_CARD_STRINGS.autoCaptainLockedReason, autoCaptain: { asset: { athleteId: 'qb' }, locked: true } });
    const recorded = chaosSelectionView({ ...base, kind: 'captain', now: AFTER_FIRST, selection: { ...pick('qb', 'CAPTAIN'), source: 'automatic', locked_at: '2026-12-04T01:15:00+00:00', details: { expected: 20, games: 3, basis: 'recent_average_v1' } } });
    expect(recorded).toMatchObject({ status: 'locked', canClear: false, candidates: [], currentCounts: true, message: CHAOS_CARD_STRINGS.autoCaptainLockedReason });
    expect(recorded.autoCaptain).toEqual({ asset: own[0], expected: 20, games: 3, locked: true, penalty: false });
    expect(recorded.current?.athleteId).toBe('qb');
    const over = chaosSelectionView({ ...base, kind: 'captain', matchupFinal: true, selection: { ...pick('qb', 'CAPTAIN'), source: 'automatic', details: { expected: 20, games: 3 } } });
    expect(over).toMatchObject({ status: 'closed', statusLabel: 'Final', autoCaptain: { locked: true } });
  });

  it('gives way to a named captain who counts, and returns when the named captain was moved to the bench', () => {
    expect(chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, selection: pick('te', 'CAPTAIN') }).autoCaptain).toBeNull();
    const namedLocked = chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, selection: { ...pick('qb', 'CAPTAIN'), source: 'named' }, now: AFTER_FIRST });
    expect(namedLocked).toMatchObject({ status: 'locked', autoCaptain: null, message: CHAOS_SELECTION_TEXT.captain.lockedReason });
    expect(chaosSelectionView({ ...base, kind: 'captain', autoCaptain: reply, selection: pick('rb-bench', 'CAPTAIN') }).autoCaptain?.asset.athleteId).toBe('qb');
    // A benched named captain does not keep the choice open once the automatic captain has locked.
    expect(chaosSelectionView({ ...base, kind: 'captain', autoCaptain: { ...reply, locked_at: '2026-12-04T01:15:00+00:00' }, selection: pick('rb-bench', 'CAPTAIN'), now: AFTER_FIRST })).toMatchObject({ status: 'locked', candidates: [], autoCaptain: { locked: true } });
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

describe('automatic Wild Slot (owner decision 2026-10-04)', () => {
  // The reply of chaos_auto_pick(matchup, franchise, 'wild_slot'); this module only presents it.
  const reply = { athlete_id: 'wr-bench', real_team_id: null, basis: 'recent_average_v1', expected: 30, games: 3, season_total: 90, locked_at: null, compared: [] };
  const LOCK = '2026-12-06T18:00:00+00:00';
  const AFTER_ALL = Date.parse('2026-12-06T19:00:00Z');

  it('reads the database reply and matches it to a NON-starter of the roster given; a starter or an unknown player is ignored', () => {
    expect(presentAutoPick('wild_slot', reply, own)).toEqual({ asset: own[2], expected: 30, games: 3, locked: false, penalty: false });
    expect(presentAutoPick('wild_slot', { ...reply, athlete_id: 'qb' }, own)).toBeNull();
    expect(presentAutoPick('wild_slot', { ...reply, athlete_id: 'unknown' }, own)).toBeNull();
    expect(presentAutoPick('wild_slot', { ...reply, penalty: true }, own)?.penalty).toBe(false);
    expect(presentAutoPick('wild_slot', null, own)).toBeNull();
  });

  it('before its kickoff it is a preview and the manager can still choose', () => {
    const view = chaosSelectionView({ ...base, kind: 'wild_slot', autoPick: reply });
    expect(view).toMatchObject({ status: 'open', current: null, voided: null, penalty: false, autoCaptain: null, autoPick: { asset: { athleteId: 'wr-bench' }, expected: 30, games: 3, locked: false } });
    expect(view.candidates.map((item) => item.athleteId)).toEqual(['wr-bench', 'rb-bench']);
    // After the first kickoff the database still reports a preview (the better-ranked player has not kicked off): the choice stays open.
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', autoPick: reply, now: AFTER_FIRST })).toMatchObject({ status: 'open', autoPick: { locked: false } });
  });

  it('LOCKS at kickoff: once the database reports the lock there is nothing to choose, recorded or not', () => {
    const due = chaosSelectionView({ ...base, kind: 'wild_slot', autoPick: { ...reply, locked_at: LOCK }, now: AFTER_ALL });
    expect(due).toMatchObject({ status: 'locked', statusLabel: 'Locked', canClear: false, candidates: [], current: null, message: CHAOS_CARD_STRINGS.autoWildLockedReason, autoPick: { asset: { athleteId: 'wr-bench' }, locked: true } });
    const recorded = chaosSelectionView({ ...base, kind: 'wild_slot', now: AFTER_ALL, autoPick: null, selection: { ...pick('wr-bench', 'WILD_SLOT'), source: 'automatic', locked_at: LOCK, details: { expected: 30, games: 3, basis: 'recent_average_v1' } } });
    expect(recorded).toMatchObject({ status: 'locked', canClear: false, candidates: [], currentCounts: true, message: CHAOS_CARD_STRINGS.autoWildLockedReason });
    expect(recorded.autoPick).toEqual({ asset: own[2], expected: 30, games: 3, locked: true, penalty: false });
    expect(recorded.current?.athleteId).toBe('wr-bench');
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', matchupFinal: true, selection: { ...pick('wr-bench', 'WILD_SLOT'), source: 'automatic', details: { expected: 30, games: 3 } } })).toMatchObject({ status: 'closed', statusLabel: 'Final', autoPick: { locked: true } });
  });

  it('gives way to a named pick that counts', () => {
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', autoPick: reply, selection: pick('rb-bench', 'WILD_SLOT') })).toMatchObject({ status: 'open', autoPick: null, currentCounts: true });
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', autoPick: reply, selection: { ...pick('rb-bench', 'WILD_SLOT'), source: 'named' }, now: AFTER_FIRST })).toMatchObject({ status: 'locked', autoPick: null, message: CHAOS_SELECTION_TEXT.wild_slot.lockedReason });
  });

  it('with no eligible non-starter there is no automatic pick', () => {
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', autoPick: null })).toMatchObject({ status: 'open', autoPick: null, current: null });
  });
});

describe('void selections (owner decision 2026-10-04)', () => {
  const dropped = { voided_at: '2026-12-02T15:00:00+00:00', void_reason: 'dropped' };

  it('WILD SLOT: a pick whose player left the roster before kickoff is shown as void and the manager chooses again', () => {
    const view = chaosSelectionView({ ...base, kind: 'wild_slot', selection: { ...pick('gone', 'WILD_SLOT'), ...dropped }, autoPick: { athlete_id: 'wr-bench', real_team_id: null, expected: 30, games: 3 }, assetLabels: { gone: 'Dropped Player • WR • CCC' } });
    expect(view).toMatchObject({ status: 'open', current: null, currentCounts: false, canClear: false, voided: { athleteId: 'gone', label: 'Dropped Player • WR • CCC' }, autoPick: { asset: { athleteId: 'wr-bench' }, locked: false } });
    expect(view.candidates.map((item) => item.athleteId)).toEqual(['wr-bench', 'rb-bench']);
    // Without a looked-up name the placeholder is used; a void pick never locks the choice, even after its former kickoff.
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', selection: { ...pick('gone', 'WILD_SLOT'), ...dropped }, now: AFTER_FIRST })).toMatchObject({ status: 'open', voided: { label: 'Selected player' } });
    // If the automatic pick has locked in the meantime, the void row is still shown as void and nothing can be chosen.
    expect(chaosSelectionView({ ...base, kind: 'wild_slot', selection: { ...pick('gone', 'WILD_SLOT'), ...dropped }, autoPick: { athlete_id: 'rb-bench', real_team_id: null, expected: 12, games: 3, locked_at: '2026-12-04T01:15:00+00:00' }, now: AFTER_FIRST })).toMatchObject({ status: 'locked', voided: { athleteId: 'gone' }, candidates: [], autoPick: { locked: true } });
  });

  it('RAID: a void raid is open again before the deadline, and replaced by the system after it', () => {
    const before = chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: true, selection: { ...pick('gone', 'RAID'), ...dropped }, autoPick: { athlete_id: 'opp-wr-bench', real_team_id: null, expected: 30, games: 3, penalty: false } });
    expect(before).toMatchObject({ status: 'open', current: null, voided: { athleteId: 'gone' }, penalty: false, autoPick: { asset: { athleteId: 'opp-wr-bench' }, locked: false } });
    expect(before.candidates.map((item) => item.athleteId)).toEqual(['opp-wr-bench', 'opp-rb-bench']);
    const after = chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: true, now: AFTER_FIRST, selection: { ...pick('gone', 'RAID'), ...dropped }, autoPick: { athlete_id: 'opp-wr-bench', real_team_id: null, expected: 30, games: 3, penalty: false, locked_at: '2026-12-04T01:15:00+00:00' } });
    expect(after).toMatchObject({ status: 'locked', candidates: [], voided: { athleteId: 'gone' }, message: CHAOS_CARD_STRINGS.autoRaidLockedReason, autoPick: { locked: true } });
  });

  it('a captain row is never treated as void by this flag (a benched captain is handled by the lineup)', () => {
    expect(chaosSelectionView({ ...base, kind: 'captain', selection: { ...pick('qb', 'CAPTAIN'), ...dropped } })).toMatchObject({ voided: null, current: { athleteId: 'qb' }, currentCounts: true });
  });
});

describe('automatic raid and the raid penalty (owner decision 2026-10-04)', () => {
  // The reply of chaos_auto_pick(matchup, raider, 'raid').
  const reply = { athlete_id: 'opp-wr-bench', real_team_id: null, basis: 'recent_average_v1', expected: 30, games: 3, season_total: 90, locked_at: null, penalty: false, deadline: '2026-12-04T01:15:00+00:00', compared: [] };
  const penalty = { ...reply, athlete_id: 'opp-qb', expected: 20, penalty: true };
  const raider = { ...base, kind: 'raid' as const, isLowerSeed: true };

  it('reads the reply against the OPPONENT roster: a bench player normally, a starter only when the reply says penalty', () => {
    expect(presentAutoPick('raid', reply, opponent)).toEqual({ asset: opponent[1], expected: 30, games: 3, locked: false, penalty: false });
    expect(presentAutoPick('raid', penalty, opponent)).toEqual({ asset: opponent[0], expected: 20, games: 3, locked: false, penalty: true });
    expect(presentAutoPick('raid', { ...reply, athlete_id: 'opp-qb' }, opponent)).toBeNull();
    expect(presentAutoPick('raid', { ...penalty, athlete_id: 'opp-wr-bench' }, opponent)).toBeNull();
    expect(presentAutoPick('raid', reply, own)).toBeNull();
  });

  it('before the deadline: shows the raid the system would make, and the lower seed can still choose any bench player', () => {
    const view = chaosSelectionView({ ...raider, autoPick: reply });
    expect(view).toMatchObject({ status: 'open', penalty: false, autoPick: { asset: { athleteId: 'opp-wr-bench' }, locked: false, penalty: false }, deadlineAt: '2026-12-04T01:15:00Z' });
    expect(view.candidates.map((item) => item.athleteId)).toEqual(['opp-wr-bench', 'opp-rb-bench']);
    expect(chaosSelectionView({ ...base, kind: 'raid', isLowerSeed: false, autoPick: reply })).toMatchObject({ status: 'not_eligible', autoPick: null, penalty: false });
  });

  it('PENALTY: with no eligible bench player the picker offers exactly the one starter, and says so', () => {
    const view = chaosSelectionView({ ...raider, autoPick: penalty });
    expect(view).toMatchObject({ status: 'open', penalty: true, autoPick: { asset: { athleteId: 'opp-qb' }, penalty: true, locked: false } });
    expect(view.candidates.map((item) => item.athleteId)).toEqual(['opp-qb']);
    // Even if the opponent's roster still lists bench players (on a bye, so not eligible), only the starter is offered.
    expect(view.candidates).toHaveLength(1);
    const made = chaosSelectionView({ ...raider, selection: { ...pick('opp-qb', 'RAID'), source: 'named', details: { penalty: true } } });
    expect(made).toMatchObject({ status: 'locked', penalty: true, currentCounts: true, autoPick: null, message: CHAOS_SELECTION_TEXT.raid.lockedReason, current: { athleteId: 'opp-qb' } });
  });

  it('after the deadline the system makes the raid: due (not yet recorded) and recorded read the same', () => {
    const due = chaosSelectionView({ ...raider, now: AFTER_FIRST, autoPick: { ...reply, locked_at: reply.deadline } });
    expect(due).toMatchObject({ status: 'locked', candidates: [], message: CHAOS_CARD_STRINGS.autoRaidLockedReason, autoPick: { asset: { athleteId: 'opp-wr-bench' }, locked: true, penalty: false } });
    const recorded = chaosSelectionView({ ...raider, now: AFTER_FIRST, selection: { ...pick('opp-wr-bench', 'RAID'), source: 'automatic', locked_at: reply.deadline, details: { expected: 30, games: 3, penalty: false } } });
    expect(recorded).toMatchObject({ status: 'locked', currentCounts: true, message: CHAOS_CARD_STRINGS.autoRaidLockedReason, penalty: false });
    expect(recorded.autoPick).toEqual({ asset: opponent[1], expected: 30, games: 3, locked: true, penalty: false });
    const recordedPenalty = chaosSelectionView({ ...raider, now: AFTER_FIRST, selection: { ...pick('opp-qb', 'RAID'), source: 'automatic', locked_at: reply.deadline, details: { expected: 20, games: 3, penalty: true } } });
    expect(recordedPenalty).toMatchObject({ status: 'locked', penalty: true, autoPick: { asset: { athleteId: 'opp-qb' }, locked: true, penalty: true } });
    // No reply at all after the deadline (nobody to raid): closed, as before.
    expect(chaosSelectionView({ ...raider, now: AFTER_FIRST, autoPick: null })).toMatchObject({ status: 'closed', message: CHAOS_RAID_DEADLINE_PASSED });
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

  it('a void selection blocks nothing, and a penalty raid does not lock the starter it took', () => {
    const voidRaid = [{ ...pick('x', 'RAID', 'sf-low'), voided_at: '2026-12-02T15:00:00+00:00', void_reason: 'dropped' }];
    expect(chaosLineupBlockedIds({ kind: 'raid', seasonFranchiseId: 'sf-high', selections: voidRaid, raiderSeasonFranchiseId: 'sf-low' })).toEqual([]);
    expect(chaosLineupBlockedIds({ kind: 'wild_slot', seasonFranchiseId: 'sf-a', selections: [{ ...pick('w', 'WILD_SLOT', 'sf-a'), voided_at: '2026-12-02T15:00:00+00:00' }], raiderSeasonFranchiseId: null })).toEqual([]);
    const penaltyRaid = [{ ...pick('starter', 'RAID', 'sf-low'), details: { penalty: true } }];
    expect(chaosLineupBlockedIds({ kind: 'raid', seasonFranchiseId: 'sf-high', selections: penaltyRaid, raiderSeasonFranchiseId: 'sf-low' })).toEqual([]);
    expect(chaosPenaltyRaidedId({ kind: 'raid', seasonFranchiseId: 'sf-high', selections: penaltyRaid, raiderSeasonFranchiseId: 'sf-low' })).toBe('starter');
    expect(chaosPenaltyRaidedId({ kind: 'raid', seasonFranchiseId: 'sf-low', selections: penaltyRaid, raiderSeasonFranchiseId: 'sf-low' })).toBeNull();
    expect(chaosPenaltyRaidedId({ kind: 'raid', seasonFranchiseId: 'sf-high', selections: [pick('x', 'RAID', 'sf-low')], raiderSeasonFranchiseId: 'sf-low' })).toBeNull();
    expect(chaosPenaltyRaidedId({ kind: 'raid', seasonFranchiseId: 'sf-high', selections: [{ ...penaltyRaid[0], voided_at: '2026-12-02T15:00:00+00:00' }], raiderSeasonFranchiseId: 'sf-low' })).toBeNull();
  });

  it('finds selected players who are no longer on a roster, and labels them from direct lookups', () => {
    const rows = [pick('qb', 'RAID'), pick('gone', 'RAID'), { season_franchise_id: 'sf', card_code: 'RAID', athlete_id: null, real_team_id: 't-gone' }, pick('gone', 'RAID')];
    expect(chaosUnlistedSelectionIds(rows, own)).toEqual({ athleteIds: ['gone'], teamIds: ['t-gone'] });
    expect(chaosUnlistedSelectionIds([], own)).toEqual({ athleteIds: [], teamIds: [] });
    expect(chaosAssetLabels([{ id: 'gone', display_name: 'Dropped Player', position: 'WR', real_teams: { abbreviation: 'CCC' } }, { id: 'fa', display_name: 'No Team', position: 'RB', real_teams: null }], [{ id: 't-gone', abbreviation: 'ZZZ' }]))
      .toEqual({ gone: 'Dropped Player • WR • CCC', fa: 'No Team • RB • FA', 't-gone': 'ZZZ D/ST' });
  });
});
