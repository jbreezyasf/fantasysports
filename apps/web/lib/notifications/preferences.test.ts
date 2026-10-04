import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_CATEGORIES, preferencesFromRow, resolveChannel } from './preferences';
import { signUnsubscribeToken, unsubscribeSecret, unsubscribeUrls, verifyUnsubscribeToken } from './unsubscribeToken';

const USER = '0b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10';
const SECRET = 'unit-test-secret-unit-test-secret-0123456789';

describe('notification preference resolution', () => {
  it('defaults an existing member with no row to league email on and push off', () => {
    const preferences = preferencesFromRow(null);
    expect(preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(resolveChannel(preferences, category, 'email')).toEqual({ deliver: true });
      expect(resolveChannel(preferences, category, 'push')).toEqual({ deliver: false, reason: 'channel_off' });
    }
  });

  it('never turns push on from a malformed row', () => {
    const preferences = preferencesFromRow({ push_enabled: 'true', email_enabled: null, locale: 'fr', league_announcements: 1 });
    expect(preferences.pushEnabled).toBe(false);
    expect(preferences.emailEnabled).toBe(true);
    expect(preferences.locale).toBe('en');
    expect(preferences.categories.league_announcements).toBe(true);
  });

  it('applies the channel switch, then the category switch', () => {
    const preferences = preferencesFromRow({ email_enabled: true, push_enabled: true, league_announcements: false, weekly_recap: true, locale: 'es-419' });
    expect(preferences.locale).toBe('es-419');
    expect(resolveChannel(preferences, 'league_announcements', 'email')).toEqual({ deliver: false, reason: 'category_off' });
    expect(resolveChannel(preferences, 'league_announcements', 'push')).toEqual({ deliver: false, reason: 'category_off' });
    expect(resolveChannel(preferences, 'weekly_recap', 'push')).toEqual({ deliver: true });
    expect(resolveChannel({ ...preferences, emailEnabled: false }, 'weekly_recap', 'email')).toEqual({ deliver: false, reason: 'channel_off' });
  });
});

describe('unsubscribe tokens', () => {
  it('round-trips a user id and carries no email address', () => {
    const token = signUnsubscribeToken(USER, SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(USER);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('@');
  });

  it('rejects a tampered payload, a tampered signature, another key and junk', () => {
    const token = signUnsubscribeToken(USER, SECRET);
    const [version, payload, signature] = token.split('.');
    const otherPayload = Buffer.from('11111111-1111-4111-8111-111111111111').toString('base64url');
    expect(verifyUnsubscribeToken(`${version}.${otherPayload}.${signature}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${version}.${payload}.${signature.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(token, `${SECRET}-other`)).toBeNull();
    expect(verifyUnsubscribeToken(`v2.${payload}.${signature}`, SECRET)).toBeNull();
    for (const junk of [undefined, null, '', 'preview', 'a.b', 'a.b.c.d', 42, 'x'.repeat(400)]) expect(verifyUnsubscribeToken(junk, SECRET)).toBeNull();
  });

  it('verifies nothing when the secret is not configured', () => {
    expect(unsubscribeSecret({})).toBeNull();
    expect(unsubscribeSecret({ NOTIFICATIONS_UNSUBSCRIBE_SECRET: 'too-short' })).toBeNull();
    expect(unsubscribeSecret({ NOTIFICATIONS_UNSUBSCRIBE_SECRET: SECRET })).toBe(SECRET);
    expect(verifyUnsubscribeToken(signUnsubscribeToken(USER, SECRET), null)).toBeNull();
  });

  it('refuses to sign for a non-UUID user or with a short secret', () => {
    expect(() => signUnsubscribeToken('not-a-uuid', SECRET)).toThrow();
    expect(() => signUnsubscribeToken(USER, 'short')).toThrow();
  });

  it('builds the page link and the one-click POST target', () => {
    const urls = unsubscribeUrls('https://bigexecfs.com/', 'v1.a.b', 'es-419');
    expect(urls.page).toBe('https://bigexecfs.com/unsubscribe?token=v1.a.b&lang=es');
    expect(urls.oneClick).toBe('https://bigexecfs.com/api/notifications/unsubscribe?token=v1.a.b&lang=es');
    expect(unsubscribeUrls('https://bigexecfs.com', 'v1.a.b').page).toBe('https://bigexecfs.com/unsubscribe?token=v1.a.b');
  });
});
