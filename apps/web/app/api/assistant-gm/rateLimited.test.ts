import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LEAGUE = '11111111-1111-4111-8111-111111111111';

const state = vi.hoisted(() => ({ allowed: true, checked: [] as Array<[string, string]>, memberLookups: 0 }));

vi.mock('../../../lib/security/rateLimit', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/security/rateLimit')>()),
  checkRateLimit: async (scope: string, identifier: string) => {
    state.checked.push([scope, identifier]);
    return { allowed: state.allowed, enforced: true, retryAfterSeconds: state.allowed ? 0 : 30 };
  }
}));

vi.mock('../../../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from() {
      state.memberLookups += 1;
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
      return query;
    }
  })
}));

import { POST as toolsRoute } from './tools/route';
import { GET as stateRoute } from '../leagues/[leagueId]/state/route';
import { assistantGmToolContracts } from '../../../lib/assistant-gm/tools';

const readTool = Object.entries(assistantGmToolContracts).find(([, contract]) => !contract.writes)![0];

function toolsRequest() {
  return new NextRequest('https://ci.bigexec.invalid/api/assistant-gm/tools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ leagueId: LEAGUE, capabilityId: 'standings.read', toolRequests: [{ tool: readTool, leagueId: LEAGUE }] })
  });
}

describe('machine API rate limiting', () => {
  beforeEach(() => {
    state.allowed = true;
    state.checked = [];
    state.memberLookups = 0;
  });

  it('returns 429 with Retry-After before any league lookup when the caller is over the limit', async () => {
    state.allowed = false;
    for (const response of [await toolsRoute(toolsRequest()), await stateRoute(new Request('https://ci.bigexec.invalid/x'), { params: Promise.resolve({ leagueId: LEAGUE }) })]) {
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('30');
      expect((await response.json()).code).toBe('rate_limited');
    }
    expect(state.memberLookups).toBe(0);
    expect(state.checked).toEqual([['machineApiByUser', 'user-1'], ['machineApiByUser', 'user-1']]);
  });

  it('continues to the normal authorization path when under the limit', async () => {
    const response = await toolsRoute(toolsRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('unauthorized');
  });
});
