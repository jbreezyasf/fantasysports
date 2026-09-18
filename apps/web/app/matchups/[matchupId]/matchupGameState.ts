export type ScheduledGame = { starts_at: string; state: string };

const terminalStates = new Set(['final', 'canceled', 'postponed', 'abandoned']);

export function gameIsLive(game: ScheduledGame, now = Date.now()) {
  const state = String(game.state).toLowerCase();
  if (terminalStates.has(state)) return false;
  return ['in_progress', 'live', 'halftime'].includes(state) || Date.parse(game.starts_at) <= now;
}

