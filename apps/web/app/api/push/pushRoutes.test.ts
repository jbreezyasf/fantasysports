import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  allowed: true,
  checked: [] as Array<[string, string | null]>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcResult: { data: null as unknown, error: null as null | { code?: string; message?: string } }
}));

vi.mock('../../../lib/security/rateLimit', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/security/rateLimit')>()),
  checkRateLimit: async (scope: string, identifier: string | null) => {
    state.checked.push([scope, identifier]);
    return { allowed: state.allowed, enforced: true, retryAfterSeconds: state.allowed ? 0 : 45 };
  }
}));

vi.mock('../../../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult;
    }
  })
}));

import { rateLimitRules } from '../../../lib/security/rateLimit';
import { POST as subscribe } from './subscribe/route';
import { POST as unsubscribe } from './unsubscribe/route';

const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };

function request(path: string, body: unknown) {
  return new Request(`https://ci.bigexec.invalid/api/push/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'UnitTest/1.0' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

beforeEach(() => {
  state.user = { id: 'user-1' };
  state.allowed = true;
  state.checked = [];
  state.rpcCalls = [];
  state.rpcResult = { data: 'sub-id', error: null };
  vi.unstubAllEnvs();
  vi.stubEnv('VAPID_PUBLIC_KEY', 'public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:owner@example.test');
});

describe('push subscribe and unsubscribe routes', () => {
  it('require a signed-in user before anything else', async () => {
    state.user = null;
    for (const response of [await subscribe(request('subscribe', subscription)), await unsubscribe(request('unsubscribe', subscription))]) {
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('unauthenticated');
    }
    expect(state.checked).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
  });

  it('are rate limited per user: 429 with Retry-After and no database write', async () => {
    state.allowed = false;
    for (const response of [await subscribe(request('subscribe', subscription)), await unsubscribe(request('unsubscribe', subscription))]) {
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('45');
      expect((await response.json()).code).toBe('rate_limited');
    }
    expect(state.checked).toEqual([['pushSubscriptionByUser', 'user-1'], ['pushSubscriptionByUser', 'user-1']]);
    expect(state.rpcCalls).toEqual([]);
    expect(rateLimitRules.pushSubscriptionByUser).toEqual({ limit: 20, windowSeconds: 600 });
  });

  it('subscribe stores the subscription for the caller through the RPC', async () => {
    const response = await subscribe(request('subscribe', subscription));
    expect(response.status).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: 'save_push_subscription', args: { p_endpoint: subscription.endpoint, p_p256dh: subscription.keys.p256dh, p_auth: subscription.keys.auth, p_user_agent: 'UnitTest/1.0' } }]);
  });

  it('subscribe is inert (503, nothing stored) while VAPID keys are not set', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const response = await subscribe(request('subscribe', subscription));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('push_not_configured');
    expect(state.rpcCalls).toEqual([]);
  });

  it('both routes answer 503 while the migration is not applied', async () => {
    state.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_push_subscription in the schema cache' } };
    for (const response of [await subscribe(request('subscribe', subscription)), await unsubscribe(request('unsubscribe', subscription))]) {
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe('push_not_configured');
    }
  });

  it('reject malformed subscriptions without calling the database', async () => {
    const bad = [
      'not json',
      {},
      { ...subscription, endpoint: 'http://push.example/insecure' },
      { ...subscription, endpoint: `https://push.example/${'x'.repeat(2100)}` },
      { endpoint: subscription.endpoint, keys: { p256dh: 'short', auth: subscription.keys.auth } },
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: '<script>' } }
    ];
    for (const body of bad) expect((await subscribe(request('subscribe', body))).status).toBe(400);
    expect((await unsubscribe(request('unsubscribe', { endpoint: 'javascript:alert(1)' }))).status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });

  it('unsubscribe revokes only through the caller-scoped RPC and reports whether anything was revoked', async () => {
    state.rpcResult = { data: false, error: null };
    const response = await unsubscribe(request('unsubscribe', { endpoint: subscription.endpoint }));
    expect(await response.json()).toEqual({ ok: true, revoked: false });
    expect(state.rpcCalls).toEqual([{ name: 'revoke_push_subscription', args: { p_endpoint: subscription.endpoint } }]);
  });

  it('do not leak database errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.rpcResult = { data: null, error: { code: 'XX000', message: 'internal detail about table layout' } };
    const response = await subscribe(request('subscribe', subscription));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('internal detail');
  });
});
