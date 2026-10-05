import type { SupabaseClient } from '@supabase/supabase-js';
import { announcementFromRow, rowFromInput, type Announcement, type AnnouncementInput } from './announcements';
import type { PushTarget } from './channels';
import type { DeliveryOutcome, DeliveryPurpose, FanoutStore, Recipient } from './fanout';
import { preferencesFromRow, type NotificationChannel } from './preferences';

// Database access for notifications, through the service-role client. Every function returns a
// result object; "not_installed" means the migration has not been applied, and callers treat
// it (and any other error) as "do nothing".

export type Db = Pick<SupabaseClient, 'from' | 'rpc'>;
type DbError = { code?: string; message?: string } | null;

export type StoreFailure = { ok: false; reason: 'not_installed' | 'database_error'; message: string };
export type StoreResult<T> = { ok: true; value: T } | StoreFailure;

const NOT_INSTALLED_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

export function storeFailure(error: DbError): StoreFailure {
  const text = error?.message ?? 'Unknown database error';
  const missing = NOT_INSTALLED_CODES.has(error?.code ?? '') || /does not exist|schema cache|could not find the (table|function)/i.test(text);
  return missing
    ? { ok: false, reason: 'not_installed', message: 'The notifications migration has not been applied to this database.' }
    : { ok: false, reason: 'database_error', message: text.slice(0, 300) };
}

const NOTIFICATION_COLUMNS = 'id,kind,category,league_season_id,title,body,link,push_title,push_body,variants,status,created_by,created_at,sent_at,result';

export async function listAnnouncements(db: Db): Promise<StoreResult<Announcement[]>> {
  const { data, error } = await db.from('notifications').select(NOTIFICATION_COLUMNS).eq('kind', 'league_announcement').order('created_at', { ascending: false }).limit(50);
  if (error) return storeFailure(error);
  return { ok: true, value: (data ?? []).map(row => announcementFromRow(row as Record<string, unknown>)) };
}

export async function loadAnnouncement(db: Db, id: string): Promise<StoreResult<Announcement | null>> {
  const { data, error } = await db.from('notifications').select(NOTIFICATION_COLUMNS).eq('id', id).maybeSingle();
  if (error) return storeFailure(error);
  return { ok: true, value: data ? announcementFromRow(data as Record<string, unknown>) : null };
}

export async function insertAnnouncementDraft(db: Db, input: AnnouncementInput, createdBy: string): Promise<StoreResult<string>> {
  const { data, error } = await db.from('notifications').insert({ ...rowFromInput(input), status: 'draft', created_by: createdBy }).select('id').single();
  if (error) return storeFailure(error);
  return { ok: true, value: String((data as { id: string }).id) };
}

// Only a draft can be edited; the database trigger also refuses edits once sending has begun.
export async function updateAnnouncementDraft(db: Db, id: string, input: AnnouncementInput): Promise<StoreResult<boolean>> {
  const { data, error } = await db.from('notifications').update(rowFromInput(input)).eq('id', id).eq('status', 'draft').select('id');
  if (error) return storeFailure(error);
  return { ok: true, value: (data ?? []).length > 0 };
}

export async function cancelAnnouncementDraft(db: Db, id: string): Promise<StoreResult<boolean>> {
  const { data, error } = await db.from('notifications').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id).in('status', ['draft', 'scheduled']).select('id');
  if (error) return storeFailure(error);
  return { ok: true, value: (data ?? []).length > 0 };
}

export type LeagueSeasonOption = { leagueSeasonId: string; leagueName: string };

export async function listCurrentLeagueSeasons(db: Db): Promise<StoreResult<LeagueSeasonOption[]>> {
  const { data, error } = await db.from('league_seasons').select('id,fantasy_leagues(name)').eq('is_current', true).limit(200);
  if (error) return storeFailure(error);
  const options = (data ?? []).map(row => {
    const league = (row as { fantasy_leagues?: { name?: string } | Array<{ name?: string }> }).fantasy_leagues;
    const name = (Array.isArray(league) ? league[0]?.name : league?.name) ?? 'Unnamed league';
    return { leagueSeasonId: String((row as { id: string }).id), leagueName: name };
  });
  return { ok: true, value: options.sort((a, b) => a.leagueName.localeCompare(b.leagueName)) };
}

