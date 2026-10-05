'use server';

import { redirect } from 'next/navigation';
import { recordOpsAuditEvent } from '../../../lib/ops/audit';
import { requireAnnouncementOperator } from '../../../lib/ops/permissions';
import { validateAnnouncementInput, type AnnouncementContent, type AnnouncementInput } from '../../../lib/notifications/announcements';
import { chaosWeek2026Announcement } from '../../../lib/notifications/seeds/chaosWeek2026';
import { sendAnnouncement, type SendMode } from '../../../lib/notifications/service';
import { cancelAnnouncementDraft, insertAnnouncementDraft, loadAudience, loadAnnouncement, updateAnnouncementDraft, type Db } from '../../../lib/notifications/store';
import { createAdminClient } from '../../../lib/supabase/admin';

// Every action starts with requireAnnouncementOperator(): only an enabled super_admin passes;
// anyone else is redirected and nothing runs.

const LIST = '/ops/announcements';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function back(path: string, kind: 'notice' | 'error', message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message.slice(0, 600))}`);
}

function database(path: string): Db {
  try {
    return createAdminClient();
  } catch {
    back(path, 'error', 'SUPABASE_SERVICE_ROLE_KEY is not configured, so announcements are unavailable.');
  }
}

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').replace(/\r\n?/g, '\n').trim();
}

function content(formData: FormData, prefix: string): AnnouncementContent {
  return { title: field(formData, `${prefix}_title`), body: field(formData, `${prefix}_body`), pushTitle: field(formData, `${prefix}_push_title`), pushBody: field(formData, `${prefix}_push_body`) };
}

function inputFromForm(formData: FormData): AnnouncementInput {
  const es = content(formData, 'es');
  const hasSpanish = Boolean(es.title || es.body || es.pushTitle || es.pushBody);
  return {
    leagueSeasonId: field(formData, 'league_season_id'),
    category: 'league_announcements',
    link: field(formData, 'link') || null,
    en: content(formData, 'en'),
    es: hasSpanish ? es : null
  };
}

function idFrom(formData: FormData) {
  const id = field(formData, 'notification_id');
  if (!UUID.test(id)) back(LIST, 'error', 'That announcement does not exist.');
  return id;
}

export async function createAnnouncementDraft(formData: FormData) {
  const session = await requireAnnouncementOperator();
  const db = database(LIST);
  const input = formData.get('seed') === 'chaos-week-2026' ? chaosWeek2026Announcement : inputFromForm(formData);
  const valid = validateAnnouncementInput(input);
  if (!valid.ok) back(LIST, 'error', valid.errors.join(' '));
  const created = await insertAnnouncementDraft(db, input, session.user.id);
  if (!created.ok) back(LIST, 'error', created.message);
  await recordOpsAuditEvent(db, { actorUserId: session.user.id, action: 'ops.announcement_draft_created', targetType: 'notification', targetId: created.value, metadata: { leagueSeasonId: input.leagueSeasonId, seed: formData.get('seed') ? String(formData.get('seed')) : null } });
  back(`${LIST}/${created.value}`, 'notice', 'Draft saved. Nothing has been sent.');
}

export async function saveAnnouncementDraft(formData: FormData) {
  const session = await requireAnnouncementOperator();
  const id = idFrom(formData);
  const path = `${LIST}/${id}`;
  const db = database(path);
  const input = inputFromForm(formData);
  const valid = validateAnnouncementInput(input);
  if (!valid.ok) back(path, 'error', valid.errors.join(' '));
  const updated = await updateAnnouncementDraft(db, id, input);
  if (!updated.ok) back(path, 'error', updated.message);
  if (!updated.value) back(path, 'error', 'Only a draft can be edited.');
  await recordOpsAuditEvent(db, { actorUserId: session.user.id, action: 'ops.announcement_draft_updated', targetType: 'notification', targetId: id });
  back(path, 'notice', 'Draft saved. Nothing has been sent.');
}

export async function cancelAnnouncement(formData: FormData) {
  const session = await requireAnnouncementOperator();
  const id = idFrom(formData);
  const path = `${LIST}/${id}`;
  const db = database(path);
  const cancelled = await cancelAnnouncementDraft(db, id);
  if (!cancelled.ok) back(path, 'error', cancelled.message);
  if (!cancelled.value) back(path, 'error', 'Only a draft can be cancelled.');
  await recordOpsAuditEvent(db, { actorUserId: session.user.id, action: 'ops.announcement_cancelled', targetType: 'notification', targetId: id });
  back(path, 'notice', 'Draft cancelled. It can no longer be sent.');
}

async function run(formData: FormData, mode: SendMode) {
  const session = await requireAnnouncementOperator();
  const id = idFrom(formData);
  const path = `${LIST}/${id}`;
  const db = database(path);

  if (mode === 'live') {
    // The in-page confirmation step: the typed word, and the member count the operator saw.
    if (field(formData, 'confirm') !== 'SEND') back(path, 'error', 'Not sent. Type SEND in the confirmation box to send this announcement.');
    const loaded = await loadAnnouncement(db, id);
    if (!loaded.ok || !loaded.value) back(path, 'error', loaded.ok ? 'That announcement does not exist.' : loaded.message);
    const audience = await loadAudience(db, loaded.value.leagueSeasonId);
    if (!audience.ok) back(path, 'error', audience.message);
    if (String(audience.value.length) !== field(formData, 'expected_members')) back(path, 'error', 'Not sent. The league membership changed since you reviewed it. Review the recipient count and confirm again.');
  }

  const result = await sendAnnouncement({ notificationId: id, mode, actor: { id: session.user.id, email: session.user.email ?? null } }, { db });
  await recordOpsAuditEvent(db, {
    actorUserId: session.user.id, action: `ops.announcement_${mode}`, targetType: 'notification', targetId: id,
    metadata: result.ok ? { email: result.report.email, push: result.report.push, failures: result.report.failures.length, status: result.status } : { refused: result.code }
  });
  if (!result.ok) back(path, 'error', result.message);

  const { email, push, failures, prunedSubscriptions } = result.report;
  const summary = mode === 'dry_run'
    ? `Dry run complete. Nothing was sent. Would send: ${email.wouldSend} email, ${push.wouldSend} push. Skipped by preference or missing address or device: ${email.skipped} email, ${push.skipped} push.`
    : `${mode === 'test' ? 'Test to you only' : 'Send'} finished. Sent: ${email.sent} email, ${push.sent} push. Skipped: ${email.skipped} email, ${push.skipped} push. Already handled: ${email.alreadyHandled + push.alreadyHandled}. Expired devices removed: ${prunedSubscriptions}.`;
  if (failures.length) back(path, 'error', `${summary} FAILED: ${failures.length}. First failure: ${failures[0].channel} - ${failures[0].error}${mode === 'live' ? ' The announcement stays in "sending"; press Send again to retry only the failed recipients.' : ''}`);
  back(path, 'notice', summary);
}

export async function dryRunAnnouncement(formData: FormData) { await run(formData, 'dry_run'); }
export async function sendTestAnnouncement(formData: FormData) { await run(formData, 'test'); }
export async function sendLiveAnnouncement(formData: FormData) { await run(formData, 'live'); }
