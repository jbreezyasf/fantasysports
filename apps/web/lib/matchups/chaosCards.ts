// Chaos Week rule cards: flag, catalog text and presentation helpers.
//
// The database (migration 20261004020000) deals the cards, validates every
// selection and builds every score. This module never decides an outcome. It
// reads what the database recorded (chaos_card_draws, chaos_card_selections,
// matchups.context.chaos_cards) and turns it into text for the pages.
//
// Every string a manager can see is a static English sentence with a Spanish
// entry in the locale catalog (app/components/LocaleProvider.tsx). Names and
// numbers are kept out of those strings so the catalog can match them.

export type ChaosCardKind = 'captain' | 'wild_slot' | 'raid' | 'bounty' | 'twist';
export type ChaosCardCode =
  | 'CAPTAIN'
  | 'WILD_SLOT'
  | 'RAID'
  | 'BOUNTY'
  | 'TWIST_TE_DOUBLE'
  | 'TWIST_K_TRIPLE'
  | 'TWIST_DST_DOUBLE'
  | 'TWIST_RUSH_DOUBLE'
  | 'TWIST_PASS_DOUBLE'
  | 'TWIST_FUMBLE_TRIPLE';

export type ChaosCardText = { code: ChaosCardCode; kind: ChaosCardKind; name: string; rules: string };

/** OFF unless CHAOS_CARDS_ENABLED is exactly one of 1, true, on, yes. */
export function chaosCardsEnabled(env: Record<string, string | undefined> = process.env) {
  return ['1', 'true', 'on', 'yes'].includes(String(env.CHAOS_CARDS_ENABLED ?? '').trim().toLowerCase());
}

// The English name and rules text of each card, word for word what the
// migration stores in chaos_cards.name_en / rules_en (a unit test compares them).
export const CHAOS_CARD_CATALOG: Record<ChaosCardCode, ChaosCardText> = {
  CAPTAIN: {
    code: 'CAPTAIN',
    kind: 'captain',
    name: 'Captain',
    rules: "Each manager names one Week 13 starter as captain before that player's game kicks off. The captain's fantasy points count double in this matchup. If no captain is named, the starter with the highest recent scoring average becomes captain automatically and is locked in at that player's kickoff.",
  },
  WILD_SLOT: {
    code: 'WILD_SLOT',
    kind: 'wild_slot',
    name: 'Wild Slot',
    rules: "Each manager may name one extra player from their active roster, at any position, who is not already starting. That player's Week 13 points are added to the team total. Choose before that player's game kicks off.",
  },
  RAID: {
    code: 'RAID',
    kind: 'raid',
    name: 'Raid',
    rules: "The lower seed picks one player from the higher seed's bench before the first Week 13 kickoff. That player's Week 13 points are added to the lower seed's total. The player stays on the higher seed's roster but cannot start for them in Week 13.",
  },
  BOUNTY: {
    code: 'BOUNTY',
    kind: 'bounty',
    name: 'Bounty',
    rules: 'Whoever wins this matchup moves up the waiver order for the following fantasy week. If the lower seed wins, it goes to the front. If the higher seed wins, it moves up three places. A tie changes nothing.',
  },
  TWIST_TE_DOUBLE: { code: 'TWIST_TE_DOUBLE', kind: 'twist', name: 'Tight End Takeover', rules: 'Every starting tight end scores double for both teams.' },
  TWIST_K_TRIPLE: { code: 'TWIST_K_TRIPLE', kind: 'twist', name: 'Golden Boot', rules: 'Every starting kicker scores triple for both teams.' },
  TWIST_DST_DOUBLE: {
    code: 'TWIST_DST_DOUBLE',
    kind: 'twist',
    name: 'Iron Curtain',
    rules: 'Each starting defense and special teams unit scores double for both teams. Negative scores are doubled too.',
  },
  TWIST_RUSH_DOUBLE: { code: 'TWIST_RUSH_DOUBLE', kind: 'twist', name: 'Ground Control', rules: 'All rushing points scored by starters count double for both teams.' },
  TWIST_PASS_DOUBLE: {
    code: 'TWIST_PASS_DOUBLE',
    kind: 'twist',
    name: 'Air Show',
    rules: 'All passing points scored by starters count double for both teams. Interceptions are part of passing points, so they cost double too.',
  },
  TWIST_FUMBLE_TRIPLE: { code: 'TWIST_FUMBLE_TRIPLE', kind: 'twist', name: 'Slippery Hands', rules: 'Every fumble lost by a starter costs triple for both teams.' },
};

