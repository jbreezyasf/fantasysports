import type { AssistantGmToolResponse } from './tools';

type Player = {
  id?: string;
  display_name?: string;
  displayName?: string;
  position?: string;
  team?: string;
  real_teams?: { abbreviation?: string | null } | Array<{ abbreviation?: string | null }> | null;
  availability?: string;
  injury_status?: string | null;
  injuryStatus?: string | null;
  overallRank?: number;
  rankingScore?: number | null;
};
type PlayerSearchData = { query?: string; position?: string; players?: Player[]; source?: string };
type PlayerDetailsData = { athlete?: Player; availability?: string; injuryStatus?: string | null };
type ComparePlayersData = { players?: Array<Player | { id: string; error: string }>; source?: string };

export type PlayerSearchIntent = 'player_details' | 'compare_players' | 'best_available' | 'available_by_position';

function first<T>(value: T | T[] | null | undefined) {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function successfulData<T>(responses: AssistantGmToolResponse[], tool: AssistantGmToolResponse['tool']) {
  const response = responses.find((item) => item.tool === tool);
  return response?.ok ? response.data as T : null;
}

function failedToolMessage(tool: string) {
  return `I cannot retrieve verified player state right now. Required tool failed or was missing: ${tool}.`;
}

function playerName(player: Player) {
  return player.display_name ?? player.displayName ?? 'Player';
}

function playerTeam(player: Player) {
  return player.team ?? first(player.real_teams)?.abbreviation ?? 'FA';
}

function playerLabel(player: Player) {
  return `${playerName(player)}${player.position ? `, ${player.position}` : ''}, ${playerTeam(player)}`;
}

function isAvailable(player: Player) {
  return (player.availability ?? '').toLowerCase() === 'available';
}

function isMissingPlayer(player: Player | { id: string; error: string }): player is { id: string; error: string } {
  return 'error' in player;
}

export function answerPlayerSearchIntent(intent: PlayerSearchIntent, toolResponses: AssistantGmToolResponse[]) {
  if (intent === 'player_details') {
    const details = successfulData<PlayerDetailsData>(toolResponses, 'getPlayerDetails');
    const search = successfulData<PlayerSearchData>(toolResponses, 'searchPlayers');
    if (!details && !search) return failedToolMessage('getPlayerDetails or searchPlayers');
    if (search && !details) {
      const players = search.players ?? [];
      if (players.length > 1) return `Which player did you mean? ${players.slice(0, 5).map(playerLabel).join('; ')}.`;
      if (players.length === 0) return `I could not find a verified player match for ${search.query ?? 'that search'}.`;
      const player = players[0];
      return `${playerLabel(player)}. Availability: ${player.availability ?? 'Unknown'}. Injury status: ${player.injury_status ?? player.injuryStatus ?? 'Not available'}.`;
    }
    const player = details?.athlete;
    if (!player) return 'I cannot retrieve verified details for that player right now.';
    return `${playerLabel(player)}. Availability: ${details.availability ?? player.availability ?? 'Unknown'}. Injury status: ${details.injuryStatus ?? player.injury_status ?? 'Not available'}.`;
  }

  if (intent === 'compare_players') {
    const comparison = successfulData<ComparePlayersData>(toolResponses, 'comparePlayers');
    if (!comparison) return failedToolMessage('comparePlayers');
    const players = comparison.players ?? [];
    const missing = players.filter(isMissingPlayer);
    if (missing.length) return `I cannot compare all requested players because ${missing.map((player) => player.id).join(', ')} could not be verified.`;
    const verifiedPlayers = players.filter((player): player is Player => !isMissingPlayer(player));
    return `Verified comparison${comparison.source ? ` from ${comparison.source}` : ''}: ${verifiedPlayers.map((player) => `${playerLabel(player)} is ${player.availability ?? 'availability unknown'}${player.injury_status || player.injuryStatus ? `, injury ${player.injury_status ?? player.injuryStatus}` : ''}`).join('; ')}.`;
  }

  const searchTool = intent === 'best_available' ? 'getAvailablePlayers' : 'searchPlayers';
  const search = successfulData<PlayerSearchData>(toolResponses, searchTool);
  if (!search) return failedToolMessage(searchTool);
  const available = (search.players ?? []).filter(isAvailable);
  if (!available.length) return `I found no verified available players${search.position ? ` at ${search.position}` : ''}.`;
  const sorted = [...available].sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER));
  const shown = sorted.slice(0, 5);
  const source = search.source ?? 'current Big Exec player pool and roster ownership';

  if (intent === 'best_available') {
    return `Best verified available players, source: ${source}. ${shown.map(playerLabel).join('; ')}.`;
  }

  return `Verified available ${search.position ?? 'players'}, source: ${source}. ${shown.map(playerLabel).join('; ')}.`;
}
