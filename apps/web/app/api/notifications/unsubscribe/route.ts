import { unsubscribeSecret, verifyUnsubscribeToken } from '../../../../lib/notifications/unsubscribeToken';
import { checkRateLimit, clientIpFromHeaders, rateLimitedResponse } from '../../../../lib/security/rateLimit';

// Email unsubscribe without a login. Two callers:
//   - mail clients, which POST "List-Unsubscribe=One-Click" to the List-Unsubscribe URL (RFC 8058);
//   - the button on /unsubscribe, which posts a form with source=page and is redirected back.
// GET does nothing on purpose: link scanners fetch URLs in email and must not unsubscribe anyone.
// This only switches league email off in notification_preferences. Security email (password
// reset) is sent by Supabase Auth and is not affected.

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const fromPage = form?.get('source') === 'page';
  const lang = form?.get('lang') === 'es' ? '&lang=es' : '';
  const token = url.searchParams.get('token') ?? (typeof form?.get('token') === 'string' ? String(form.get('token')) : null);
  const done = (state: 'done' | 'invalid' | 'unavailable', status: number) => fromPage
    ? new Response(null, { status: 303, headers: { Location: `/unsubscribe?state=${state}${lang}` } })
    : Response.json({ ok: state === 'done', code: state }, { status });

  try {
    const limited = await checkRateLimit('emailUnsubscribeByIp', clientIpFromHeaders(request.headers));
    if (!limited.allowed) return rateLimitedResponse(limited);

    const secret = unsubscribeSecret();
    if (!secret) return done('unavailable', 503);
    const userId = verifyUnsubscribeToken(token, secret);
    if (!userId) return done('invalid', 400);

    const { createAdminClient } = await import('../../../../lib/supabase/admin');
    const { data, error } = await createAdminClient().rpc('notification_unsubscribe_email', { p_user_id: userId });
    if (error) {
      console.error('[notifications] unsubscribe failed', error.code, error.message);
      return done('unavailable', 503);
    }
    // An unknown user gets the same answer as a known one.
    void data;
    return done('done', 200);
  } catch (error) {
    console.error('[notifications] unsubscribe failed', error instanceof Error ? error.message : error);
    return done('unavailable', 503);
  }
}

export function GET() {
  return Response.json({ ok: false, code: 'method_not_allowed', message: 'Open the unsubscribe link from your email and press the button.' }, { status: 405, headers: { Allow: 'POST' } });
}
