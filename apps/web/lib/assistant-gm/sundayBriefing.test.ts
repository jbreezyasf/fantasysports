import { describe, expect, it } from 'vitest';
import { buildSundayBriefing, renderSundayBriefing } from './sundayBriefing';
import type { AssistantGmToolResponse } from './tools';

const responses: AssistantGmToolResponse[] = [
  {
    ok: true,
    tool: 'getRoster',
    data: {
      roster: [
        { id: 'r1', athlete_id: 'a1', athletes: { display_name: 'Ari Runner', position: 'RB', injury_status: null, bye_week: 8, real_teams: { abbreviation: 'CHI' } }, overallRank: 20 },
        { id: 'r2', athlete_id: 'a2', athletes: { display_name: 'Blake Receiver', position: 'WR', injury_status: 'Questionable', bye_week: 3, real_teams: { abbreviation: 'DAL' } }, overallRank: 7 }
      ]
    }
  },
  { ok: true, tool: 'getLineup', data: { week: 3, lineup: [{ slot: 'RB', slot_index: 1, athlete_id: 'a1' }] } },
  { ok: true, tool: 'getMatchup', data: { projection: { requester: 116.5, opponent: 112.25 } } },
  { ok: true, tool: 'getWaiverRules', data: { faabEnabled: false } },
  { ok: true, tool: 'getWaiverState', data: { holds: [], requesterClaims: [] } },
  { ok: true, tool: 'getAvailablePlayers', data: { source: 'current player pool', players: [{ display_name: 'Open Tight End', position: 'TE', team: 'SEA', availability: 'Available', overallRank: 5 }] } }
];

describe('Assistant GM Sunday briefing', () => {
  it('builds traceable briefing items without making transactions', () => {
    const briefing = buildSundayBriefing(responses);

    expect(briefing.ok).toBe(true);
    expect(briefing.items).toContainEqual({ check: 'empty_lineup', sourceTool: 'getLineup', message: 'Empty starter spots for week 3: QB1, RB2, WR1, WR2, TE1, FLEX1, K1, D/ST1.' });
    expect(briefing.items).toContainEqual({ check: 'injury', sourceTool: 'getRoster', message: 'Blake Receiver, WR, DAL is Questionable.' });
    expect(briefing.items).toContainEqual({ check: 'bye_week', sourceTool: 'getRoster', message: 'Blake Receiver, WR, DAL is listed with a verified Week 3 bye.' });
    expect(briefing.items).toContainEqual({ check: 'waiver_opportunity', sourceTool: 'getAvailablePlayers', recommendation: true, message: 'Recommendation: waiver/free-agent option to inspect is Open Tight End, TE, SEA. Source: current player pool. No transaction has been made.' });
  });

  it('labels projections and recommendations clearly in rendered output', () => {
    const rendered = renderSundayBriefing(buildSundayBriefing(responses));

    expect(rendered).toContain('Projection, not current score');
    expect(rendered).toContain('Recommendation:');
    expect(rendered).toContain('No transaction has been made.');
    expect(rendered).toContain('[getMatchup]');
  });

  it('does not fabricate urgency when required tools fail', () => {
    const briefing = buildSundayBriefing([
      responses[0],
      responses[1],
      { ok: false, tool: 'getMatchup', error: { code: 'data_error', message: 'Matchup failed' } },
      responses[3],
      responses[4]
    ]);

    expect(briefing).toEqual({
      ok: false,
      summary: 'I cannot retrieve the required score state right now. Required tool failed or were missing: getMatchup.',
      items: []
    });
  });
});
