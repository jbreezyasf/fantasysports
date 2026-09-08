import { NextResponse } from 'next/server';
import { createAssistantGmGateway } from '../assistant-gm/gateway';
import {
  type AssistantGmToolContext,
  type AssistantGmToolRequest
} from '../assistant-gm/tools';
import {
  type BigExecCapabilityId,
  type CapabilityAudience
} from '../executive/capabilities';
import { type EntitlementSupabase } from '../executive/entitlements';
import { resolveExecutiveFeatureFlags } from '../executive/featureFlags';
import { createClient } from '../supabase/server';

export type MachineRouteParams = { params: Promise<{ leagueId: string }> };

export function invalidMachineRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, code: 'invalid_request', message }, { status });
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function weekFromRequest(request: Request) {
  const raw = new URL(request.url).searchParams.get('week');
  if (!raw) return 1;
  const week = Number(raw);
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : 1;
}

export async function currentDraftId(leagueId: string) {
  const supabase = await createClient();
  const { data: season } = await supabase
    .from('league_seasons')
    .select('id')
    .eq('league_id', leagueId)
    .eq('is_current', true)
    .maybeSingle();
  if (!season) return null;
  const { data: draft } = await supabase.from('drafts').select('id').eq('league_season_id', season.id).maybeSingle();
  return draft?.id ?? null;
}

export async function runMachineReadTools(input: {
  leagueId: string;
  audience?: CapabilityAudience;
  capabilityId: BigExecCapabilityId;
  toolRequests: AssistantGmToolRequest[];
}) {
  if (!isUuid(input.leagueId)) return invalidMachineRequest('leagueId must be a UUID.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: 'unauthenticated', message: 'Sign in before using this machine API.' }, { status: 401 });

  const [{ data: member }, { data: season }] = await Promise.all([
    supabase.from('league_members').select('role').eq('league_id', input.leagueId).eq('user_id', user.id).maybeSingle(),
    supabase.from('league_seasons').select('id').eq('league_id', input.leagueId).eq('is_current', true).maybeSingle()
  ]);
  if (!member) return NextResponse.json({ ok: false, code: 'unauthorized', message: 'User is not a member of this league.' }, { status: 403 });
  if (!season) return NextResponse.json({ ok: false, code: 'not_found', message: 'Current league season not found.' }, { status: 404 });

  const audience = input.audience ?? (member.role === 'commissioner' ? 'commissioner' : 'manager');
  const gateway = createAssistantGmGateway({
    supabase: supabase as unknown as EntitlementSupabase & AssistantGmToolContext['supabase'],
    flags: { ...resolveExecutiveFeatureFlags(), assistant_gm: true }
  });
  const result = await gateway.handle({
    userId: user.id,
    leagueId: input.leagueId,
    leagueSeasonId: season.id,
    audience,
    capabilityId: input.capabilityId,
    toolRequests: input.toolRequests
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}
