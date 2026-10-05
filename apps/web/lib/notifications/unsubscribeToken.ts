import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed, login-free unsubscribe tokens: `v1.<base64url user id>.<base64url HMAC-SHA256>`.
// The token names only the user; it carries no email address. It does not expire, because an
// unsubscribe link in an old email must keep working.

const VERSION = 'v1';
const MIN_SECRET_LENGTH = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function unsubscribeSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.NOTIFICATIONS_UNSUBSCRIBE_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`${VERSION}.${payload}`).digest('base64url');
}

export function signUnsubscribeToken(userId: string, secret: string): string {
  if (!UUID.test(userId)) throw new Error('signUnsubscribeToken: user id must be a UUID');
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('signUnsubscribeToken: secret is too short');
  const payload = Buffer.from(userId.toLowerCase(), 'utf8').toString('base64url');
  return `${VERSION}.${payload}.${sign(payload, secret)}`;
}

// Returns the user id, or null for anything malformed, tampered with or signed with another key.
export function verifyUnsubscribeToken(token: unknown, secret: string | null): string | null {
  if (!secret || typeof token !== 'string' || token.length > 300) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const expected = Buffer.from(sign(parts[1], secret));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const userId = Buffer.from(parts[1], 'base64url').toString('utf8');
  return UUID.test(userId) ? userId : null;
}

export function unsubscribeUrls(appUrl: string, token: string, locale: 'en' | 'es-419' = 'en') {
  const base = appUrl.replace(/\/+$/, '');
  const query = `token=${encodeURIComponent(token)}${locale === 'es-419' ? '&lang=es' : ''}`;
  return {
    // Shown in the email body: a page with one button.
    page: `${base}/unsubscribe?${query}`,
    // List-Unsubscribe header target: mail clients POST here (RFC 8058 one-click).
    oneClick: `${base}/api/notifications/unsubscribe?${query}`
  };
}
