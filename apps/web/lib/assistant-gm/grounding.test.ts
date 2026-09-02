import { describe, expect, it } from 'vitest';
import { checkGrounding, groundedAssistantAnswer, unavailableStateMessage } from './grounding';
import type { AssistantGmToolResponse } from './tools';

const successful = (tool: AssistantGmToolResponse['tool']): AssistantGmToolResponse => ({ ok: true, tool, data: {} });
const failed = (tool: AssistantGmToolResponse['tool'], message: string): AssistantGmToolResponse => ({ ok: false, tool, error: { code: 'data_error', message } });

describe('Assistant GM grounding rules', () => {
  it('blocks score answers when matchup state is unavailable', () => {
    const answer = groundedAssistantAnswer({
      categories: ['score'],
      toolResponses: [failed('getMatchup', 'Matchup not found')],
      render: () => 'You are winning 100 to 90.'
    });

    expect(answer).toBe('I cannot retrieve the required score state right now. Required tool failed or were missing: getMatchup.');
  });

  it('blocks roster answers when a required roster or lineup tool result is missing', () => {
    const check = checkGrounding(['roster'], [successful('getRoster')]);

    expect(check).toEqual({
      ok: false,
      missing: [{ category: 'roster', tool: 'getLineup', reason: 'Tool result was not provided.' }]
    });
    expect(unavailableStateMessage(check)).toBe('I cannot retrieve the required roster state right now. Required tool failed or were missing: getLineup.');
  });

  it('allows answers only when every required fact source succeeded', () => {
    const answer = groundedAssistantAnswer({
      categories: ['standings', 'league_rules'],
      toolResponses: [successful('getStandings'), successful('getLeague'), successful('getWaiverRules')],
      render: () => 'You are third, and this league uses inverse-standings waiver priority.'
    });

    expect(answer).toBe('You are third, and this league uses inverse-standings waiver priority.');
  });

  it('requires verified tools for every no-fabrication category', () => {
    expect(checkGrounding(['availability', 'draft_status', 'injury_state', 'waiver_balance'], [
      successful('searchPlayers'),
      successful('getDraftState'),
      successful('getInjuryStatus'),
      successful('getWaiverRules'),
      successful('getWaiverState')
    ])).toEqual({ ok: true });
  });
});