export const CHAOS_CARD_STRINGS = {
  eyebrow: 'CHAOS WEEK RULE CARD',
  dealtNote: 'Dealt by Big Exec from a recorded seed. Both teams play under the same card.',
  scoreHeading: 'How the score is built',
  base: 'Lineup total',
  total: 'Chaos Week total',
  noAdjustments: 'No card adjustments',
  selections: 'Selections',
  deadline: 'Deadline',
  locked: 'Locked',
  open: 'Open for changes',
  final: 'Final',
  notMade: 'Not made',
  lowerSeed: 'Lower seed',
  higherSeed: 'Higher seed',
  bountyEarnedFirst: 'Bounty earned: first in the waiver order until',
  bountyEarnedUp: 'Bounty earned: up three places in the waiver order until',
  bountyPending: 'Earned by whichever team wins. The lower seed goes to the front of the waiver order. The higher seed moves up three places.',
  bountyNotEarned: 'The game was tied. No bounty was earned.',
  autoCaptainIfNone: 'If you do not choose, your captain will be',
  autoCaptainIfNoneOther: 'If no captain is named, the captain will be',
  autoCaptain: 'Automatic captain',
  autoCaptainLocked: 'Automatic captain:',
  autoCaptainLockedSuffix: '(locked at kickoff)',
  autoCaptainLockedReason: "No captain was named before this player's game kicked off, so the automatic captain is fixed for the week.",
  autoCaptainReason: 'Chosen automatically: the starter with the highest average fantasy points per game over their last three scored weeks before Week 13.',
  autoCaptainNoHistory: 'Chosen automatically: no starter has a score before Week 13, so the first starter in a fixed order is used.',
  autoCaptainAverage: 'Average points per game',
  autoCaptainGames: 'Games counted',
  noSelectionNeeded: 'This card needs no selection. It applies to both lineups automatically.',
  controlsHeading: 'Your Chaos Week card',
  goToLineup: 'Make your selection',
  viewMatchup: 'View Chaos Week matchup',
  clear: 'Clear selection',
  saving: 'Saving',
  noCandidates: 'No eligible players right now.',
  raidOnlyLowerSeed: 'Only the lower seed raids. The higher seed has nothing to choose.',
  raidedNotice: 'Your opponent raided this player. They stay on your roster but cannot start for you this week.',
} as const;

type SelectionText = { legend: string; submit: string; current: string; none: string; deadline: string; lockedReason: string; saved: string; cleared: string; adjustment: string };

// One block of text per card that takes a selection.
export const CHAOS_SELECTION_TEXT: Record<'captain' | 'wild_slot' | 'raid', SelectionText> = {
  captain: {
    legend: 'Choose your captain',
    submit: 'Name captain',
    current: 'Captain',
    none: 'No captain named yet.',
    deadline: "Before your captain's game kicks off",
    lockedReason: "Your captain's game has started. The captain can no longer be changed.",
    saved: 'Captain saved.',
    cleared: 'Captain cleared.',
    adjustment: 'Captain bonus',
  },
  wild_slot: {
    legend: 'Choose your Wild Slot player',
    submit: 'Use Wild Slot',
    current: 'Wild Slot',
    none: 'No Wild Slot player named. No extra points.',
    deadline: "Before that player's game kicks off",
    lockedReason: "Your Wild Slot player's game has started. The pick can no longer be changed.",
    saved: 'Wild Slot saved.',
    cleared: 'Wild Slot cleared.',
    adjustment: 'Wild Slot player',
  },
  raid: {
    legend: "Choose one player from your opponent's bench",
    submit: 'Raid this player',
    current: 'Raid',
    none: 'No raid made. Nothing changes.',
    deadline: 'Before the first Week 13 kickoff. A raid cannot be changed once made.',
    lockedReason: 'Your raid is made and cannot be changed.',
    saved: 'Raid made.',
    cleared: '',
    adjustment: 'Raided player',
  },
};

