import { emailChannelStatus, pushChannelStatus, sendingEnabled } from './channels';

// What the operator page shows about configuration. Names of missing variables only, never values.
export type ReadinessCheck = { ok: boolean; text: string };

export function readinessChecks(installed: boolean, serviceRole: boolean, env: Record<string, string | undefined> = process.env): ReadinessCheck[] {
  const email = emailChannelStatus(env);
  const push = pushChannelStatus(env);
  return [
    { ok: serviceRole, text: serviceRole ? 'Server database access is configured.' : 'SUPABASE_SERVICE_ROLE_KEY is not set. Announcements are unavailable.' },
    { ok: installed, text: installed ? 'The notifications migration is applied.' : 'The notifications migration is not applied. Drafting and sending are unavailable.' },
    { ok: email.ready, text: email.ready ? 'Email is configured.' : `Email is not configured. Missing: ${email.missing.join(', ')}.` },
    { ok: push.ready, text: push.ready ? 'Web push is configured.' : `Web push is not configured. Missing: ${push.missing.join(', ')}.` },
    { ok: sendingEnabled(env), text: sendingEnabled(env) ? 'Live sending is switched on (NOTIFICATIONS_SEND_ENABLED=true).' : 'Live sending is switched off. Only dry runs work until NOTIFICATIONS_SEND_ENABLED=true.' }
  ];
}
