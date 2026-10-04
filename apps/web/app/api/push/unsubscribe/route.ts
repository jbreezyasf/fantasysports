import { storeFailure } from '../../../../lib/notifications/store';
import { checkRateLimit, rateLimitedResponse } from '../../../../lib/security/rateLimit';
import { createClient } from '../../../../lib/supabase/server';

// Revokes one of the signed-in user's browser push subscriptions.

function fail(status: number, code: string, message: string) {
  return Response.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail(401, 'unauthenticated', 'Sign in to change push notifications.');

    const limited = await checkRateLimit('pushSubscriptionByUser', user.id);
    if (!limited.allowed) return rateLimitedResponse(limited);

    const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
    const endpoint = body?.endpoint;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2048) {
      return fail(400, 'invalid_request', 'That push subscription is not valid.');
    }

    const { data, error } = await supabase.rpc('revoke_push_subscription', { p_endpoint: endpoint });
    if (error) {
      if (storeFailure(error).reason === 'not_installed') return fail(503, 'push_not_configured', 'Push notifications are not available yet.');
      console.error('[push] revoke_push_subscription failed', error.code, error.message);
      return fail(500, 'server_error', 'Push could not be turned off. Please try again.');
    }
    return Response.json({ ok: true, revoked: data === true });
  } catch (error) {
    console.error('[push] unsubscribe failed', error instanceof Error ? error.message : error);
    return fail(500, 'server_error', 'Push could not be turned off. Please try again.');
  }
}