export const CHAOS_TWIST_ADJUSTMENT = 'Card twist';
export const CHAOS_RAID_DEADLINE_PASSED = 'The raid deadline has passed. No raid was made.';
export const CHAOS_WEEK_CLOSED = 'Chaos Week is complete. Selections are closed.';

/** Every static string a card surface can show; each needs a Spanish catalog entry. */
export function chaosCardAllStrings(): string[] {
  return [
    ...Object.values(CHAOS_CARD_CATALOG).flatMap((card) => [card.name, card.rules]),
    ...Object.values(CHAOS_CARD_STRINGS),
    ...Object.values(CHAOS_SELECTION_TEXT).flatMap((text) => Object.values(text)),
    CHAOS_TWIST_ADJUSTMENT,
    CHAOS_RAID_DEADLINE_PASSED,
    CHAOS_WEEK_CLOSED,
  ].filter((value) => value !== '');
}

export function chaosCardText(code: unknown): ChaosCardText | null {
  return typeof code === 'string' && code in CHAOS_CARD_CATALOG ? CHAOS_CARD_CATALOG[code as ChaosCardCode] : null;
}

export function selectionKind(kind: ChaosCardKind | null | undefined): 'captain' | 'wild_slot' | 'raid' | null {
  return kind === 'captain' || kind === 'wild_slot' || kind === 'raid' ? kind : null;
}

export type ChaosDrawRow = { matchup_id: string; card_code: string; revealed_at: string | null; drawn_at?: string | null };

/**
 * The single gate for every card surface: the flag must be on AND the matchup
 * must have a revealed draw for a card this build knows. Anything else renders nothing.
 */
export function chaosCardSurface(input: { env?: Record<string, string | undefined>; eventType: string | null | undefined; draw: ChaosDrawRow | null | undefined; now?: number }): ChaosCardText | null {
  if (!chaosCardsEnabled(input.env ?? process.env)) return null;
  if (input.eventType !== 'chaos' || !input.draw?.revealed_at) return null;
  const revealed = Date.parse(input.draw.revealed_at);
  if (!Number.isFinite(revealed) || revealed > (input.now ?? Date.now())) return null;
  return chaosCardText(input.draw.card_code);
}

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const finite = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

/** `automatic` is true for a captain nobody named (chosen by the database, see chaos_auto_captain). */
export type ChaosAdjustmentLine = { effect: 'captain' | 'wild_slot' | 'raid' | 'twist'; label: string; athleteId: string | null; realTeamId: string | null; points: number; automatic: boolean; expected: number | null; games: number | null };
export type ChaosSideBuild = { base: number; lines: ChaosAdjustmentLine[]; total: number };
/** grant: 'first' when the lower seed won (front of the waiver order), 'up_three' when the higher seed won. */
export type ChaosBountyGrant = { seasonFranchiseId: string; grant: 'first' | 'up_three'; effectiveUntil: string | null };
export type ChaosScoreBuild = { cardCode: ChaosCardCode; home: ChaosSideBuild; away: ChaosSideBuild; bounty: ChaosBountyGrant | null };

export function adjustmentLabel(effect: string, automatic = false): string {
  if (effect === 'captain' && automatic) return CHAOS_CARD_STRINGS.autoCaptain;
  if (effect === 'captain' || effect === 'wild_slot' || effect === 'raid') return CHAOS_SELECTION_TEXT[effect].adjustment;
  return CHAOS_TWIST_ADJUSTMENT;
}

function side(value: unknown): ChaosSideBuild | null {
  const row = record(value);
  if (!row) return null;
  const base = finite(row.base);
  const total = finite(row.total);
  if (base === null || total === null) return null;
  const lines: ChaosAdjustmentLine[] = [];
  for (const item of Array.isArray(row.adjustments) ? row.adjustments : []) {
    const line = record(item);
    const points = finite(line?.points);
    const effect = line?.effect;
    if (!line || points === null || (effect !== 'captain' && effect !== 'wild_slot' && effect !== 'raid' && effect !== 'twist')) return null;
    const automatic = effect === 'captain' && line.automatic === true;
    lines.push({ effect, label: adjustmentLabel(effect, automatic), athleteId: typeof line.athlete_id === 'string' ? line.athlete_id : null, realTeamId: typeof line.real_team_id === 'string' ? line.real_team_id : null, points, automatic, expected: automatic ? finite(line.expected) : null, games: automatic ? finite(line.games) : null });
  }
  // Never show a build-up that does not add up to the stored total.
  if (Math.abs(base + lines.reduce((sum, line) => sum + line.points, 0) - total) > 0.005) return null;
  return { base, lines, total };
}

