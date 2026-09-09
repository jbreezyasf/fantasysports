import { NextRequest, NextResponse } from 'next/server';
import { createAssistantGmAgentRunner, type AssistantGmAgentStep } from '../../../../lib/assistant-gm/agentRunner';
import {
  assistantGmToolContracts,
  type AssistantGmToolContext,
  type AssistantGmToolName,
  type AssistantGmToolRequest
} from '../../../../lib/assistant-gm/tools';
import {
  getBigExecCapability,
  type BigExecCapabilityId,
  type CapabilityAudience
} from '../../../../lib/executive/capabilities';
import { type EntitlementSupabase } from '../../../../lib/executive/entitlements';
import { resolveExecutiveFeatureFlags } from '../../../../lib/executive/featureFlags';
import { createClient } from '../../../../lib/supabase/server';

type AgentRunBody = {
  leagueId?: unknown;
  audience?: unknown;
  capabilityId?: unknown;
  maxSteps?: unknown;
  steps?: unknown;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAudience(value: unknown): value is CapabilityAudience {
  return value === 'league_member' || value === 'manager' || value === 'commissioner' || value === 'ops_staff';
}

function isToolName(value: unknown): value is AssistantGmToolName {
  return typeof value === 'string' && value in assistantGmToolContracts;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, code: 'invalid_request', message }, { status });
}

function normalizeToolRequest(value: unknown, leagueId: string): AssistantGmToolRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isToolName(row.tool) || row.leagueId !== leagueId) return null;
  const request: AssistantGmToolRequest = { tool: row.tool, leagueId };
  if (isUuid(row.franchiseId)) request.franchiseId = row.franchiseId;
  if (isUuid(row.draftId)) request.draftId = row.draftId;
  if (isUuid(row.matchupId)) request.matchupId = row.matchupId;
  if (isUuid(row.athleteId)) request.athleteId = row.athleteId;
  if (isUuid(row.tradeId)) request.tradeId = row.tradeId;
  if (Array.isArray(row.athleteIds) && row.athleteIds.length <= 8 && row.athleteIds.every(isUuid)) request.athleteIds = row.athleteIds;
  if (typeof row.position === 'string') request.position = row.position.slice(0, 16);
  if (typeof row.query === 'string') request.query = row.query.slice(0, 120);
  if (typeof row.week === 'number' && Number.isInteger(row.week) && row.week >= 1 && row.week <= 18) request.week = row.week;
  return request;
}

function normalizeStep(value: unknown, leagueId: string): AssistantGmAgentStep | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.toolRequests) || row.toolRequests.length < 1 || row.toolRequests.length > 8) return null;
  const toolRequests = row.toolRequests.map(item => normalizeToolRequest(item, leagueId));
  if (toolRequests.some(item => !item)) return null;
  return {
    reason: typeof row.reason === 'string' ? row.reason.slice(0, 160) : 'tool step',
    toolRequests: toolRequests as AssistantGmToolRequest[]
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as AgentRunBody | null;
  if (!body) return bad('Expected a JSON body.');
  if (!isUuid(body.leagueId)) return bad('leagueId must be a UUID.');
  if (!isAudience(body.audience)) return bad('audience is invalid.');
  if (typeof body.capabilityId !== 'string' || !getBigExecCapability(body.capabilityId as BigExecCapabilityId)) return bad('capabilityId is invalid.');
  if (!Array.isArray(body.steps) || body.steps.length < 1 || body.steps.length > 8) return bad('steps must contain 1 to 8 tool steps.');

  const steps = body.steps.map(step => normalizeStep(step, body.leagueId as string));
  if (steps.some(step => !step)) return bad('Every step must contain declared same-league read tools.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: 'unauthenticated', message: 'Sign in before using Front Office Advisor.' }, { status: 401 });
  const { data: season } = await supabase.from('league_seasons').select('id').eq('league_id', body.leagueId).eq('is_current', true).maybeSingle();
  if (!season) return NextResponse.json({ ok: false, code: 'not_found', message: 'Current league season not found.' }, { status: 404 });

  const runner = createAssistantGmAgentRunner({
    supabase: supabase as unknown as EntitlementSupabase & AssistantGmToolContext['supabase'],
    flags: { ...resolveExecutiveFeatureFlags(), assistant_gm: true }
  });
  const result = await runner.run({
    userId: user.id,
    leagueId: body.leagueId,
    leagueSeasonId: season.id,
    audience: body.audience,
    capabilityId: body.capabilityId as BigExecCapabilityId,
    maxSteps: typeof body.maxSteps === 'number' ? body.maxSteps : undefined,
    steps: steps as AssistantGmAgentStep[]
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}
