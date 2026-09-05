import {
  type BigExecCapabilityId,
  bigExecCapabilities,
  type CapabilityAudience
} from '../executive/capabilities';
import { type ExecutiveFeatureFlags, resolveExecutiveFeatureFlags } from '../executive/featureFlags';
import { type EntitlementSupabase, isExecutiveLeague } from '../executive/entitlements';
import {
  assistantGmToolContracts,
  runAssistantGmTool,
  type AssistantGmToolContext,
  type AssistantGmToolRequest,
  type AssistantGmToolResponse
} from './tools';
import { categoryForToolOnlyAnswer, type AssistantGmResponseCategory } from './responseSchema';
import {
  evaluateAssistantGmCapability,
  type AssistantGmPolicyDecision,
  type AssistantGmPolicyDenialReason
} from './capabilityPolicy';

export type AssistantGmGatewayRequest = {
  userId?: string | null;
  leagueId: string;
  leagueSeasonId: string;
  audience: CapabilityAudience;
  capabilityId: BigExecCapabilityId;
  releasePhase?: 'beta' | 'post_beta';
  toolRequests?: AssistantGmToolRequest[];
};

export type AssistantGmUsageEvent = {
  userId: string;
  leagueId: string;
  leagueSeasonId: string;
  capabilityId: BigExecCapabilityId;
  mode: 'standard' | 'pro_plus';
  providerRoute: 'deterministic_tools';
  status: 'success' | 'denied' | 'tool_error';
  toolCount: number;
};

export type AssistantGmGateway = {
  handle: (request: AssistantGmGatewayRequest) => Promise<AssistantGmGatewayResponse>;
};

export type AssistantGmGatewayResponse =
  | {
      ok: true;
      mode: 'standard' | 'pro_plus';
      classification: AssistantGmResponseCategory;
      providerRoute: 'deterministic_tools';
      toolResponses: AssistantGmToolResponse[];
    }
  | {
      ok: false;
      code: AssistantGmGatewayDenialCode;
      message: string;
      classification: 'unsupported';
      /** Present for policy denials so callers can render one shared upgrade prompt. */
      policy?: AssistantGmPolicyDecision;
      toolResponses?: AssistantGmToolResponse[];
    };

export type AssistantGmGatewayDenialCode =
  | 'unauthenticated'
  | 'feature_disabled'
  | 'unsupported_capability'
  | 'entitlement_required'
  | 'unauthorized_tool'
  | 'tool_failed';

function gatewayCodeForDenial(reason: AssistantGmPolicyDenialReason): AssistantGmGatewayDenialCode {
  switch (reason) {
    case 'unauthenticated':
      return 'unauthenticated';
    case 'feature_disabled':
      return 'feature_disabled';
    case 'entitlement_required':
      return 'entitlement_required';
    default:
      return 'unsupported_capability';
  }
}

export function createAssistantGmGateway(input: {
  supabase: EntitlementSupabase & AssistantGmToolContext['supabase'];
  flags?: ExecutiveFeatureFlags;
  recordUsage?: (event: AssistantGmUsageEvent) => void | Promise<void>;
  toolRunner?: (ctx: AssistantGmToolContext, request: AssistantGmToolRequest) => Promise<AssistantGmToolResponse>;
}): AssistantGmGateway {
  const flags = input.flags ?? resolveExecutiveFeatureFlags();
  const toolRunner = input.toolRunner ?? runAssistantGmTool;

  async function record(request: AssistantGmGatewayRequest & { userId: string }, event: Omit<AssistantGmUsageEvent, 'userId' | 'leagueId' | 'leagueSeasonId' | 'capabilityId'>) {
    await input.recordUsage?.({
      userId: request.userId,
      leagueId: request.leagueId,
      leagueSeasonId: request.leagueSeasonId,
      capabilityId: request.capabilityId,
      ...event
    });
  }

  return {
    async handle(request) {
      if (!request.userId) {
        return { ok: false, code: 'unauthenticated', message: 'Sign in before using Assistant GM.', classification: 'unsupported' };
      }

      // Entitlement, kill-switch, audience, and release policy live in one place
      // (BE-GM-105). The gateway never re-implements a payment or tier check.
      const executive = await isExecutiveLeague({ supabase: input.supabase, leagueSeasonId: request.leagueSeasonId, userId: request.userId });
      const decision = evaluateAssistantGmCapability(request.capabilityId, {
        userId: request.userId,
        audience: request.audience,
        isExecutiveLeague: executive,
        flags,
        releasePhase: request.releasePhase
      });

      if (!decision.allowed) {
        if (decision.reason !== 'unknown_intent') {
          await record(request as AssistantGmGatewayRequest & { userId: string }, { mode: executive ? 'pro_plus' : 'standard', providerRoute: 'deterministic_tools', status: 'denied', toolCount: 0 });
        }
        return {
          ok: false,
          code: gatewayCodeForDenial(decision.reason),
          message: decision.message,
          classification: 'unsupported',
          policy: decision
        };
      }

      const toolRequests = request.toolRequests ?? [];
      const unauthorized = toolRequests.find(toolRequest => {
        const contract = assistantGmToolContracts[toolRequest.tool];
        return !contract || contract.writes || toolRequest.leagueId !== request.leagueId;
      });
      if (unauthorized) {
        await record(request as AssistantGmGatewayRequest & { userId: string }, { mode: executive ? 'pro_plus' : 'standard', providerRoute: 'deterministic_tools', status: 'denied', toolCount: toolRequests.length });
        return { ok: false, code: 'unauthorized_tool', message: 'Assistant GM can only call declared read tools inside the current league.', classification: 'unsupported' };
      }

      const ctx = { supabase: input.supabase, userId: request.userId };
      const toolResponses = await Promise.all(toolRequests.map(toolRequest => toolRunner(ctx, toolRequest)));
      const failed = toolResponses.find(response => !response.ok);
      if (failed) {
        await record(request as AssistantGmGatewayRequest & { userId: string }, { mode: executive ? 'pro_plus' : 'standard', providerRoute: 'deterministic_tools', status: 'tool_error', toolCount: toolResponses.length });
        return { ok: false, code: 'tool_failed', message: failed.error.message, classification: 'unsupported', toolResponses };
      }

      await record(request as AssistantGmGatewayRequest & { userId: string }, { mode: executive ? 'pro_plus' : 'standard', providerRoute: 'deterministic_tools', status: 'success', toolCount: toolResponses.length });
      return {
        ok: true,
        mode: decision.mode,
        classification: decision.action === 'read' ? categoryForToolOnlyAnswer() : 'explanation',
        providerRoute: 'deterministic_tools',
        toolResponses
      };
    }
  };
}

export const assistantGmGatewayCapabilityIds = bigExecCapabilities
  .filter(capability => capability.assistantGmToolAllowed)
  .map(capability => capability.id);
