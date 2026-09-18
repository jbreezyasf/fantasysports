export type LineupGame = {
  home_team_id: string;
  away_team_id: string;
  starts_at: string;
  state: string;
};

const movableAfterStartStates = new Set(['canceled', 'postponed']);

export function gameHasLocked(game: LineupGame | undefined, now = Date.now()) {
  if (!game) return false;
  return Date.parse(game.starts_at) <= now && !movableAfterStartStates.has(String(game.state).toLowerCase());
}

export function lineupGameByTeam(games: LineupGame[]) {
  const byTeam = new Map<string, LineupGame>();
  for (const game of games) {
    byTeam.set(game.home_team_id, game);
    byTeam.set(game.away_team_id, game);
  }
  return byTeam;
}

export function lineupLockExplanation(game: LineupGame | undefined) {
  if (!game) return 'No scheduled game found';
  return `Locked because the game started ${new Date(game.starts_at).toLocaleString()}`;
}
