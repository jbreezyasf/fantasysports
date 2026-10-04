import { type CapabilityAudience } from '../executive/capabilities';

type QueryResult<T> = { data: T | null; error?: { message?: string } | null };
type ScopeQuery = {
  select: (columns?: string) => ScopeQuery;
  eq: (column: string, value: unknown) => ScopeQuery;
  maybeSingle: <T>() => PromiseLike<QueryResult<T>>;
};
export type AssistantGmScopeSupabase = { from: (table: string) => ScopeQuery };

export type AssistantGmServerScope =
  | { ok: true; audience: CapabilityAudience; leagueSeasonId: string }
  | { ok: false; code: 'unauthorized' | 'not_found'; status: 403 | 404; message: string };

// League role -> policy audience. Mirrors the in-app Front Office Advisor action. A league
// membership can only ever yield manager or commissioner; ops_staff is never granted here.
export function audienceForLeagueRole(role: string | null | undefined): CapabilityAudience {
  return role === 'commissioner' ? 'commissioner' : 'manager';
}

// Resolves who the caller is inside this league from the database, for machine routes.
// The request body is never consulted. Fails closed: no membership row, a lookup error or a
// thrown lookup all deny before any policy evaluation or tool call.
export async function resolveAssistantGmServerScope(
  supabase: AssistantGmScopeSupabase,
  input: { userId: string; leagueId: string }
): Promise<AssistantGmServerScope> {
  const denied = { ok: false as const, code: 'unauthorized' as const, status: 403 as const, message: 'User is not a member of this league.' };
  try {
    const member = await supabase.from('league_members').select('role').eq('league_id', input.leagueId).eq('user_id', input.userId).maybeSingle<{ role?: string | null }>();
    if (member.error || !member.data) return denied;
    const season = await supabase.from('league_seasons').select('id').eq('league_id', input.leagueId).eq('is_current', true).maybeSingle<{ id: string }>();
    if (season.error) return denied;
    if (!season.data) return { ok: false, code: 'not_found', status: 404, message: 'Current league season not found.' };
    return { ok: true, audience: audienceForLeagueRole(member.data.role), leagueSeasonId: season.data.id };
  } catch {
    return denied;
  }
}
