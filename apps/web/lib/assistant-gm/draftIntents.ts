import { checkGrounding, unavailableStateMessage } from './grounding';
import type { AssistantGmToolResponse } from './tools';

type DraftStateData = {
  draft?: { id?: string; status?: string; current_pick?: number | null };
  picks?: Array<{ pick_number?: number; round_number?: number; round_pick?: number; season_franchise_id?: string; athlete_id?: string | null; real_team_id?: string | null; picked_at?: string | null; name?: string }>;
  requesterSeasonFranchiseId?: string | null;
};
type DraftAvailableData = {
  draftId?: string;
  rankings?: {
    source?: string;
    athletes?: Array<{ id?: string; displayName?: string; position?: string; team?: string; overallRank?: number }>;
    defenses?: Array<{ id?: string; displayName?: string; team?: string; overallRank?: number }>;
  };
};

export type DraftReadIntent = 'available_players' | 'best_position_available' | 'next_pick' | 'position_need' | 'recent_picks' | 'verify_player_available';

type DraftIntentOptions = {
  position?: string;
  playerName?: string;
  expectedCurrentPick?: number;
};

const starterNeeds = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'D/ST'];

function successfulData<T>(responses: AssistantGmToolResponse[], tool: AssistantGmToolResponse['tool']) {
  const response = responses.find((item) => item.tool === tool);
  return response?.ok ? response.data as T : null;
}

function toolFailed(toolResponses: AssistantGmToolResponse[], tool: AssistantGmToolResponse['tool']) {
  const response = toolResponses.find((item) => item.tool === tool);
  return !response || !response.ok;
}

function playerLabel(player: { displayName?: string; position?: string; team?: string }) {
  return `${player.displayName ?? 'Player'}${player.position ? `, ${player.position}` : ''}${player.team ? `, ${player.team}` : ''}`;
}

function allAvailable(data: DraftAvailableData) {
  return [
    ...(data.rankings?.athletes ?? []),
    ...(data.rankings?.defenses ?? []).map((team) => ({ ...team, displayName: `${team.team ?? team.displayName ?? 'Team'} D/ST`, position: 'D/ST' }))
  ].sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER));
}

function staleDraftMessage(state: DraftStateData | null, expectedCurrentPick?: number) {
  const currentPick = state?.draft?.current_pick;
  if (expectedCurrentPick !== undefined && currentPick !== undefined && currentPick !== null && expectedCurrentPick !== currentPick) {
    return `Draft state changed from pick ${expectedCurrentPick} to pick ${currentPick}. I need fresh draft data before answering.`;
  }
  return null;
}

export function answerDraftIntent(intent: DraftReadIntent, toolResponses: AssistantGmToolResponse[], options: DraftIntentOptions = {}) {
  const grounding = checkGrounding(['draft_status'], toolResponses);
  const unavailable = unavailableStateMessage(grounding);
  if (unavailable) return unavailable;

  const state = successfulData<DraftStateData>(toolResponses, 'getDraftState');
  const stale = staleDraftMessage(state, options.expectedCurrentPick);
  if (stale) return stale;

  if (intent === 'next_pick') {
    const currentPick = state?.draft?.current_pick ?? 1;
    const next = (state?.picks ?? []).find((pick) => !pick.picked_at && pick.pick_number !== undefined && pick.pick_number >= currentPick && pick.season_franchise_id === state?.requesterSeasonFranchiseId);
    if (!next) return 'I cannot find your next verified draft pick right now.';
    return `Your next verified pick is pick ${next.pick_number}, round ${next.round_number}, pick ${next.round_pick}.`;
  }

  if (intent === 'recent_picks') {
    const recent = (state?.picks ?? []).filter((pick) => pick.picked_at).slice(-5).reverse();
    if (!recent.length) return 'No verified draft picks have been made yet.';
    return `Recent verified picks: ${recent.map((pick) => `pick ${pick.pick_number}, ${pick.name ?? pick.athlete_id ?? pick.real_team_id ?? 'selected asset'}`).join('; ')}.`;
  }

  if (intent === 'position_need') {
    const mine = (state?.picks ?? []).filter((pick) => pick.season_franchise_id === state?.requesterSeasonFranchiseId && pick.picked_at);
    if (!state?.requesterSeasonFranchiseId) return 'I cannot identify your draft slot right now.';
    const filled = mine.map((pick) => pick.name ?? '').join(' ').toUpperCase();
    const needs = starterNeeds.filter((position) => !filled.includes(position)).slice(0, 5);
    if (!needs.length) return 'Your verified draft picks appear to cover the standard starter positions. Bench depth is the next need.';
    return `Verified starter positions still worth targeting: ${[...new Set(needs)].join(', ')}.`;
  }

  if (toolFailed(toolResponses, 'getDraftAvailablePlayers')) {
    return 'I cannot retrieve verified draft availability right now. Required tool failed or was missing: getDraftAvailablePlayers.';
  }
  const availableData = successfulData<DraftAvailableData>(toolResponses, 'getDraftAvailablePlayers');
  const available = allAvailable(availableData ?? {});
  const source = availableData?.rankings?.source ?? 'current draft picks and canonical draft rankings';

  if (intent === 'verify_player_available') {
    const name = (options.playerName ?? '').toLowerCase();
    if (!name) return 'Tell me which player to verify.';
    const match = available.find((player) => (player.displayName ?? '').toLowerCase().includes(name));
    if (!match) return `${options.playerName} is not in the verified available draft pool. I will not substitute another player.`;
    return `${playerLabel(match)} is verified available as of pick ${state?.draft?.current_pick ?? 'unknown'}.`;
  }

  const position = (options.position ?? 'ALL').toUpperCase();
  const filtered = available.filter((player) => position === 'ALL' || player.position === position || (position === 'FLEX' && ['RB', 'WR', 'TE'].includes(player.position ?? '')));
  if (!filtered.length) return `No verified draft-available players found for ${position}.`;
  const shown = filtered.slice(0, 5);

  if (intent === 'best_position_available') {
    return `Best verified ${position} available, source: ${source}. ${shown.map(playerLabel).join('; ')}.`;
  }

  return `Verified draft availability as of pick ${state?.draft?.current_pick ?? 'unknown'}, source: ${source}. ${shown.map(playerLabel).join('; ')}.`;
}
