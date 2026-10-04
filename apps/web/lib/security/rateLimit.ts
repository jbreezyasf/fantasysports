import { createHash } from 'node:crypto';

// Fixed-window rate limiting backed by one Postgres function, `public.rate_limit_hit`
// (see supabase/migrations_proposed/). It is reached through the existing service-role client,
// so it needs no new service and works across Vercel's stateless function instances.
//
// FAIL OPEN: if the function or table is absent, the service-role key is not configured, or
// the database call fails, the request is allowed and one warning is logged. Until the proposed
// migration is applied this module therefore changes nothing for users.

export type RateLimitRule = { limit: number; windowSeconds: number };

export type RateLimitResult = {
  allowed: boolean;
  // false when the limiter could not be consulted and the request was allowed by default.
  enforced: boolean;
  retryAfterSeconds: number;
};

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type RateLimitClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

export const rateLimitRules = {
  // Per client IP and per target email. Supabase Auth has its own limits; these stop the app's
  // server actions being used to hammer it.
  authSignInByIp: { limit: 30, windowSeconds: 300 },
  authSignInByEmail: { limit: 10, windowSeconds: 300 },
  authSignUpByIp: { limit: 10, windowSeconds: 3600 },
  authResetByIp: { limit: 10, windowSeconds: 900 },
  authResetByEmail: { limit: 5, windowSeconds: 900 },
  betaFeedbackByUser: { limit: 10, windowSeconds: 600 },
  // Shared by /api/assistant-gm/* and the /api/leagues/{leagueId}/* machine read routes.
  machineApiByUser: { limit: 120, windowSeconds: 60 },
  // /api/push/subscribe and /api/push/unsubscribe: a browser subscribes once per device.
  pushSubscriptionByUser: { limit: 20, windowSeconds: 600 },
  // /api/notifications/unsubscribe is reachable without a login (signed token).
  emailUnsubscribeByIp: { limit: 30, windowSeconds: 600 }
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitScope = keyof typeof rateLimitRules;

export const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.';

const warned = new Set<string>();
function warnOnce(reason: string, detail: string) {
  if (warned.has(reason)) return;
  warned.add(reason);
  console.warn(`[rate-limit] Not enforced (${reason}); allowing requests. ${detail}`);
}

export function resetRateLimitWarningsForTests() {
  warned.clear();
}

const OPEN: RateLimitResult = { allowed: true, enforced: false, retryAfterSeconds: 0 };

// Identifiers (emails, IPs, user ids) are hashed so the counter table holds no personal data.
export function rateLimitKey(scope: string, identifier: string) {
  return `${scope}:${createHash('sha256').update(`${scope}:${identifier}`).digest('hex').slice(0, 40)}`;
}

async function defaultClient(): Promise<RateLimitClient> {
  const { createAdminClient } = await import('../supabase/admin');
  return createAdminClient() as unknown as RateLimitClient;
}

export async function checkRateLimit(
  scope: RateLimitScope,
  identifier: string | null | undefined,
  options: { client?: RateLimitClient } = {}
): Promise<RateLimitResult> {
  // No identifier (for example no client IP header): there is nothing sound to count against.
  if (!identifier) return OPEN;
  const rule: RateLimitRule = rateLimitRules[scope];
  try {
    const client = options.client ?? await defaultClient();
    const { data, error } = await client.rpc('rate_limit_hit', {
      p_key: rateLimitKey(scope, identifier),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds
    });
    if (error) {
      warnOnce('database', `rate_limit_hit failed: ${error.code ?? ''} ${error.message ?? ''}`.trim());
      return OPEN;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown; retry_after_seconds?: unknown } | null;
    if (!row || typeof row.allowed !== 'boolean') {
      warnOnce('unexpected-response', 'rate_limit_hit returned an unexpected shape.');
      return OPEN;
    }
    const retryAfter = Number(row.retry_after_seconds);
    return {
      allowed: row.allowed,
      enforced: true,
      retryAfterSeconds: row.allowed ? 0 : Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : rule.windowSeconds
    };
  } catch (error) {
    warnOnce('unavailable', error instanceof Error ? error.message : String(error));
    return OPEN;
  }
}

// Checks several limits and returns the first denial, if any.
export async function checkRateLimits(
  checks: Array<[RateLimitScope, string | null | undefined]>,
  options: { client?: RateLimitClient } = {}
): Promise<RateLimitResult> {
  const results = await Promise.all(checks.map(([scope, identifier]) => checkRateLimit(scope, identifier, options)));
  return results.find(result => !result.allowed) ?? { allowed: true, enforced: results.some(result => result.enforced), retryAfterSeconds: 0 };
}

type HeaderReader = { get: (name: string) => string | null };

// Vercel sets these headers itself at the edge. A value is only used for counting, never for
// authorization.
export function clientIpFromHeaders(headers: HeaderReader): string | null {
  const candidate = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip') ?? headers.get('x-forwarded-for');
  const ip = candidate?.split(',')[0]?.trim();
  return ip ? ip.slice(0, 64) : null;
}

export function rateLimitedResponse(result: RateLimitResult) {
  return Response.json(
    { ok: false, code: 'rate_limited', message: RATE_LIMITED_MESSAGE },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, result.retryAfterSeconds)) } }
  );
}
