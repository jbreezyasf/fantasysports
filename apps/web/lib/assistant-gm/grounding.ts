import type { AssistantGmToolName, AssistantGmToolResponse } from './tools';

export type GroundedFactCategory =
  | 'score'
  | 'roster'
  | 'waiver_balance'
  | 'availability'
  | 'standings'
  | 'draft_status'
  | 'injury_state'
  | 'league_rules';

export const assistantGmRequiredTools: Record<GroundedFactCategory, AssistantGmToolName[]> = {
  score: ['getMatchup'],
  roster: ['getRoster', 'getLineup'],
  waiver_balance: ['getWaiverRules', 'getWaiverState'],
  availability: ['searchPlayers'],
  standings: ['getStandings'],
  draft_status: ['getDraftState'],
  injury_state: ['getInjuryStatus'],
  league_rules: ['getLeague', 'getWaiverRules']
};

export type GroundingCheck =
  | { ok: true }
  | { ok: false; missing: Array<{ category: GroundedFactCategory; tool: AssistantGmToolName; reason: string }> };

export function checkGrounding(categories: GroundedFactCategory[], responses: AssistantGmToolResponse[]): GroundingCheck {
  const byTool = new Map(responses.map((response) => [response.tool, response]));
  const missing = categories.flatMap((category) =>
    assistantGmRequiredTools[category].flatMap((tool) => {
      const response = byTool.get(tool);
      if (!response) return [{ category, tool, reason: 'Tool result was not provided.' }];
      if (!response.ok) return [{ category, tool, reason: response.error.message }];
      return [];
    })
  );

  return missing.length ? { ok: false, missing } : { ok: true };
}

export function unavailableStateMessage(check: GroundingCheck) {
  if (check.ok) return null;
  const categories = [...new Set(check.missing.map((item) => item.category.replaceAll('_', ' ')))];
  const tools = [...new Set(check.missing.map((item) => item.tool))];

  return `I cannot retrieve the required ${categories.join(', ')} state right now. Required tool${tools.length === 1 ? '' : 's'} failed or were missing: ${tools.join(', ')}.`;
}

export function groundedAssistantAnswer(input: {
  categories: GroundedFactCategory[];
  toolResponses: AssistantGmToolResponse[];
  render: () => string;
}) {
  const check = checkGrounding(input.categories, input.toolResponses);
  const unavailable = unavailableStateMessage(check);

  if (unavailable) return unavailable;
  return input.render();
}
