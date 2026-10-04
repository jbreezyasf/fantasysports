import { beforeEach, describe, expect, it } from 'vitest';
import type { Announcement } from './announcements';
import type { EmailMessage, EmailSender, PushSender, PushTarget } from './channels';
import { countRecipients, fanOutAnnouncement, type DeliveryOutcome, type FanoutInput, type FanoutStore, type Recipient } from './fanout';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from './preferences';
import { chaosWeek2026Announcement } from './seeds/chaosWeek2026';
import { verifyUnsubscribeToken } from './unsubscribeToken';

const SECRET = 'unit-test-secret-unit-test-secret-0123456789';
const NOTIFICATION = '5b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10';
const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const announcement: Announcement = { ...chaosWeek2026Announcement, id: NOTIFICATION, kind: 'league_announcement', status: 'sending', createdBy: null, createdAt: null, sentAt: null, result: null };

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...overrides };
}

// In-memory store with the same claim rules as notification_claim_delivery in the migration.
class MemoryStore implements FanoutStore {
  rows = new Map<string, { status: string; attempts: number; outcome?: DeliveryOutcome }>();
  targets = new Map<string, PushTarget[]>();
  revoked: Array<{ id: string; reason: string }> = [];
  succeeded: string[] = [];
  failRecordFor: string | null = null;

  key(notificationId: string, userId: string, channel: string, purpose: string) { return `${notificationId}|${userId}|${channel}|${purpose}`; }
  async claimDelivery(notificationId: string, userId: string, channel: 'email' | 'push', purpose: 'live' | 'test') {
    const key = this.key(notificationId, userId, channel, purpose);
    const row = this.rows.get(key);
    if (!row) { this.rows.set(key, { status: 'sending', attempts: 1 }); return true; }
    const reclaim = purpose === 'test' ? row.status !== 'sending' : row.status === 'skipped' || row.status === 'would_send' || (row.status === 'failed' && row.attempts < 5);
    if (!reclaim) return false;
    this.rows.set(key, { status: 'sending', attempts: row.attempts + 1 });
    return true;
  }
  async recordDelivery(notificationId: string, userId: string, channel: 'email' | 'push', purpose: 'live' | 'test', outcome: DeliveryOutcome) {
    if (this.failRecordFor === userId) throw new Error('database unavailable');
    const key = this.key(notificationId, userId, channel, purpose);
    this.rows.set(key, { status: outcome.status, attempts: this.rows.get(key)?.attempts ?? 1, outcome });
  }
  async listPushTargets(userIds: string[]) {
    return new Map(userIds.filter(id => this.targets.has(id)).map(id => [id, this.targets.get(id)!.filter(target => !this.revoked.some(item => item.id === target.id))]));
  }
  async markPushSuccess(id: string) { this.succeeded.push(id); }
  async revokePushTarget(id: string, reason: string) { this.revoked.push({ id, reason }); }
  status(userId: string, channel: string, purpose = 'live') { return this.rows.get(this.key(NOTIFICATION, userId, channel, purpose))?.status; }
}

class FakeEmail implements EmailSender {
  sent: EmailMessage[] = [];
  failFor = new Set<string>();
  throwFor = new Set<string>();
  async send(message: EmailMessage) {
    if (this.throwFor.has(message.to)) throw new Error('socket hang up');
    if (this.failFor.has(message.to)) return { ok: false as const, error: 'Email provider error 500: boom' };
    this.sent.push(message);
    return { ok: true as const, id: `email-${this.sent.length}` };
  }
}

class FakePush implements PushSender {
  sent: Array<{ id: string; payload: string; topic: string }> = [];
  gone = new Map<string, number>();
  failing = new Set<string>();
  async send(target: PushTarget, payload: string, options: { topic: string }) {
    if (this.gone.has(target.id)) return { ok: false as const, gone: true, statusCode: this.gone.get(target.id)!, error: 'gone' };
    if (this.failing.has(target.id)) return { ok: false as const, gone: false, statusCode: 503, error: 'push service unavailable' };
    this.sent.push({ id: target.id, payload, topic: options.topic });
    return { ok: true as const };
  }
}

const target = (id: string): PushTarget => ({ id, endpoint: `https://push.example/${id}`, p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) });

let store: MemoryStore;
let email: FakeEmail;
let push: FakePush;
let recipients: Recipient[];

function input(overrides: Partial<FanoutInput> = {}): FanoutInput {
  return { announcement, leagueName: 'Stress Test 2026', recipients, purpose: 'live', dryRun: false, store, email, push, appUrl: 'https://bigexecfs.com', unsubscribeSecret: SECRET, ...overrides };
}

