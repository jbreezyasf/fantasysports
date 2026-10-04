import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const OTHER_LEAGUE = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  members: [] as Array<Record<string, unknown>>,
  memberError: false,
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
    if (this.table === 'league_members' && state.memberError) return { data: null, error: { message: 'permission denied' } };
    return { data: this.rows.find(row => this.filters.every(([column, value]) => row[column] === value)) ?? null, error: null };
  }
}

vi.mock('../supabase/server', () => ({
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

vi.mock('../assistant-gm/tools', async importOriginal => ({
  ...(await importOriginal<typeof import('../assistant-gm/tools')>()),
  runAssistantGmTool: async (_ctx: unknown, request: { tool: string }) => {
    state.toolCalls.push(request.tool);
    return { ok: true, tool: request.tool, data: {} };
  }
}));

import { GET as invitationsRoute } from '../../app/api/leagues/[leagueId]/invitations/route';
import { GET as stateRoute } from '../../app/api/leagues/[leagueId]/state/route';
import { GET as openApiRoute } from '../../app/api/openapi/route';

const request = new Request('https://ci.bigexec.invalid/api/leagues/x');
const params = (leagueId: string) => ({ params: Promise.resolve({ leagueId }) });

describe('machine read routes: server-derived audience and real feature flags', () => {
  beforeEach(() => {
    state.user = { id: 'user-1' };
    state.members = [{ league_id: LEAGUE, user_id: 'user-1', role: 'manager' }];
    state.memberError = false;
    state.toolCalls = [];
    vi.stubEnv('BIG_EXEC_ASSISTANT_GM', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('denies a manager on the commissioner-only invitations route', async () => {
    const response = await invitationsRoute(request, params(LEAGUE));
    expect(response.status).toBe(403);
    expect((await response.json()).policy.reason).toBe('audience_denied');
    expect(state.toolCalls).toEqual([]);
  });

  it('allows a commissioner on the invitations route', async () => {
    state.members = [{ league_id: LEAGUE, user_id: 'user-1', role: 'commissioner' }];
    const response = await invitationsRoute(request, params(LEAGUE));
    expect(response.status).toBe(200);
    expect(state.toolCalls).toEqual(['getInvitationState']);
  });

  it('still lets a manager read a standard league surface', async () => {
    const response = await stateRoute(request, params(LEAGUE));
    expect(response.status).toBe(200);
    expect(state.toolCalls.length).toBeGreaterThan(0);
  });

  it('denies non-members, unauthenticated callers and failed membership lookups before any tool runs', async () => {
    state.members = [{ league_id: OTHER_LEAGUE, user_id: 'user-1', role: 'commissioner' }];
    expect((await invitationsRoute(request, params(LEAGUE))).status).toBe(403);
    state.members = [{ league_id: LEAGUE, user_id: 'user-1', role: 'commissioner' }];
    state.memberError = true;
    expect((await invitationsRoute(request, params(LEAGUE))).status).toBe(403);
    state.memberError = false;
    state.user = null;
    expect((await invitationsRoute(request, params(LEAGUE))).status).toBe(401);
    expect(state.toolCalls).toEqual([]);
  });

  it.each([['unset', undefined], ['false', 'false'], ['empty', '']])('honours the assistant_gm kill switch (%s)', async (_label, value) => {
    vi.unstubAllEnvs();
    vi.stubEnv('BIG_EXEC_ASSISTANT_GM', value as unknown as string);
    state.members = [{ league_id: LEAGUE, user_id: 'user-1', role: 'commissioner' }];
    const response = await stateRoute(request, params(LEAGUE));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('feature_disabled');
    expect(state.toolCalls).toEqual([]);
  });
});

describe('OpenAPI contract no longer requires a client-supplied audience', () => {
  it('drops audience from required in the generated contract', async () => {
    const spec = await (await openApiRoute()).json();
    for (const name of ['AssistantGmToolRunRequest', 'AssistantGmAgentRunRequest']) {
      const schema = spec.components.schemas[name];
      expect(schema.required).not.toContain('audience');
      expect(schema.properties.audience.deprecated).toBe(true);
    }
  });

  it('does not list audience anywhere in the static contract', () => {
    expect(readFileSync(join(process.cwd(), 'public/openapi.json'), 'utf8')).not.toContain('audience');
  });
});
