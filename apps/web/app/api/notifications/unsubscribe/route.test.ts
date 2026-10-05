import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  allowed: true,
  adminThrows: false,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcResult: { data: true as unknown, error: null as null | { code?: string; message?: string } }
}));

vi.mock('../../../../lib/security/rateLimit', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/security/rateLimit')>()),
  checkRateLimit: async () => ({ allowed: state.allowed, enforced: true, retryAfterSeconds: state.allowed ? 0 : 60 })
}));

vi.mock('../../../../lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (state.adminThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured for this deployment.');
    return { rpc: async (name: string, args: Record<string, unknown>) => { state.rpcCalls.push({ name, args }); return state.rpcResult; } };
  }
}));

import { signUnsubscribeToken } from '../../../../lib/notifications/unsubscribeToken';
import { GET, POST } from './route';

const SECRET = 'unit-test-secret-unit-test-secret-0123456789';
const USER = '0b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10';
const token = signUnsubscribeToken(USER, SECRET);

function oneClick(value: string | null) {
  return new Request(`https://ci.bigexec.invalid/api/notifications/unsubscribe${value === null ? '' : `?token=${encodeURIComponent(value)}`}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click'
  });
}

function fromPage(value: string, lang?: string) {
  const body = new URLSearchParams({ source: 'page', ...(lang ? { lang } : {}) });
  return new Request(`https://ci.bigexec.invalid/api/notifications/unsubscribe?token=${encodeURIComponent(value)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
}

beforeEach(() => {
  state.allowed = true;
  state.adminThrows = false;
  state.rpcCalls = [];
  state.rpcResult = { data: true, error: null };
  vi.unstubAllEnvs();
  vi.stubEnv('NOTIFICATIONS_UNSUBSCRIBE_SECRET', SECRET);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('email unsubscribe endpoint', () => {
  it('handles the RFC 8058 one-click POST with no login and switches league email off for that user only', async () => {
    const response = await POST(oneClick(token));
    expect(response.status).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: 'notification_unsubscribe_email', args: { p_user_id: USER } }]);
  });

  it('redirects the page button back to the confirmation, keeping the language', async () => {
    const response = await POST(fromPage(token, 'es'));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/unsubscribe?state=done&lang=es');
  });

  it('rejects a missing, forged or tampered token without touching the database', async () => {
    for (const bad of [null, 'preview', `${token}x`, signUnsubscribeToken(USER, `${SECRET}-other-key`)]) {
      expect((await POST(oneClick(bad))).status).toBe(400);
    }
    expect((await POST(fromPage('junk'))).headers.get('Location')).toBe('/unsubscribe?state=invalid');
    expect(state.rpcCalls).toEqual([]);
  });

  it('GET changes nothing, so link scanners cannot unsubscribe anyone', async () => {
    expect(GET().status).toBe(405);
    expect(state.rpcCalls).toEqual([]);
  });

  it('is inert without the secret, the service key or the tables: 503, never a throw', async () => {
    vi.stubEnv('NOTIFICATIONS_UNSUBSCRIBE_SECRET', '');
    expect((await POST(oneClick(token))).status).toBe(503);
    vi.stubEnv('NOTIFICATIONS_UNSUBSCRIBE_SECRET', SECRET);
    state.adminThrows = true;
    expect((await POST(oneClick(token))).status).toBe(503);
    state.adminThrows = false;
    state.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    expect((await POST(oneClick(token))).status).toBe(503);
    expect((await POST(fromPage(token))).headers.get('Location')).toBe('/unsubscribe?state=unavailable');
  });

  it('is rate limited by client address', async () => {
    state.allowed = false;
    const response = await POST(oneClick(token));
    expect(response.status).toBe(429);
    expect(state.rpcCalls).toEqual([]);
  });
});
