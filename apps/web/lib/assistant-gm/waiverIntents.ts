import { checkGrounding, unavailableStateMessage } from './grounding';
import type { AssistantGmToolResponse } from './tools';

type WaiverRulesData = { faabEnabled?: boolean; faabBalance?: number | null; priorityModel?: string; source?: string };
type WaiverStateData = {
  holds?: Array<{ id: string; clears_at?: string; athlete_id?: string | null; real_team_id?: string | null; athletes?: { display_name?: string; position?: string } | Array<{ display_name?: string; position?: string }> | null; real_teams?: { abbreviation?: string; display_name?: string } | Array<{ abbreviation?: string; display_name?: string }> | null }>;
  requesterClaims?: Array<{ id: string; waiver_hold_id: string; status: string; failure_reason?: string | null }>;
};
type AvailableData = {
  position?: string;
  players?: Array<{ display_name?: string; displayName?: string; position?: string; team?: string; availability?: string; overallRank?: number }>;
  source?: string;
};

export type WaiverReadIntent = 'faab_balance' | 'pending_claims' | 'recommend_add' | 'best_available';

type WaiverIntentOptions = { position?: string };

function successfulData<T>(responses: AssistantGmToolResponse[], tool: AssistantGmToolResponse['tool']) {
  const response = responses.find((item) => item.tool === tool);
  return response?.ok ? response.data as T : null;
}

function first<T>(value: T | T[] | null | undefined) {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function holdLabel(hold: NonNullable<WaiverStateData['holds']>[number]) {
  const athlete = first(hold.athletes);
  if (athlete) return `${athlete.position ?? 'Player'} ${athlete.display_name ?? 'Player'}`;
  const team = first(hold.real_teams);
  return `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`;
}

function playerLabel(player: NonNullable<AvailableData['players']>[number]) {
  return `${player.display_name ?? player.displayName ?? 'Player'}${player.position ? `, ${player.position}` : ''}${player.team ? `, ${player.team}` : ''}`;
}

function failedAvailableMessage() {
  return 'I cannot retrieve verified available-player state right now. Required tool failed or was missing: getAvailablePlayers.';
}

export function answerWaiverIntent(intent: WaiverReadIntent, toolResponses: AssistantGmToolResponse[], options: WaiverIntentOptions = {}) {
  if (intent === 'faab_balance' || intent === 'pending_claims') {
    const grounding = checkGrounding(['waiver_balance'], toolResponses);
    const unavailable = unavailableStateMessage(grounding);
    if (unavailable) return unavailable;
  }

  const rules = successfulData<WaiverRulesData>(toolResponses, 'getWaiverRules');
  const state = successfulData<WaiverStateData>(toolResponses, 'getWaiverState');

  if (intent === 'faab_balance') {
    if (!rules?.faabEnabled) return `This verified league does not use FAAB. Waiver priority model: ${rules?.priorityModel ?? 'not available'}.`;
    if (rules.faabBalance == null) return 'FAAB is enabled, but I cannot retrieve your verified FAAB balance right now.';
    return `Your verified FAAB balance is ${rules.faabBalance}.`;
  }

  if (intent === 'pending_claims') {
    const pending = (state?.requesterClaims ?? []).filter((claim) => claim.status === 'pending');
    if (!pending.length) return 'You have no verified pending waiver claims.';
    const holds = new Map((state?.holds ?? []).map((hold) => [hold.id, hold]));
    return `Verified pending waiver claims: ${pending.map((claim) => holdLabel(holds.get(claim.waiver_hold_id) ?? { id: claim.waiver_hold_id })).join('; ')}.`;
  }

  const availableTool = successfulData<AvailableData>(toolResponses, 'getAvailablePlayers');
  if (!availableTool) return failedAvailableMessage();
  const position = (options.position ?? availableTool.position ?? 'ALL').toUpperCase();
  const available = (availableTool.players ?? [])
    .filter((player) => (player.availability ?? '').toLowerCase() === 'available')
    .filter((player) => position === 'ALL' || player.position === position || (position === 'FLEX' && ['RB', 'WR', 'TE'].includes(player.position ?? '')))
    .sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 5);
  if (!available.length) return `I found no verified available players for ${position}.`;
  const source = availableTool.source ?? 'current Big Exec player pool and roster ownership';

  if (intent === 'recommend_add') {
    return `Recommendation, not an official transaction: consider ${playerLabel(available[0])}. Source: ${source}.`;
  }

  return `Best verified available ${position}, source: ${source}. ${available.map(playerLabel).join('; ')}.`;
}
