import { validateAnnouncementInput } from './announcements';
import { appUrl, createEmailSender, createPushSender, sendingEnabled, type EmailSender, type PushSender } from './channels';
import { fanOutAnnouncement, type FanoutReport, type Recipient } from './fanout';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './preferences';
import { createFanoutStore, leagueNameForSeason, loadAnnouncement, loadAudience, type Db } from './store';
import { unsubscribeSecret } from './unsubscribeToken';

// Sends one announcement in one of three modes:
//   dry_run  renders for every member and records "would_send". Calls no provider. Works
//            without provider keys and without NOTIFICATIONS_SEND_ENABLED.
//   test     sends to the operator only (purpose "test"), so it never blocks the live send.
//   live     the real send to the league season's members.
// The caller must already have checked the operator's permission. Nothing here throws for a
// configuration or database problem: it returns { ok: false, code, message }.

export type SendMode = 'dry_run' | 'test' | 'live';

export type SendDeps = {
  db: Db;
  env?: Record<string, string | undefined>;
  // Overridable for tests. By default they are built from the environment.
  email?: EmailSender | null;
  push?: PushSender | null;
};

export type SendResult =
  | { ok: true; mode: SendMode; report: FanoutReport; status: string }
  | { ok: false; code: 'sending_disabled' | 'not_installed' | 'database_error' | 'not_found' | 'invalid' | 'wrong_status' | 'no_recipients'; message: string };

export async function sendAnnouncement(
  input: { notificationId: string; mode: SendMode; actor: { id: string; email: string | null } },
  deps: SendDeps
): Promise<SendResult> {
  const env = deps.env ?? process.env;
  const { db } = deps;
  const provider = input.mode !== 'dry_run';

  if (provider && !sendingEnabled(env)) {
    return { ok: false, code: 'sending_disabled', message: 'Sending is switched off. Set NOTIFICATIONS_SEND_ENABLED=true to allow test and live sends. Dry runs still work.' };
  }

  try {
    const loaded = await loadAnnouncement(db, input.notificationId);
    if (!loaded.ok) return { ok: false, code: loaded.reason, message: loaded.message };
    const announcement = loaded.value;
    if (!announcement) return { ok: false, code: 'not_found', message: 'That announcement does not exist.' };
    const valid = validateAnnouncementInput(announcement);
    if (!valid.ok) return { ok: false, code: 'invalid', message: valid.errors.join(' ') };

    const name = await leagueNameForSeason(db, announcement.leagueSeasonId);
    if (!name.ok) return { ok: false, code: name.reason, message: name.message };
    const leagueName = name.value ?? 'your league';

    let recipients: Recipient[];
    if (input.mode === 'test') {
      recipients = [{ userId: input.actor.id, email: input.actor.email, preferences: DEFAULT_NOTIFICATION_PREFERENCES }];
    } else {
      const audience = await loadAudience(db, announcement.leagueSeasonId);
      if (!audience.ok) return { ok: false, code: audience.reason, message: audience.message };
      recipients = audience.value;
      if (!recipients.length) return { ok: false, code: 'no_recipients', message: 'That league season has no members.' };
    }

    if (input.mode === 'live') {
      const { data, error } = await db.rpc('notification_begin_send', { p_notification_id: announcement.id, p_actor: input.actor.id });
      if (error) return { ok: false, code: 'database_error', message: (error.message ?? 'Could not start the send').slice(0, 300) };
      if (data !== 'started' && data !== 'resumed') return { ok: false, code: 'wrong_status', message: `This announcement cannot be sent (${String(data)}).` };
    } else if (announcement.status !== 'draft' && announcement.status !== 'scheduled') {
      return { ok: false, code: 'wrong_status', message: `A ${input.mode === 'test' ? 'test' : 'dry run'} is only available while the announcement is a draft.` };
    }

    const report = await fanOutAnnouncement({
      announcement,
      leagueName,
      recipients,
      purpose: input.mode === 'test' ? 'test' : 'live',
      dryRun: input.mode === 'dry_run',
      store: createFanoutStore(db),
      email: provider ? (deps.email !== undefined ? deps.email : createEmailSender(env)) : null,
      push: provider ? (deps.push !== undefined ? deps.push : createPushSender(env)) : null,
      appUrl: appUrl(env),
      unsubscribeSecret: unsubscribeSecret(env),
      postalAddress: env.EMAIL_POSTAL_ADDRESS ?? null
    });

    let status: string = announcement.status;
    if (input.mode === 'live') {
      const { data, error } = await db.rpc('notification_finish_send', { p_notification_id: announcement.id, p_result: report, p_complete: report.complete });
      status = error ? 'sending' : String(data);
    }
    return { ok: true, mode: input.mode, report, status };
  } catch (error) {
    return { ok: false, code: 'database_error', message: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
  }
}