/** Reads matchups.context (or the chaos_cards record itself). Null when absent or malformed. */
export function presentChaosScoreBuild(source: unknown): ChaosScoreBuild | null {
  const outer = record(source);
  if (!outer) return null;
  const cards = record(outer.chaos_cards) ?? outer;
  const text = chaosCardText(cards.card_code);
  if (!text) return null;
  const home = side(cards.home);
  const away = side(cards.away);
  if (!home || !away) return null;
  const bounty = record(cards.bounty);
  return {
    cardCode: text.code,
    home,
    away,
    bounty: bounty && typeof bounty.season_franchise_id === 'string' ? { seasonFranchiseId: bounty.season_franchise_id, grant: bounty.grant === 'up_three' ? 'up_three' : 'first', effectiveUntil: typeof bounty.effective_until === 'string' ? bounty.effective_until : null } : null,
  };
}

export const signedPoints = (points: number) => `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points).toFixed(2)}`;

export type ChaosGame = { home_team_id: string | null; away_team_id: string | null; starts_at: string; state: string | null };
const notPlayed = (state: string | null | undefined) => ['canceled', 'postponed'].includes(String(state ?? '').toLowerCase());

/** Same rule as the database: a game locks its players at kickoff; canceled and postponed games never lock. */
export function teamGameStarted(teamId: string | null | undefined, games: ChaosGame[], now: number) {
  if (!teamId) return false;
  return games.some((game) => (game.home_team_id === teamId || game.away_team_id === teamId) && !notPlayed(game.state) && Date.parse(game.starts_at) <= now);
}

export function teamKickoff(teamId: string | null | undefined, games: ChaosGame[]): string | null {
  if (!teamId) return null;
  const starts = games.filter((game) => (game.home_team_id === teamId || game.away_team_id === teamId) && !notPlayed(game.state)).map((game) => game.starts_at).sort();
  return starts[0] ?? null;
}

