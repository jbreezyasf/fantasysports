import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audienceForLeagueRole, resolveAssistantGmServerScope } from '../../../lib/assistant-gm/serverScope';

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const OTHER_LEAGUE = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  members: [] as Array<Record<string, unknown>>,
  memberError: false,
  memberThrows: false,
  toolCalls: [] as string[]
}));

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  constructor(private table: string, private rows: Row[]) {}
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  in() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  async maybeSingle() {
    if (this.table === 'league_members' && state.memberThrows) throw new Error('network down');
    if (this.table === 'league_members' && state.memberError) return { data: null, error: { message: 'permission denied' } };
    return { data: this.rows.find(row => this.filters.every(([column, value]) => row[column] === value)) ?? null, error: null };
  }
}

vi.mock('../../../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      const tables: Record<string, Row[]> = {
        league_members: state.members,
        league_seasons: [{ id: 'season-1', league_id: LEAGUE, is_current: true, competition_season_id: 'competition-season-1' }],
        league_season_entitlements: []
      };
      return new FakeQuery(table, tables[table] ?? []);
    }
  })
}));

vi.mock('../../../lib/assistant-gm/tools', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/assistant-gm/tools')>()),
  runAssistantGmTool: async (_ctx: unknown, request: { tool: string }) => {
    state.toolCalls.push(request.tool);
    return { ok: true, tool: request.tool, data: {} };
  }
}));

import { POST as runRoute } from './run/route';
import { POST as toolsRoute } from './tools/route';
import { assistantGmToolContracts } from '../../../lib/assistant-gm/tools';

const readTool = Object.entries(assistantGmToolContracts).find(([, contract]) => !contract.writes)![0];

function post(body: Record<string, unknown>) {
  return new NextRequest('https://ci.bigexec.invalid/api/assistant-gm', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

const routes = [
  {
    name: '/api/assistant-gm/tools',
    call: (body: Record<string, unknown>) => toolsRoute(post({ toolRequests: [{ tool: readTool, leagueId: body.leagueId ?? LEAGUE }], ...body })),
    denial: (json: any) => json
  },
  {
    name: '/api/assistant-gm/run',
    call: (body: Record<string, unknown>) => runRoute(post({ steps: [{ reason: 'test', toolRequests: [{ tool: readTool, leagueId: body.leagueId ?? LEAGUE }] }], ...body })),
    denial: (json: any) => json.responses?.[0] ?? json
  }
] as const;

describe.each(routes)('$name server-derived audience and kill switch', ({ call, denial }) => {
  beforeEach(() => {
    state.user = { id: 'user-1' };
    state.members = [{ league_id: LEAGUE, user_id: 'user-1', role: 'manager' }];
    state.memberError = false;
    state.memberThrows = false;
    state.toolCalls = [];
    vi.stubEnv('BIG_EXEC_ASSISTANT_GM', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows a manager to run a standard read capability', async () => {
    const response = await call({ leagueId: LEAGUE, capabilityId: 'standings.read' });
    expect(response.status).toBe(200);
    expect(state.toolCalls).toEqual([readTool]);
  });

  it('does not let a body-supplied audience widen a manager to commissioner', async () => {
    const response = await call({ leagueId: LEAGUE, capabilityId: 'invitations.read', audience: 'commissioner' });
    expect(response.status).toBe(403);
    expect(denial(await response.json()).policy.reason).toBe('audience_denied');
    expect(state.toolCalls).toEqual([]);
  });

  it('does not let a body-supplied ops_staff audience grant anything', async () => {
    const response = await call({ leagueId: LEAGUE, capabilityId: 'invitations.read', audience: 'ops_staff' });
    expect(response.status).toBe(403);
    expect(state.toolCalls).toEqual([]);
  });

  it('does not let a body-supplied audience narrow or replace the real commissioner role', async () => {
    state.members = [{ league_id: LEAGUE, user_id: 'user-1', role: 'commissioner' }];
    const response = await call({ leagueId: LEAGUE, capabilityId: 'invitations.read', audience: 'league_member' });
    expect(response.status).toBe(200);
  });

  it('works without any audience in the body', async () => {
    const response = await call({ leagueId: LEAGUE, capabilityId: 'standings.read' });
    expect(response.status).toBe(200);
  });

  it('denies a signed-in user who is not a member of the league, whatever audience is claimed', async () => {
    state.members = [{ league_id: OTHER_LEAGUE, user_id: 'user-1', role: 'commissioner' }];
    const response = await call({ leagueId: LEAGUE, capabilityId: 'standings.read', audience: 'commissioner' });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('unauthorized');
    expect(state.toolCalls).toEqual([]);
  });

  it('fails closed when the membership lookup errors or throws', async () => {
    state.memberError = true;
    expect((await call({ leagueId: LEAGUE, capabilityId: 'standings.read', audience: 'commissioner' })).status).toBe(403);
    state.memberError = false;
    state.memberThrows = true;
    expect((await call({ leagueId: LEAGUE, capabilityId: 'standings.read', audience: 'commissioner' })).status).toBe(403);
    expect(state.toolCalls).toEqual([]);
  });

  it('rejects unauthenticated callers', async () => {
    state.user = null;
    const response = await call({ leagueId: LEAGUE, capabilityId: 'standings.read', audience: 'commissioner' });
    expect(response.status).toBe(401);
    expect(state.toolCalls).toEqual([]);
  });

  it.each([['unset', undefined], ['false', 'false'], ['empty', '']])('is disabled by the kill switch (%s)', async (_label, value) => {
    vi.unstubAllEnvs();
    if (value !== undefined) vi.stubEnv('BIG_EXEC_ASSISTANT_GM', value);
    else vi.stubEnv('BIG_EXEC_ASSISTANT_GM', undefined as unknown as string);
    state.members = [{ league_id: LEAGUE, user_id: 'user-1', role: 'commissioner' }];
    const response = await call({ leagueId: LEAGUE, capabilityId: 'standings.read', audience: 'commissioner' });
    expect(response.status).toBe(403);
    const body = denial(await response.json());
    expect(body.code).toBe('feature_disabled');
    expect(state.toolCalls).toEqual([]);
  });

  it('keeps Pro+ capabilities gated by entitlement when the switch is on', async () => {
    vi.stubEnv('BIG_EXEC_ASSISTANT_GM_PRO_PLUS', 'true');
    const response = await call({ leagueId: LEAGUE, capabilityId: 'pro_plus.opponent_scout', audience: 'commissioner' });
    expect(response.status).toBe(403);
    expect(denial(await response.json()).code).toBe('entitlement_required');
    expect(state.toolCalls).toEqual([]);
  });
});

describe('resolveAssistantGmServerScope', () => {
  it('maps league roles to audiences and never yields ops_staff', () => {
    expect(audienceForLeagueRole('commissioner')).toBe('commissioner');
    expect(audienceForLeagueRole('manager')).toBe('manager');
    expect(audienceForLeagueRole('ops_staff')).toBe('manager');
    expect(audienceForLeagueRole(null)).toBe('manager');
  });

  it('returns not_found for a member of a league with no current season', async () => {
    const supabase = {
      from: (table: string) => new FakeQuery(table, table === 'league_members' ? [{ league_id: OTHER_LEAGUE, user_id: 'user-1', role: 'manager' }] : [])
    };
    const scope = await resolveAssistantGmServerScope(supabase as any, { userId: 'user-1', leagueId: OTHER_LEAGUE });
    expect(scope).toMatchObject({ ok: false, code: 'not_found', status: 404 });
  });
});
