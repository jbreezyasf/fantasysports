import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkRateLimit,
  checkRateLimits,
  clientIpFromHeaders,
  rateLimitKey,
  rateLimitRules,
  rateLimitedResponse,
  resetRateLimitWarningsForTests,
  type RateLimitClient
} from './rateLimit';

// In-memory stand-in with the same contract as public.rate_limit_hit.
function fakeDatabase(now = () => 0) {
  const counters = new Map<string, number>();
  const calls: Array<Record<string, unknown>> = [];
  const client: RateLimitClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, ...args });
      const windowSeconds = args.p_window_seconds as number;
      const window = Math.floor(now() / windowSeconds) * windowSeconds;
      const id = `${args.p_key}@${window}`;
      const hits = (counters.get(id) ?? 0) + 1;
      counters.set(id, hits);
      return { data: [{ allowed: hits <= (args.p_limit as number), hits, retry_after_seconds: window + windowSeconds - now() }], error: null };
    }
  };
  return { client, calls };
}

describe('checkRateLimit', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetRateLimitWarningsForTests();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('allows up to the limit, then denies with a retry time, then allows again in the next window', async () => {
    let time = 10;
    const { client, calls } = fakeDatabase(() => time);
    const { limit, windowSeconds } = rateLimitRules.authResetByEmail;
    for (let i = 0; i < limit; i += 1) {
      expect(await checkRateLimit('authResetByEmail', 'a@example.com', { client })).toEqual({ allowed: true, enforced: true, retryAfterSeconds: 0 });
    }
    expect(await checkRateLimit('authResetByEmail', 'a@example.com', { client })).toEqual({ allowed: false, enforced: true, retryAfterSeconds: windowSeconds - 10 });
    expect((await checkRateLimit('authResetByEmail', 'b@example.com', { client })).allowed).toBe(true);
    time = windowSeconds + 1;
    expect((await checkRateLimit('authResetByEmail', 'a@example.com', { client })).allowed).toBe(true);
    expect(calls[0]).toMatchObject({ fn: 'rate_limit_hit', p_limit: limit, p_window_seconds: windowSeconds });
  });

  it('never sends the raw identifier to the database', async () => {
    const { client, calls } = fakeDatabase();
    await checkRateLimit('authSignInByEmail', 'manager@example.com', { client });
    expect(JSON.stringify(calls)).not.toContain('manager@example.com');
    expect(calls[0].p_key).toBe(rateLimitKey('authSignInByEmail', 'manager@example.com'));
    expect(rateLimitKey('authSignInByEmail', 'x')).not.toBe(rateLimitKey('authResetByEmail', 'x'));
  });

  it('fails open with one logged warning when the function or table is absent', async () => {
    const client: RateLimitClient = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.rate_limit_hit' } }) };
    expect(await checkRateLimit('machineApiByUser', 'user-1', { client })).toEqual({ allowed: true, enforced: false, retryAfterSeconds: 0 });
    expect(await checkRateLimit('machineApiByUser', 'user-1', { client })).toEqual({ allowed: true, enforced: false, retryAfterSeconds: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[rate-limit] Not enforced');
  });

  it('fails open when the client throws or returns an unexpected shape', async () => {
    expect((await checkRateLimit('machineApiByUser', 'user-1', { client: { rpc: async () => { throw new Error('network down'); } } })).allowed).toBe(true);
    expect(await checkRateLimit('machineApiByUser', 'user-1', { client: { rpc: async () => ({ data: [{}], error: null }) } })).toEqual({ allowed: true, enforced: false, retryAfterSeconds: 0 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('fails open when the service-role client cannot be created', async () => {
    const result = await checkRateLimit('machineApiByUser', 'user-1');
    expect(result).toEqual({ allowed: true, enforced: false, retryAfterSeconds: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips the check when there is no identifier', async () => {
    const { client, calls } = fakeDatabase();
    expect((await checkRateLimit('authSignInByIp', null, { client })).allowed).toBe(true);
    expect(calls).toEqual([]);
  });

  it('checkRateLimits denies when any one limit is exceeded', async () => {
    const { client } = fakeDatabase();
    for (let i = 0; i < rateLimitRules.authSignInByEmail.limit; i += 1) {
      expect((await checkRateLimits([['authSignInByIp', '203.0.113.9'], ['authSignInByEmail', 'a@example.com']], { client })).allowed).toBe(true);
    }
    expect((await checkRateLimits([['authSignInByIp', '203.0.113.9'], ['authSignInByEmail', 'a@example.com']], { client })).allowed).toBe(false);
    expect((await checkRateLimits([['authSignInByIp', '203.0.113.9'], ['authSignInByEmail', 'other@example.com']], { client })).allowed).toBe(true);
  });
});

describe('rate limit helpers', () => {
  it('reads the client IP from platform headers', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.9' }))).toBe('198.51.100.7');
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });

  it('builds a 429 response with Retry-After', async () => {
    const response = rateLimitedResponse({ allowed: false, enforced: true, retryAfterSeconds: 42 });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect((await response.json()).code).toBe('rate_limited');
  });

  it('keeps the proposed migration out of supabase/migrations and locked to the service role', () => {
    const sql = readFileSync(join(process.cwd(), '../../supabase/migrations_proposed/20261004000000_rate_limit_counters.sql'), 'utf8');
    expect(sql).toContain('function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('to service_role');
  });
});
