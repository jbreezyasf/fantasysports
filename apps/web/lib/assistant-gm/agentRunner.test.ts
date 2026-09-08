import { describe, expect, it, vi } from 'vitest';
import { runAssistantGmAgentLoop } from './agentRunner';
import type { AssistantGmGateway } from './gateway';

describe('Assistant GM bounded agent loop', () => {
  it('runs tool steps in order and stops at maxSteps', async () => {
    const gateway: AssistantGmGateway = {
      handle: vi.fn().mockResolvedValue({ ok: true, mode: 'standard', classification: 'authoritative_fact', providerRoute: 'deterministic_tools', toolResponses: [] })
    };

    const result = await runAssistantGmAgentLoop(gateway, {
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'roster.read',
      maxSteps: 1,
      steps: [
        { reason: 'read roster', toolRequests: [{ tool: 'getRoster', leagueId: 'league-1' }] },
        { reason: 'read lineup', toolRequests: [{ tool: 'getLineup', leagueId: 'league-1' }] }
      ]
    });

    expect(result).toMatchObject({ ok: true, completedSteps: 1, stopReason: 'max_steps' });
    expect(gateway.handle).toHaveBeenCalledOnce();
  });

  it('stops immediately when the gateway denies a step', async () => {
    const gateway: AssistantGmGateway = {
      handle: vi.fn().mockResolvedValue({ ok: false, code: 'unauthorized_tool', message: 'Denied', classification: 'unsupported' })
    };

    const result = await runAssistantGmAgentLoop(gateway, {
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'roster.read',
      steps: [{ reason: 'read roster', toolRequests: [{ tool: 'getRoster', leagueId: 'league-1' }] }]
    });

    expect(result).toMatchObject({ ok: false, completedSteps: 1, stopReason: 'gateway_denied' });
  });
});