export async function leagueNameForSeason(db: Db, leagueSeasonId: string): Promise<StoreResult<string | null>> {
  const { data, error } = await db.from('league_seasons').select('id,fantasy_leagues(name)').eq('id', leagueSeasonId).maybeSingle();
  if (error) return storeFailure(error);
  if (!data) return { ok: true, value: null };
  const league = (data as { fantasy_leagues?: { name?: string } | Array<{ name?: string }> }).fantasy_leagues;
  return { ok: true, value: (Array.isArray(league) ? league[0]?.name : league?.name) ?? null };
}

function recipientFromRow(row: Record<string, unknown>): Recipient {
  return { userId: String(row.user_id), email: typeof row.email === 'string' && row.email.includes('@') ? row.email : null, preferences: preferencesFromRow(row) };
}

export async function loadAudience(db: Db, leagueSeasonId: string): Promise<StoreResult<Recipient[]>> {
  const { data, error } = await db.rpc('notification_audience', { p_league_season_id: leagueSeasonId });
  if (error) return storeFailure(error);
  return { ok: true, value: ((data ?? []) as Array<Record<string, unknown>>).map(recipientFromRow) };
}

export async function loadPushTargets(db: Db, userIds: string[]): Promise<StoreResult<Map<string, PushTarget[]>>> {
  const targets = new Map<string, PushTarget[]>();
  if (!userIds.length) return { ok: true, value: targets };
  const { data, error } = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', userIds).is('revoked_at', null);
  if (error) return storeFailure(error);
  for (const row of (data ?? []) as Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>) {
    const list = targets.get(row.user_id) ?? [];
    list.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    targets.set(row.user_id, list);
  }
  return { ok: true, value: targets };
}

export type DeliverySummary = Record<NotificationChannel, Record<string, number>>;

export async function summarizeDeliveries(db: Db, notificationId: string, purpose: DeliveryPurpose): Promise<StoreResult<DeliverySummary>> {
  const { data, error } = await db.from('notification_deliveries').select('channel,status').eq('notification_id', notificationId).eq('purpose', purpose);
  if (error) return storeFailure(error);
  const summary: DeliverySummary = { email: {}, push: {} };
  for (const row of (data ?? []) as Array<{ channel: NotificationChannel; status: string }>) {
    if (row.channel !== 'email' && row.channel !== 'push') continue;
    summary[row.channel][row.status] = (summary[row.channel][row.status] ?? 0) + 1;
  }
  return { ok: true, value: summary };
}

function must(error: DbError) {
  if (error) throw new Error(storeFailure(error).message);
}

// The fan-out's view of the database. These throw; the fan-out catches per recipient.
export function createFanoutStore(db: Db): FanoutStore {
  return {
    async claimDelivery(notificationId, userId, channel, purpose) {
      const { data, error } = await db.rpc('notification_claim_delivery', { p_notification_id: notificationId, p_user_id: userId, p_channel: channel, p_purpose: purpose });
      must(error);
      return data === true;
    },
    async recordDelivery(notificationId, userId, channel, purpose, outcome: DeliveryOutcome) {
      const { error } = await db.from('notification_deliveries')
        .update({ status: outcome.status, provider_message_id: outcome.providerMessageId ?? null, error: outcome.error ?? null, detail: outcome.detail ?? {}, updated_at: new Date().toISOString() })
        .eq('notification_id', notificationId).eq('user_id', userId).eq('channel', channel).eq('purpose', purpose);
      must(error);
    },
    async listPushTargets(userIds) {
      const result = await loadPushTargets(db, userIds);
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
    async markPushSuccess(subscriptionId) {
      const { error } = await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', subscriptionId);
      must(error);
    },
    async revokePushTarget(subscriptionId, reason) {
      const { error } = await db.from('push_subscriptions').update({ revoked_at: new Date().toISOString(), revoked_reason: reason.slice(0, 200) }).eq('id', subscriptionId).is('revoked_at', null);
      must(error);
    }
  };
}
