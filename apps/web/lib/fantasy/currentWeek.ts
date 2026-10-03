type RealGameWeek = { week: number; starts_at: string };
type RealGameWeekState = RealGameWeek & { state?: string | null };

export const FIRST_LINEUP_WEEK = 1;
export const LAST_LINEUP_WEEK = 18;

// A game in one of these states will not produce any more fantasy scoring for its week.
const settledGameStates = new Set(['final', 'canceled', 'postponed']);

function validGames<T extends RealGameWeek>(games: T[]) {
  return games.filter(game => Number.isInteger(game.week) && !Number.isNaN(Date.parse(game.starts_at)));
}

// Latest competition week with a game that has kicked off; the first scheduled week before
// the season starts; null when no schedule is available.
export function currentCompetitionWeek(games: RealGameWeek[], now = new Date()) {
  const ordered = validGames(games).sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at));
  const started = ordered.filter(game => Date.parse(game.starts_at) <= now.getTime());
  return started.at(-1)?.week ?? ordered[0]?.week ?? null;
}

// The week a manager should be setting a lineup for. Same as currentCompetitionWeek, except
// that once every game of that week is settled it rolls forward to the next scheduled week.
// It stays on the last week after the season ends, and stays on the in-progress week when
// game states are missing or stale (it never advances on a guess).
export function currentLineupWeek(games: RealGameWeekState[], now = new Date()) {
  const valid = validGames(games);
  const week = currentCompetitionWeek(valid, now);
  if (week === null) return null;
  const weekGames = valid.filter(game => game.week === week);
  const anyStarted = weekGames.some(game => Date.parse(game.starts_at) <= now.getTime());
  const allSettled = weekGames.every(game => settledGameStates.has(String(game.state ?? '').toLowerCase()));
  if (!anyStarted || !allSettled) return week;
  const laterWeeks = valid.map(game => game.week).filter(candidate => candidate > week);
  return laterWeeks.length ? Math.min(...laterWeeks) : week;
}

function clampWeek(week: number) {
  return Math.max(FIRST_LINEUP_WEEK, Math.min(LAST_LINEUP_WEEK, Math.trunc(week)));
}

// True when the request carries a usable explicit week (so no schedule lookup is needed).
export function hasExplicitWeek(param: string | string[] | undefined) {
  const raw = Array.isArray(param) ? param[0] : param;
  return typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw));
}

// Explicit ?week=N wins and is clamped into range. A missing or non-numeric value falls back
// to the league's current week, and only to the first week when no schedule is known.
export function resolveLineupWeek(param: string | string[] | undefined, currentWeek: number | null | undefined) {
  if (hasExplicitWeek(param)) return clampWeek(Number(Array.isArray(param) ? param[0] : param));
  return typeof currentWeek === 'number' && Number.isFinite(currentWeek) ? clampWeek(currentWeek) : FIRST_LINEUP_WEEK;
}
