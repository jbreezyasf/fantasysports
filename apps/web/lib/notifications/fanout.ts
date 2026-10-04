import { buildPushPayload, contentFor, type Announcement } from './announcements';
import type { EmailSender, PushSender, PushTarget } from './channels';
import { renderAnnouncementEmail } from './emailTemplate';
import { resolveChannel, type NotificationChannel, type NotificationPreferences } from './preferences';
import { signUnsubscribeToken, unsubscribeUrls } from './unsubscribeToken';

// The sender job. For every recipient and every channel it: claims the delivery row (the
// idempotency key is notification + user + channel + purpose), delivers, and records the
// outcome. Each recipient-channel pair is isolated: an exception or provider failure for one
// is recorded and reported, and the loop carries on.
//
// Retrying the whole job is safe: a pair already "sent" cannot be claimed again.

export type DeliveryPurpose = 'live' | 'test';
export type DeliveryStatus = 'sent' | 'failed' | 'skipped' | 'would_send';

export type Recipient = { userId: string; email: string | null; preferences: NotificationPreferences };

export type DeliveryOutcome = { status: DeliveryStatus; providerMessageId?: string | null; error?: string | null; detail?: Record<string, unknown> };

export type FanoutStore = {
  claimDelivery(notificationId: string, userId: string, channel: NotificationChannel, purpose: DeliveryPurpose): Promise<boolean>;
  recordDelivery(notificationId: string, userId: string, channel: NotificationChannel, purpose: DeliveryPurpose, outcome: DeliveryOutcome): Promise<void>;
  listPushTargets(userIds: string[]): Promise<Map<string, PushTarget[]>>;
  markPushSuccess(subscriptionId: string): Promise<void>;
  revokePushTarget(subscriptionId: string, reason: string): Promise<void>;
};

export type FanoutInput = {
  announcement: Announcement;
  leagueName: string;
  recipients: Recipient[];
  purpose: DeliveryPurpose;
  // Renders and records "would_send"; never calls a provider.
  dryRun: boolean;
  store: FanoutStore;
  // Null means the channel is not configured.
  email: EmailSender | null;
  push: PushSender | null;
  appUrl: string | null;
  unsubscribeSecret: string | null;
  postalAddress?: string | null;
};

export type ChannelReport = { sent: number; wouldSend: number; skipped: number; failed: number; alreadyHandled: number };
export type FanoutFailure = { userId: string; channel: NotificationChannel; error: string };
export type FanoutReport = {
  notificationId: string;
  purpose: DeliveryPurpose;
  dryRun: boolean;
  recipients: number;
  email: ChannelReport;
  push: ChannelReport;
  failures: FanoutFailure[];
  prunedSubscriptions: number;
  // True when nothing is left to retry: no failure in this run.
  complete: boolean;
};

const emptyChannel = (): ChannelReport => ({ sent: 0, wouldSend: 0, skipped: 0, failed: 0, alreadyHandled: 0 });