beforeEach(() => {
  store = new MemoryStore();
  email = new FakeEmail();
  push = new FakePush();
  recipients = [
    { userId: user(1), email: 'one@example.test', preferences: prefs() },
    { userId: user(2), email: 'two@example.test', preferences: prefs({ pushEnabled: true, locale: 'es-419' }) },
    { userId: user(3), email: 'three@example.test', preferences: prefs({ emailEnabled: false, pushEnabled: true }) },
    { userId: user(4), email: 'four@example.test', preferences: prefs({ categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, league_announcements: false }, pushEnabled: true }) },
    { userId: user(5), email: null, preferences: prefs() }
  ];
  store.targets.set(user(2), [target('sub-2a'), target('sub-2b')]);
  store.targets.set(user(3), [target('sub-3')]);
  store.targets.set(user(4), [target('sub-4')]);
});

describe('announcement fan-out', () => {
  it('sends each member only the channels they enabled, in their language', async () => {
    const report = await fanOutAnnouncement(input());
    expect(email.sent.map(message => message.to)).toEqual(['one@example.test', 'two@example.test']);
    expect(push.sent.map(item => item.id)).toEqual(['sub-2a', 'sub-2b', 'sub-3']);
    expect(report.email).toEqual({ sent: 2, wouldSend: 0, skipped: 3, failed: 0, alreadyHandled: 0 });
    expect(report.push).toEqual({ sent: 2, wouldSend: 0, skipped: 3, failed: 0, alreadyHandled: 0 });
    expect(report.complete).toBe(true);

    expect(email.sent[0].subject).toBe(chaosWeek2026Announcement.en.title);
    expect(email.sent[1].subject).toBe(chaosWeek2026Announcement.es!.title);
    expect(email.sent[1].html).toContain('<html lang="es-419">');
    expect(JSON.parse(push.sent[0].payload)).toMatchObject({ title: 'Semana del Caos: nuevas reglas', url: '/dashboard', lang: 'es-419' });
    expect(JSON.parse(push.sent[2].payload).title).toBe('Chaos Week: new rules');
    expect(push.sent[0].topic).toMatch(/^[0-9a-f]{32}$/);
    expect(store.succeeded).toEqual(['sub-2a', 'sub-2b', 'sub-3']);
    expect(store.status(user(4), 'email')).toBe('skipped');
    expect(store.status(user(5), 'email')).toBe('skipped');
  });

  it('puts a working signed unsubscribe link and List-Unsubscribe headers on every email', async () => {
    await fanOutAnnouncement(input());
    for (const [index, message] of email.sent.entries()) {
      const header = message.headers['List-Unsubscribe'];
      expect(header).toMatch(/^<https:\/\/bigexecfs\.com\/api\/notifications\/unsubscribe\?token=[^>]+>$/);
      expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      const token = new URL(header.slice(1, -1)).searchParams.get('token');
      expect(verifyUnsubscribeToken(token, SECRET)).toBe(user(index + 1));
      expect(message.html).toContain(`https://bigexecfs.com/unsubscribe?token=${token}`);
      expect(message.text).toContain(`https://bigexecfs.com/unsubscribe?token=${token}`);
      expect(message.idempotencyKey).toBe(`notification/${NOTIFICATION}/${user(index + 1)}/email`);
    }
  });

  it('does not send twice when the job is retried', async () => {
    await fanOutAnnouncement(input());
    const second = await fanOutAnnouncement(input());
    expect(email.sent).toHaveLength(2);
    expect(push.sent).toHaveLength(3);
    expect(second.email.sent).toBe(0);
    expect(second.push.sent).toBe(0);
    expect(second.email.alreadyHandled).toBe(2);
    expect(second.push.alreadyHandled).toBe(2);
  });

  it('isolates failures: one failing or throwing recipient does not stop the rest, and is reported', async () => {
    email.failFor.add('one@example.test');
    email.throwFor.add('two@example.test');
    push.failing.add('sub-3');
    recipients.push({ userId: user(6), email: 'six@example.test', preferences: prefs() });
    const report = await fanOutAnnouncement(input());
    expect(email.sent.map(message => message.to)).toEqual(['six@example.test']);
    expect(push.sent.map(item => item.id)).toEqual(['sub-2a', 'sub-2b']);
    expect(report.complete).toBe(false);
    expect(report.failures).toEqual([
      { userId: user(1), channel: 'email', error: 'Email provider error 500: boom' },
      { userId: user(2), channel: 'email', error: 'socket hang up' },
      { userId: user(3), channel: 'push', error: 'push service unavailable' }
    ]);

    // The retry sends only what failed.
    email.failFor.clear();
    email.throwFor.clear();
    push.failing.clear();
    const retry = await fanOutAnnouncement(input());
    expect(email.sent.map(message => message.to)).toEqual(['six@example.test', 'one@example.test', 'two@example.test']);
    expect(push.sent.map(item => item.id)).toEqual(['sub-2a', 'sub-2b', 'sub-3']);
    expect(retry.complete).toBe(true);
    expect(retry.email.alreadyHandled).toBe(1);
  });

  it('keeps going when the delivery record itself cannot be written', async () => {
    store.failRecordFor = user(1);
    const report = await fanOutAnnouncement(input());
    expect(email.sent.map(message => message.to)).toEqual(['one@example.test', 'two@example.test']);
    expect(report.failures.map(failure => failure.userId)).toEqual([user(1), user(1)]);
    expect(report.failures[0].error).toMatch(/Delivery record error/);
    // Left as "sending": it is never re-sent automatically.
    expect(store.status(user(1), 'email')).toBe('sending');
    store.failRecordFor = null;
    await fanOutAnnouncement(input());
    expect(email.sent).toHaveLength(2);
  });

  it('prunes subscriptions that return 404 or 410 and still delivers to the other device', async () => {
    push.gone.set('sub-2a', 410);
    push.gone.set('sub-3', 404);
    const report = await fanOutAnnouncement(input());
    expect(store.revoked).toEqual([{ id: 'sub-2a', reason: 'push service returned 410' }, { id: 'sub-3', reason: 'push service returned 404' }]);
    expect(report.prunedSubscriptions).toBe(2);
    expect(push.sent.map(item => item.id)).toEqual(['sub-2b']);
    expect(store.status(user(2), 'push')).toBe('sent');
    expect(store.status(user(3), 'push')).toBe('skipped');
    expect(report.complete).toBe(true);

    // A pruned subscription is not offered again.
    const targets = await store.listPushTargets([user(2), user(3)]);
    expect(targets.get(user(2))!.map(item => item.id)).toEqual(['sub-2b']);
    expect(targets.get(user(3))).toEqual([]);
  });

  it('dry run renders and records would_send without calling a provider, and does not block the real send', async () => {
    const dry = await fanOutAnnouncement(input({ dryRun: true, email: null, push: null }));
    expect(email.sent).toHaveLength(0);
    expect(push.sent).toHaveLength(0);
    expect(dry.email.wouldSend).toBe(2);
    expect(dry.push.wouldSend).toBe(2);
    expect(dry.complete).toBe(true);
    expect(store.status(user(1), 'email')).toBe('would_send');

    const live = await fanOutAnnouncement(input());
    expect(live.email.sent).toBe(2);
    expect(live.push.sent).toBe(2);
  });

  it('refuses cleanly, per recipient, when a channel is not configured', async () => {
    const report = await fanOutAnnouncement(input({ email: null, push: null }));
    expect(report.complete).toBe(false);
    expect(report.failures.map(failure => failure.error)).toEqual([
      'Email provider is not configured', 'Email provider is not configured', 'Push is not configured: the VAPID keys are missing', 'Push is not configured: the VAPID keys are missing'
    ]);
    const noSecret = await fanOutAnnouncement(input({ unsubscribeSecret: null, recipients: [{ userId: user(9), email: 'nine@example.test', preferences: prefs() }] }));
    expect(noSecret.failures[0].error).toMatch(/unsubscribe secret is missing/);
    expect(email.sent).toHaveLength(0);
  });

  it('a test send reaches only the operator, ignores their switches, is repeatable and never blocks the live send', async () => {
    const operator: Recipient = { userId: user(1), email: 'one@example.test', preferences: prefs({ emailEnabled: false }) };
    await fanOutAnnouncement(input({ purpose: 'test', recipients: [operator] }));
    await fanOutAnnouncement(input({ purpose: 'test', recipients: [operator] }));
    expect(email.sent.map(message => message.to)).toEqual(['one@example.test', 'one@example.test']);
    expect(email.sent[0].subject).toBe(`[TEST] ${chaosWeek2026Announcement.en.title}`);
    expect(store.status(user(1), 'email', 'test')).toBe('sent');
    expect(store.status(user(1), 'email', 'live')).toBeUndefined();
    const live = await fanOutAnnouncement(input());
    expect(live.email.sent).toBe(2);
  });

  it('counts recipients by channel for the operator page', async () => {
    const targets = await store.listPushTargets(recipients.map(recipient => recipient.userId));
    expect(countRecipients(recipients, 'league_announcements', targets)).toEqual({ members: 5, email: 2, push: 2, pushDevices: 3, spanish: 1 });
  });
});
