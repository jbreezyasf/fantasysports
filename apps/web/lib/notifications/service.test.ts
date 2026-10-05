import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailSender, createPushSender, emailChannelStatus, pushChannelStatus, sendingEnabled } from './channels';
import { readinessChecks } from './readiness';
import { rowFromInput } from './announcements';
import { chaosWeek2026Announcement } from './seeds/chaosWeek2026';
import { sendAnnouncement } from './service';
import { listAnnouncements, storeFailure, type Db } from './store';

const webPush = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: webPush }));

const ID = '5b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10';
const OPERATOR = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.test' };
const SECRET = 'unit-test-secret-unit-test-secret-0123456789';
const LIVE_ENV = { NOTIFICATIONS_SEND_ENABLED: 'true', NOTIFICATIONS_UNSUBSCRIBE_SECRET: SECRET, NEXT_PUBLIC_APP_URL: 'https://bigexecfs.com' };

type Result = { data: unknown; error: { code?: string; message?: string } | null };

// A stand-in for the Supabase client: every query on a table resolves to that table's result,
// every rpc to that function's result, and every call is recorded.
function fakeDb(tables: Record<string, Result>, rpcs: Record<string, Result | ((args: Record<string, unknown>) => Result)>) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit', 'insert', 'update']) chain[method] = (...args: unknown[]) => { if (method === 'update' || method === 'insert') calls.push(`${method}:${table}:${JSON.stringify(args[0])}`); return chain; };
      chain.maybeSingle = async () => ({ ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data });
      chain.single = chain.maybeSingle;
      chain.then = (resolve: (value: Result) => unknown) => resolve(result);
      return chain;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(`rpc:${name}`);
      const result = rpcs[name] ?? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` } };
      return typeof result === 'function' ? result(args) : result;
    }
  };
  return { db: db as unknown as Db, calls };
}

const draftRow = { id: ID, ...rowFromInput(chaosWeek2026Announcement), status: 'draft', created_by: OPERATOR.id, created_at: '2026-10-04T00:00:00Z', sent_at: null, result: null };
const audienceRows = [
  { user_id: '00000000-0000-4000-8000-000000000011', email: 'a@example.test', email_enabled: true, push_enabled: false, league_announcements: true, locale: 'en' },
  { user_id: '00000000-0000-4000-8000-000000000012', email: 'b@example.test', email_enabled: true, push_enabled: false, league_announcements: true, locale: 'es-419' }
];

function installedDb(overrides: Record<string, Result | ((args: Record<string, unknown>) => Result)> = {}) {
  return fakeDb(
    {
      notifications: { data: draftRow, error: null },
      league_seasons: { data: { id: draftRow.league_season_id, fantasy_leagues: { name: 'Stress Test 2026' } }, error: null },
      push_subscriptions: { data: [], error: null },
      notification_deliveries: { data: null, error: null }
    },
    {
      notification_audience: { data: audienceRows, error: null },
      notification_claim_delivery: { data: true, error: null },
      notification_begin_send: { data: 'started', error: null },
      notification_finish_send: { data: 'sent', error: null },
      ...overrides
    }
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('inert without configuration', () => {
  it('reports what is missing instead of being ready', () => {
    expect(sendingEnabled({})).toBe(false);
    expect(sendingEnabled({ NOTIFICATIONS_SEND_ENABLED: '1' })).toBe(false);
    expect(sendingEnabled({ NOTIFICATIONS_SEND_ENABLED: 'true' })).toBe(true);
    expect(emailChannelStatus({})).toEqual({ ready: false, missing: ['RESEND_BIGEXEC_API_KEY', 'NOTIFICATIONS_UNSUBSCRIBE_SECRET', 'NEXT_PUBLIC_APP_URL'] });
    expect(pushChannelStatus({})).toEqual({ ready: false, missing: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] });
    expect(pushChannelStatus({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b', VAPID_SUBJECT: 'not-a-contact' }).missing).toEqual(['VAPID_SUBJECT']);
    expect(createEmailSender({})).toBeNull();
    expect(createPushSender({})).toBeNull();
    expect(readinessChecks(false, false, {}).every(check => !check.ok)).toBe(true);
    expect(readinessChecks(false, false, {}).map(check => check.text).join(' ')).not.toMatch(/sk_|re_/);
  });

  it('refuses a live or test send while NOTIFICATIONS_SEND_ENABLED is not true, before touching the database', async () => {
    const { db, calls } = installedDb();
    for (const mode of ['live', 'test'] as const) {
      const result = await sendAnnouncement({ notificationId: ID, mode, actor: OPERATOR }, { db, env: {} });
      expect(result).toMatchObject({ ok: false, code: 'sending_disabled' });
    }
    expect(calls).toEqual([]);
  });

  it('refuses cleanly when the notification tables do not exist', async () => {
    const { db } = fakeDb({}, {});
    expect(await listAnnouncements(db)).toMatchObject({ ok: false, reason: 'not_installed' });
    for (const mode of ['dry_run', 'live'] as const) {
      const result = await sendAnnouncement({ notificationId: ID, mode, actor: OPERATOR }, { db, env: LIVE_ENV });
      expect(result).toMatchObject({ ok: false, code: 'not_installed' });
    }
    expect(storeFailure({ code: 'PGRST205', message: "Could not find the table 'public.notifications' in the schema cache" }).reason).toBe('not_installed');
    expect(storeFailure({ code: '57014', message: 'canceling statement due to statement timeout' }).reason).toBe('database_error');
  });

  it('returns a result, never throws, when the database client itself throws', async () => {
    const db = { from() { throw new Error('fetch failed'); }, rpc() { throw new Error('fetch failed'); } } as unknown as Db;
    await expect(sendAnnouncement({ notificationId: ID, mode: 'dry_run', actor: OPERATOR }, { db, env: {} })).resolves.toMatchObject({ ok: false, code: 'database_error' });
  });

  it('with sending enabled but no provider key, records failures and calls no provider', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = installedDb();
    const result = await sendAnnouncement({ notificationId: ID, mode: 'live', actor: OPERATOR }, { db, env: LIVE_ENV });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.email.failed).toBe(2);
    expect(result.report.failures[0].error).toBe('Email provider is not configured');
    expect(result.report.complete).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
});

describe('sendAnnouncement', () => {
  it('dry run works with no keys, calls no provider and does not change the announcement status', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db, calls } = installedDb();
    const result = await sendAnnouncement({ notificationId: ID, mode: 'dry_run', actor: OPERATOR }, { db, env: { NOTIFICATIONS_UNSUBSCRIBE_SECRET: SECRET, NEXT_PUBLIC_APP_URL: 'https://bigexecfs.com' } });
    expect(result).toMatchObject({ ok: true, mode: 'dry_run', status: 'draft' });
    if (!result.ok) return;
    expect(result.report.email.wouldSend).toBe(2);
    expect(result.report.dryRun).toBe(true);
    expect(calls).not.toContain('rpc:notification_begin_send');
    expect(calls).not.toContain('rpc:notification_finish_send');
    expect(calls.filter(call => call.startsWith('update:notification_deliveries')).every(call => call.includes('"status":"would_send"') || call.includes('"status":"skipped"'))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('live send goes through begin_send and finish_send and reports per channel', async () => {
    const sent: string[] = [];
    const { db, calls } = installedDb();
    const result = await sendAnnouncement(
      { notificationId: ID, mode: 'live', actor: OPERATOR },
      { db, env: LIVE_ENV, email: { async send(message) { sent.push(message.to); return { ok: true, id: 'x' }; } }, push: null }
    );
    expect(result).toMatchObject({ ok: true, mode: 'live', status: 'sent' });
    expect(sent).toEqual(['a@example.test', 'b@example.test']);
    expect(calls.indexOf('rpc:notification_begin_send')).toBeLessThan(calls.indexOf('rpc:notification_claim_delivery'));
    expect(calls.at(-1)).toBe('rpc:notification_finish_send');
  });

  it('refuses a live send the database will not start (already sent or cancelled)', async () => {
    const sent: string[] = [];
    const { db } = installedDb({ notification_begin_send: { data: 'refused:sent', error: null } });
    const result = await sendAnnouncement({ notificationId: ID, mode: 'live', actor: OPERATOR }, { db, env: LIVE_ENV, email: { async send(message) { sent.push(message.to); return { ok: true, id: 'x' }; } }, push: null });
    expect(result).toMatchObject({ ok: false, code: 'wrong_status' });
    expect(sent).toEqual([]);
  });

  it('a test send goes to the operator only and never starts the live send', async () => {
    const sent: string[] = [];
    const { db, calls } = installedDb();
    const result = await sendAnnouncement({ notificationId: ID, mode: 'test', actor: OPERATOR }, { db, env: LIVE_ENV, email: { async send(message) { sent.push(`${message.to}|${message.subject}`); return { ok: true, id: 'x' }; } }, push: null });
    expect(result).toMatchObject({ ok: true, mode: 'test', status: 'draft' });
    expect(sent).toEqual([`owner@example.test|[TEST] ${chaosWeek2026Announcement.en.title}`]);
    expect(calls).not.toContain('rpc:notification_audience');
    expect(calls).not.toContain('rpc:notification_begin_send');
  });
});

describe('web push sender', () => {
  const env = { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'mailto:owner@example.test' };
  const target = { id: 's1', endpoint: 'https://push.example/s1', p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) };

  it('passes the subscription keys and VAPID details to the web-push library', async () => {
    webPush.sendNotification.mockResolvedValueOnce({ statusCode: 201 });
    const result = await createPushSender(env)!.send(target, '{"title":"x"}', { topic: 'abc' });
    expect(result).toEqual({ ok: true });
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      '{"title":"x"}',
      expect.objectContaining({ topic: 'abc', vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: 'public', privateKey: 'private' } })
    );
  });

  it('marks 404 and 410 as gone, other errors as retryable, and never throws', async () => {
    const sender = createPushSender(env)!;
    for (const [statusCode, gone] of [[410, true], [404, true], [429, false], [500, false]] as const) {
      webPush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('Received unexpected response code'), { statusCode }));
      expect(await sender.send(target, '{}', { topic: 't' })).toMatchObject({ ok: false, gone, statusCode });
    }
    webPush.sendNotification.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));
    expect(await sender.send(target, '{}', { topic: 't' })).toEqual({ ok: false, gone: false, statusCode: null, error: 'getaddrinfo ENOTFOUND' });
  });
});
