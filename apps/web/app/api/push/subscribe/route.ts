import { pushChannelStatus } from '../../../../lib/notifications/channels';
import { storeFailure } from '../../../../lib/notifications/store';
import { checkRateLimit, rateLimitedResponse } from '../../../../lib/security/rateLimit';
import { createClient } from '../../../../lib/supabase/server';

// Stores the signed-in user's browser push subscription. The browser only calls this after the
// user pressed "Turn on push on this device" and granted permission.

function fail(status: number, code: string, message: string) {
  return Response.json({ ok: false, code, message }, { status });
}

function isBase64Url(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_\-+/=]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail(401, 'unauthenticated', 'Sign in to enable push notifications.');

    const limited = await checkRateLimit('pushSubscriptionByUser', user.id);
    if (!limited.allowed) return rateLimitedResponse(limited);

    // Without VAPID keys nothing could ever be delivered, so no subscription is stored.
    if (!pushChannelStatus().ready) return fail(503, 'push_not_configured', 'Push notifications are not available yet.');

    const body = await request.json().catch(() => null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
    const endpoint = body?.endpoint;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2048
      || !isBase64Url(body?.keys?.p256dh, 20, 256) || !isBase64Url(body?.keys?.auth, 8, 128)) {
      return fail(400, 'invalid_request', 'That push subscription is not valid.');
    }

    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: endpoint,
      p_p256dh: body!.keys!.p256dh,
      p_auth: body!.keys!.auth,
      p_user_agent: request.headers.get('user-agent')?.slice(0, 400) ?? null
    });
    if (error) {
      const failure = storeFailure(error);
      if (failure.reason === 'not_installed') return fail(503, 'push_not_configured', 'Push notifications are not available yet.');
      if (error.code === '22023') return fail(400, 'invalid_request', error.message);
      console.error('[push] save_push_subscription failed', error.code, error.message);
      return fail(500, 'server_error', 'Push could not be turned on. Please try again.');
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[push] subscribe failed', error instanceof Error ? error.message : error);
    return fail(500, 'server_error', 'Push could not be turned on. Please try again.');
  }
}
