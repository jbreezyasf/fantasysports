import { NextRequest, NextResponse } from 'next/server';
import { createAssistantGmGateway } from '../../../../lib/assistant-gm/gateway';
import {
  assistantGmToolContracts,
  type AssistantGmToolContext,
  type AssistantGmToolName,
  type AssistantGmToolRequest
} from '../../../../lib/assistant-gm/tools';
import {
  getBigExecCapability,
  type BigExecCapabilityId
} from '../../../../lib/executive/capabilities';
import { type EntitlementSupabase } from '../../../../lib/executive/entitlements';
import { resolveAssistantGmServerScope, type AssistantGmScopeSupabase } from '../../../../lib/assistant-gm/serverScope';
import { resolveExecutiveFeatureFlags } from '../../../../lib/executive/featureFlags';
import { createClient } from '../../../../lib/supabase/server';
import { checkRateLimit, rateLimitedResponse } from '../../../../lib/security/rateLimit';

type ToolRunBody = {
  leagueId?: unknown;
  capabilityId?: unknown;
  toolRequests?: unknown;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  for (const key of ['franchiseId', 'draftId', 'matchupId', 'athleteId', 'tradeId'] as const) {
    if (row[key] !== undefined) {
      if (!isUuid(row[key])) return null;
      request[key] = row[key];
    }
  }
  if (Array.isArray(row.athleteIds)) {
    if (row.athleteIds.length > 8 || !row.athleteIds.every(isUuid)) return null;
    request.athleteIds = row.athleteIds;
  }
  if (typeof row.position === 'string') request.position = row.position.slice(0, 16);
  if (typeof row.query === 'string') request.query = row.query.slice(0, 120);
  if (typeof row.week === 'number' && Number.isInteger(row.week) && row.week >= 1 && row.week <= 18) request.week = row.week;
  return request;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as ToolRunBody | null;
  if (!body) return bad('Expected a JSON body.');
  if (!isUuid(body.leagueId)) return bad('leagueId must be a UUID.');
  if (typeof body.capabilityId !== 'string' || !getBigExecCapability(body.capabilityId as BigExecCapabilityId)) return bad('capabilityId is invalid.');
  if (!Array.isArray(body.toolRequests) || body.toolRequests.length < 1 || body.toolRequests.length > 8) return bad('toolRequests must contain 1 to 8 tools.');

  const toolRequests = body.toolRequests.map(item => normalizeToolRequest(item, body.leagueId as string));
  if (toolRequests.some(item => !item)) return bad('Every tool request must name a declared same-league read tool with valid identifiers.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: 'unauthenticated', message: 'Sign in before using Front Office Advisor tools.' }, { status: 401 });
  const rateLimit = await checkRateLimit('machineApiByUser', user.id);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  // Audience and league scope come from the caller's own membership row. Any `audience` in the
  // request body is ignored, so a client cannot claim a wider role than the database grants.
  const scope = await resolveAssistantGmServerScope(supabase as unknown as AssistantGmScopeSupabase, { userId: user.id, leagueId: body.leagueId });
  if (!scope.ok) return NextResponse.json({ ok: false, code: scope.code, message: scope.message }, { status: scope.status });

  const gateway = createAssistantGmGateway({
    supabase: supabase as unknown as EntitlementSupabase & AssistantGmToolContext['supabase'],
    flags: resolveExecutiveFeatureFlags()
  });
  const result = await gateway.handle({
    userId: user.id,
    leagueId: body.leagueId,
    leagueSeasonId: scope.leagueSeasonId,
    audience: scope.audience,
    capabilityId: body.capabilityId as BigExecCapabilityId,
    toolRequests: toolRequests as AssistantGmToolRequest[]
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.code === 'unauthenticated' ? 401 : 403 });
}