export function firstKickoff(games: ChaosGame[]): string | null {
  return games.filter((game) => !notPlayed(game.state)).map((game) => game.starts_at).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

/** A game week is over when it has at least one played game and none is still open (as lineup_week_is_closed). */
export function weekGamesOver(games: ChaosGame[]) {
  const played = games.filter((game) => !notPlayed(game.state));
  return played.length > 0 && played.every((game) => String(game.state ?? '').toLowerCase() === 'final');
}

export type ChaosAsset = { key: string; athleteId: string | null; realTeamId: string | null; teamId: string | null; label: string; isStarter: boolean };
/** source 'automatic': the automatic captain, recorded by the database once that player's game had kicked off; details holds the averages compared. */
export type ChaosSelectionRow = { season_franchise_id: string; card_code: string; athlete_id: string | null; real_team_id: string | null; locked_at?: string | null; source?: string | null; details?: unknown };

/**
 * The captain the database will use when none is named: the reply of the
 * chaos_auto_captain RPC, matched to an asset. This module never ranks
 * starters itself, so the page cannot disagree with the score.
 */
export type ChaosAutoCaptain = {
  asset: ChaosAsset;
  /** Average fantasy points per game the choice is based on; null when the player has no earlier score. */
  expected: number | null;
  games: number;
  /** True once this player's game has kicked off: the captain is fixed for the week and nobody can be named. False while it is only a preview. */
  locked: boolean;
};

/** Reads the chaos_auto_captain reply. Null when there is none, it is malformed, or it names an asset that is not one of the starters given. */
export function presentAutoCaptain(source: unknown, starters: ChaosAsset[]): ChaosAutoCaptain | null {
  const row = record(source);
  if (!row) return null;
  const athleteId = typeof row.athlete_id === 'string' ? row.athlete_id : null;
  const realTeamId = typeof row.real_team_id === 'string' ? row.real_team_id : null;
  if (!athleteId && !realTeamId) return null;
  const asset = starters.find((item) => item.isStarter && (athleteId ? item.athleteId === athleteId : item.realTeamId === realTeamId));
  if (!asset) return null;
  return { asset, expected: finite(row.expected), games: finite(row.games) ?? 0, locked: typeof row.locked_at === 'string' && row.locked_at !== '' };
}

export type ChaosSelectionView = {
  kind: 'captain' | 'wild_slot' | 'raid';
  /** open: a choice can be made or changed. locked: a choice exists and is fixed. closed: no choice can be made any more. not_eligible: this side never chooses (the higher seed under RAID). */
  status: 'open' | 'locked' | 'closed' | 'not_eligible';
  statusLabel: string;
  message: string | null;
  current: ChaosAsset | null;
  /** The current choice still counts (a captain moved to the bench does not). */
  currentCounts: boolean;
  candidates: ChaosAsset[];
  canClear: boolean;
  deadlineText: string;
  deadlineAt: string | null;
  /** CAPTAIN only, and only while no named captain counts: the automatic captain, as a preview (locked: false) or fixed for the week (locked: true). */
  autoCaptain: ChaosAutoCaptain | null;
};

/**
 * What the selection control should offer. It mirrors the checks in
 * set_chaos_card_selection so the page does not offer a choice the database
 * will refuse; the database still makes the decision.
 */
export function chaosSelectionView(input: {
  kind: 'captain' | 'wild_slot' | 'raid';
  isLowerSeed: boolean;
  ownAssets: ChaosAsset[];
  opponentAssets: ChaosAsset[];
  selection: ChaosSelectionRow | null;
  games: ChaosGame[];
  matchupFinal: boolean;
  now: number;
  /** The chaos_auto_captain reply for this franchise (CAPTAIN only). */
  autoCaptain?: unknown;
}): ChaosSelectionView {
  const text = CHAOS_SELECTION_TEXT[input.kind];
  const pool = input.kind === 'raid' ? input.opponentAssets : input.ownAssets;
  const matches = (asset: ChaosAsset) => (input.selection?.athlete_id ? asset.athleteId === input.selection.athlete_id : !!input.selection?.real_team_id && asset.realTeamId === input.selection.real_team_id);
  const current = input.selection ? (pool.find(matches) ?? { key: input.selection.athlete_id ?? input.selection.real_team_id ?? 'selection', athleteId: input.selection.athlete_id, realTeamId: input.selection.real_team_id, teamId: input.selection.real_team_id, label: 'Selected player', isStarter: false }) : null;
  const started = (asset: ChaosAsset) => teamGameStarted(asset.teamId, input.games, input.now);
  const weekOver = input.matchupFinal || weekGamesOver(input.games);
  const first = firstKickoff(input.games);
  // The automatic captain: read from the recorded row when there is one, otherwise from the chaos_auto_captain reply (a preview, or a lock that scoring has not recorded yet).
  const details = record(input.selection?.details);
  const recordedAuto = input.kind === 'captain' && !!current && current.isStarter && input.selection?.source === 'automatic';
  const auto: ChaosAutoCaptain | null =
    input.kind !== 'captain' ? null : recordedAuto && current ? { asset: current, expected: finite(details?.expected), games: finite(details?.games) ?? 0, locked: true } : current?.isStarter ? null : presentAutoCaptain(input.autoCaptain, input.ownAssets);
  const base = { kind: input.kind, current, deadlineText: text.deadline, deadlineAt: input.kind === 'raid' ? first : current ? teamKickoff(current.teamId, input.games) : null };
  const view = (status: ChaosSelectionView['status'], message: string | null, candidates: ChaosAsset[], canClear: boolean, currentCounts: boolean): ChaosSelectionView => ({
    ...base,
    status,
    statusLabel: status === 'locked' ? CHAOS_CARD_STRINGS.locked : status === 'open' ? CHAOS_CARD_STRINGS.open : status === 'closed' ? (weekOver ? CHAOS_CARD_STRINGS.final : CHAOS_CARD_STRINGS.locked) : CHAOS_CARD_STRINGS.higherSeed,
    message,
    candidates,
    canClear,
    currentCounts,
    autoCaptain: auto,
  });

  if (input.kind === 'raid') {
    if (!input.isLowerSeed) return view('not_eligible', CHAOS_CARD_STRINGS.raidOnlyLowerSeed, [], false, false);
    if (current) return view('locked', text.lockedReason, [], false, true);
    if (weekOver) return view('closed', CHAOS_WEEK_CLOSED, [], false, false);
    if (!first || Date.parse(first) <= input.now) return view('closed', CHAOS_RAID_DEADLINE_PASSED, [], false, false);
    return view('open', null, pool.filter((asset) => !asset.isStarter && !started(asset)), false, false);
  }

  const currentCounts = !!current && (input.kind === 'captain' ? current.isStarter : !current.isStarter);
  // A captain who was moved to the bench no longer counts and may be replaced.
  const currentFixed = !!current && started(current) && (input.kind === 'wild_slot' || current.isStarter);
  // The captain locks at kickoff, named or automatic: once the automatic captain has kicked off there is nothing left to choose.
  if (auto?.locked) return view(weekOver ? 'closed' : 'locked', CHAOS_CARD_STRINGS.autoCaptainLockedReason, [], false, recordedAuto);
  if (weekOver) return view('closed', current ? null : CHAOS_WEEK_CLOSED, [], false, currentCounts);
  if (currentFixed) return view('locked', text.lockedReason, [], false, currentCounts);
  const candidates = pool.filter((asset) => (input.kind === 'captain' ? asset.isStarter : !asset.isStarter) && !started(asset) && !(current && matches(asset) && currentCounts));
  return view('open', null, candidates, !!current, currentCounts);
}

type TeamRef = { abbreviation?: string | null; display_name?: string | null };
type AthleteRef = { display_name?: string | null; position?: string | null; real_team_id?: string | null; real_teams?: TeamRef | TeamRef[] | null };
export type ChaosRosterRow = { athlete_id: string | null; real_team_id: string | null; athletes?: AthleteRef | AthleteRef[] | null; real_teams?: TeamRef | TeamRef[] | null };
export type ChaosLineupRow = { slot: string; athlete_id: string | null; real_team_id: string | null };
const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/** Roster rows plus that week's lineup rows, as the assets a selection can name. Starters first, in roster order. */
export function buildChaosAssets(roster: ChaosRosterRow[], lineup: ChaosLineupRow[]): ChaosAsset[] {
  const starters = new Set(lineup.filter((row) => row.slot !== 'BENCH').map((row) => row.athlete_id ?? row.real_team_id));
  const assets = roster.map((row): ChaosAsset => {
    if (row.athlete_id) {
      const athlete = first(row.athletes);
      const team = first(athlete?.real_teams);
      return {
        key: `athlete:${row.athlete_id}`,
        athleteId: row.athlete_id,
        realTeamId: null,
        teamId: athlete?.real_team_id ?? null,
        label: [athlete?.display_name ?? 'Athlete', athlete?.position, team?.abbreviation ?? 'FA'].filter(Boolean).join(' • '),
        isStarter: starters.has(row.athlete_id),
      };
    }
    const team = first(row.real_teams);
    return { key: `team:${row.real_team_id}`, athleteId: null, realTeamId: row.real_team_id, teamId: row.real_team_id, label: `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`, isStarter: starters.has(row.real_team_id) };
  });
  return [...assets.filter((asset) => asset.isStarter), ...assets.filter((asset) => !asset.isStarter)];
}

/** Which side is the lower seed (the larger seed number recorded by generate_chaos_week). Null when the seeds are missing or equal. */
export function chaosLowerSeedSide(context: unknown): 'home' | 'away' | null {
  const row = record(context);
  const home = finite(row?.home_seed);
  const away = finite(row?.away_seed);
  if (home === null || away === null || home === away) return null;
  return home > away ? 'home' : 'away';
}

/** Ids (athlete or team) this franchise may not move into its Week 13 lineup: players raided from it, and its own Wild Slot pick. */
export function chaosLineupBlockedIds(input: { kind: ChaosCardKind; seasonFranchiseId: string; selections: ChaosSelectionRow[]; raiderSeasonFranchiseId: string | null }): string[] {
  const ids: string[] = [];
  for (const selection of input.selections) {
    const id = selection.athlete_id ?? selection.real_team_id;
    if (!id) continue;
    if (input.kind === 'raid' && selection.season_franchise_id === input.raiderSeasonFranchiseId && input.raiderSeasonFranchiseId !== input.seasonFranchiseId) ids.push(id);
    if (input.kind === 'wild_slot' && selection.season_franchise_id === input.seasonFranchiseId) ids.push(id);
  }
  return ids;
}