function message(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

export async function fanOutAnnouncement(input: FanoutInput): Promise<FanoutReport> {
  const { announcement, store, purpose, dryRun } = input;
  const report: FanoutReport = {
    notificationId: announcement.id, purpose, dryRun, recipients: input.recipients.length,
    email: emptyChannel(), push: emptyChannel(), failures: [], prunedSubscriptions: 0, complete: true
  };

  const count = (channel: NotificationChannel, outcome: DeliveryOutcome, userId: string) => {
    const bucket = report[channel];
    if (outcome.status === 'sent') bucket.sent += 1;
    else if (outcome.status === 'would_send') bucket.wouldSend += 1;
    else if (outcome.status === 'skipped') bucket.skipped += 1;
    else {
      bucket.failed += 1;
      report.failures.push({ userId, channel, error: outcome.error ?? 'Unknown failure' });
    }
  };

  let pushTargets = new Map<string, PushTarget[]>();
  let pushTargetsError: string | null = null;
  try {
    pushTargets = await store.listPushTargets(input.recipients.map(recipient => recipient.userId));
  } catch (error) {
    pushTargetsError = message(error);
  }

  const deliverEmail = async (recipient: Recipient): Promise<DeliveryOutcome> => {
    if (!recipient.email) return { status: 'skipped', detail: { reason: 'no_email_address' } };
    if (!input.appUrl || !input.unsubscribeSecret) return { status: 'failed', error: 'Email is not configured: the app URL or the unsubscribe secret is missing' };
    const picked = contentFor(announcement, recipient.preferences.locale);
    const urls = unsubscribeUrls(input.appUrl, signUnsubscribeToken(recipient.userId, input.unsubscribeSecret), picked.locale);
    const rendered = renderAnnouncementEmail({
      content: picked.content, locale: picked.locale, leagueName: input.leagueName, appUrl: input.appUrl,
      linkUrl: announcement.link ? `${input.appUrl}${announcement.link}` : null,
      unsubscribeUrl: urls.page, postalAddress: input.postalAddress, test: purpose === 'test'
    });
    if (dryRun) return { status: 'would_send', detail: { locale: picked.locale, subject: rendered.subject } };
    if (!input.email) return { status: 'failed', error: 'Email provider is not configured' };
    const result = await input.email.send({
      to: recipient.email, subject: rendered.subject, html: rendered.html, text: rendered.text,
      headers: { 'List-Unsubscribe': `<${urls.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      // The provider also de-duplicates on this key, which covers a crash between the provider
      // accepting the message and the outcome being recorded. Test sends are deliberately repeatable.
      idempotencyKey: purpose === 'test' ? `notification-test/${announcement.id}/${recipient.userId}/${Date.now()}` : `notification/${announcement.id}/${recipient.userId}/email`
    });
    return result.ok
      ? { status: 'sent', providerMessageId: result.id, detail: { locale: picked.locale } }
      : { status: 'failed', error: result.error };
  };

  const deliverPush = async (recipient: Recipient): Promise<DeliveryOutcome> => {
    if (pushTargetsError) return { status: 'failed', error: `Push subscriptions could not be read: ${pushTargetsError}` };
    const targets = pushTargets.get(recipient.userId) ?? [];
    if (!targets.length) return { status: 'skipped', detail: { reason: 'no_active_subscription' } };
    const payload = buildPushPayload(announcement, recipient.preferences.locale);
    if (dryRun) return { status: 'would_send', detail: { subscriptions: targets.length, locale: payload.lang } };
    if (!input.push) return { status: 'failed', error: 'Push is not configured: the VAPID keys are missing' };
    let delivered = 0;
    let gone = 0;
    const errors: string[] = [];
    for (const target of targets) {
      // One device failing must not stop the user's other devices.
      try {
        const result = await input.push.send(target, JSON.stringify(payload), { topic: announcement.id.replace(/-/g, '').slice(0, 32) });
        if (result.ok) {
          delivered += 1;
          await store.markPushSuccess(target.id).catch(() => undefined);
        } else if (result.gone) {
          gone += 1;
          report.prunedSubscriptions += 1;
          await store.revokePushTarget(target.id, `push service returned ${result.statusCode}`).catch(() => undefined);
        } else {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push(message(error));
      }
    }
    const detail = { subscriptions: targets.length, delivered, gone, locale: payload.lang };
    if (delivered) return { status: 'sent', detail: errors.length ? { ...detail, errors } : detail };
    if (errors.length) return { status: 'failed', error: errors[0], detail };
    return { status: 'skipped', detail: { ...detail, reason: 'all_subscriptions_expired' } };
  };

  for (const recipient of input.recipients) {
    for (const channel of ['email', 'push'] as const) {
      try {
        const claimed = await store.claimDelivery(announcement.id, recipient.userId, channel, purpose);
        if (!claimed) { report[channel].alreadyHandled += 1; continue; }

        let outcome: DeliveryOutcome;
        // A test goes to the operator who pressed the button, whatever their own switches say.
        const decision = purpose === 'test' ? { deliver: true as const } : resolveChannel(recipient.preferences, announcement.category, channel);
        if (!decision.deliver) {
          outcome = { status: 'skipped', detail: { reason: decision.reason } };
        } else {
          try {
            outcome = channel === 'email' ? await deliverEmail(recipient) : await deliverPush(recipient);
          } catch (error) {
            outcome = { status: 'failed', error: message(error) };
          }
        }
        await store.recordDelivery(announcement.id, recipient.userId, channel, purpose, outcome);
        count(channel, outcome, recipient.userId);
      } catch (error) {
        // The claim or the record itself failed (database trouble). Report it and keep going.
        report[channel].failed += 1;
        report.failures.push({ userId: recipient.userId, channel, error: `Delivery record error: ${message(error)}` });
      }
    }
  }

  report.complete = report.failures.length === 0;
  return report;
}

export type ChannelCounts = { members: number; email: number; push: number; pushDevices: number; spanish: number };

// What the operator sees before sending: who would receive what, from preferences alone.
export function countRecipients(recipients: Recipient[], category: Announcement['category'], pushTargets: Map<string, PushTarget[]>): ChannelCounts {
  const counts: ChannelCounts = { members: recipients.length, email: 0, push: 0, pushDevices: 0, spanish: 0 };
  for (const recipient of recipients) {
    if (recipient.preferences.locale === 'es-419') counts.spanish += 1;
    if (recipient.email && resolveChannel(recipient.preferences, category, 'email').deliver) counts.email += 1;
    const devices = pushTargets.get(recipient.userId)?.length ?? 0;
    if (devices && resolveChannel(recipient.preferences, category, 'push').deliver) {
      counts.push += 1;
      counts.pushDevices += devices;
    }
  }
  return counts;
}
