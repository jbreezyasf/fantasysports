import {
  createAssistantGmGateway,
  type AssistantGmGateway,
  type AssistantGmGatewayRequest,
  type AssistantGmGatewayResponse
} from './gateway';
import type { AssistantGmToolRequest } from './tools';

export type AssistantGmAgentStep = {
  reason: string;
  toolRequests: AssistantGmToolRequest[];
};

export type AssistantGmAgentRunRequest = Omit<AssistantGmGatewayRequest, 'toolRequests'> & {
  maxSteps?: number;
  steps: AssistantGmAgentStep[];
};

export type AssistantGmAgentRunResult = {
  ok: boolean;
  maxSteps: number;
  completedSteps: number;
  stopReason: 'completed' | 'max_steps' | 'gateway_denied';
  responses: AssistantGmGatewayResponse[];
};

export async function runAssistantGmAgentLoop(
  gateway: AssistantGmGateway,
  request: AssistantGmAgentRunRequest
): Promise<AssistantGmAgentRunResult> {
  const maxSteps = Math.max(1, Math.min(request.maxSteps ?? 4, 8));
  const responses: AssistantGmGatewayResponse[] = [];

  for (let index = 0; index < Math.min(maxSteps, request.steps.length); index += 1) {
    const response = await gateway.handle({
      userId: request.userId,
      leagueId: request.leagueId,
      leagueSeasonId: request.leagueSeasonId,
      audience: request.audience,
      capabilityId: request.capabilityId,
      releasePhase: request.releasePhase,
      toolRequests: request.steps[index].toolRequests
    });
    responses.push(response);
    if (!response.ok) {
      return { ok: false, maxSteps, completedSteps: index + 1, stopReason: 'gateway_denied', responses };
    }
  }

  return {
    ok: responses.every(response => response.ok),
    maxSteps,
    completedSteps: responses.length,
    stopReason: request.steps.length > maxSteps ? 'max_steps' : 'completed',
    responses
  };
}

export function createAssistantGmAgentRunner(input: Parameters<typeof createAssistantGmGateway>[0]) {
  const gateway = createAssistantGmGateway(input);
  return {
    run: (request: AssistantGmAgentRunRequest) => runAssistantGmAgentLoop(gateway, request)
  };
}
