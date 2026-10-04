import webpush from 'web-push';
import { sendTransactionalEmail } from '../email/resend';
import { unsubscribeSecret } from './unsubscribeToken';

// The two delivery channels behind small interfaces, so the fan-out can be tested with fakes
// and so a missing configuration is a reported state, never an exception.

type Env = Record<string, string | undefined>;

export type ChannelStatus = { ready: boolean; missing: string[] };

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  idempotencyKey: string;
};
export type EmailSendResult = { ok: true; id: string | null } | { ok: false; error: string };
export type EmailSender = { send(message: EmailMessage): Promise<EmailSendResult> };

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushSendResult = { ok: true } | { ok: false; gone: boolean; statusCode: number | null; error: string };
export type PushSender = { send(target: PushTarget, payload: string, options: { topic: string }): Promise<PushSendResult> };

export function appUrl(env: Env = process.env): string | null {
  const value = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  return value && /^https?:\/\//.test(value) ? value : null;
}

// Live sending is off unless the owner sets this. Dry runs work without it.
export function sendingEnabled(env: Env = process.env) {
  return env.NOTIFICATIONS_SEND_ENABLED?.trim().toLowerCase() === 'true';
}

export function emailChannelStatus(env: Env = process.env): ChannelStatus {
  const missing: string[] = [];
  if (!env.RESEND_BIGEXEC_API_KEY?.trim()) missing.push('RESEND_BIGEXEC_API_KEY');
  if (!unsubscribeSecret(env)) missing.push('NOTIFICATIONS_UNSUBSCRIBE_SECRET');
  if (!appUrl(env)) missing.push('NEXT_PUBLIC_APP_URL');
  return { ready: missing.length === 0, missing };
}

export function vapidConfig(env: Env = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  const missing: string[] = [];
  if (!publicKey) missing.push('VAPID_PUBLIC_KEY');
  if (!privateKey) missing.push('VAPID_PRIVATE_KEY');
  if (!subject || !/^(mailto:|https:\/\/)/.test(subject)) missing.push('VAPID_SUBJECT');
  return missing.length ? { ready: false as const, missing } : { ready: true as const, missing, publicKey: publicKey!, privateKey: privateKey!, subject: subject! };
}

export function pushChannelStatus(env: Env = process.env): ChannelStatus {
  const config = vapidConfig(env);
  return { ready: config.ready, missing: config.missing };
}

// Null when the provider key is absent.
export function createEmailSender(env: Env = process.env): EmailSender | null {
  if (!env.RESEND_BIGEXEC_API_KEY?.trim()) return null;
  return {
    async send(message) {
      const result = await sendTransactionalEmail(message);
      if (result.sent) return { ok: true, id: result.id };
      return { ok: false, error: result.reason === 'not_configured' ? 'Email provider is not configured' : `Email provider error${result.status ? ` ${result.status}` : ''}: ${result.detail || 'no detail'}` };
    }
  };
}

// Null when the VAPID keys are absent. Payloads are encrypted by the web-push library
// (RFC 8291, aes128gcm); the VAPID details are passed per call, so there is no global state.
export function createPushSender(env: Env = process.env): PushSender | null {
  const config = vapidConfig(env);
  if (!config.ready) return null;
  return {
    async send(target, payload, options) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          payload,
          {
            vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
            TTL: 24 * 60 * 60,
            urgency: 'normal',
            topic: options.topic,
            timeout: 10000
          }
        );
        return { ok: true };
      } catch (error) {
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : null;
        return {
          ok: false,
          // 404 and 410 mean the browser has dropped this subscription for good.
          gone: statusCode === 404 || statusCode === 410,
          statusCode,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 300)
        };
      }
    }
  };
}
