import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StatusMessage } from '../../../components/accessibility';
import { requireAnnouncementOperator } from '../../../../lib/ops/permissions';
import { buildPushPayload, contentFor } from '../../../../lib/notifications/announcements';
import { appUrl } from '../../../../lib/notifications/channels';
import { renderAnnouncementEmail } from '../../../../lib/notifications/emailTemplate';
import { countRecipients } from '../../../../lib/notifications/fanout';
import type { NotificationLocale } from '../../../../lib/notifications/preferences';
import { readinessChecks } from '../../../../lib/notifications/readiness';
import { leagueNameForSeason, listCurrentLeagueSeasons, loadAnnouncement, loadAudience, loadPushTargets, summarizeDeliveries, type Db } from '../../../../lib/notifications/store';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { cancelAnnouncement, dryRunAnnouncement, saveAnnouncementDraft, sendLiveAnnouncement, sendTestAnnouncement } from '../actions';
import AnnouncementFields from '../AnnouncementFields';
import SendConfirmation from '../SendConfirmation';
import styles from '../../../settings/notifications/notifications.module.css';

export const metadata: Metadata = { title: 'Announcement' };

const STATUS_ORDER = ['sent', 'would_send', 'skipped', 'failed', 'sending'] as const;

export default async function OpsAnnouncementPage({ params, searchParams }: { params: Promise<{ notificationId: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const session = await requireAnnouncementOperator();
  const { notificationId } = await params;
  const query = await searchParams;

  let db: Db | null = null;
  try { db = createAdminClient(); } catch { db = null; }
  const loaded = db ? await loadAnnouncement(db, notificationId) : null;
  if (!db || !loaded?.ok) {
    return (
      <div className={styles.page}>
        <section className="opsHero compactHero"><p className="eyebrow">ANNOUNCEMENT</p><h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.6rem)', overflowWrap: 'anywhere' }}>Announcements are unavailable</h1></section>
        <StatusMessage tone="error">{loaded && !loaded.ok ? loaded.message : 'SUPABASE_SERVICE_ROLE_KEY is not configured.'}</StatusMessage>
        <p><a className={styles.textLink} href="/ops/announcements">Back to announcements</a></p>
      </div>
    );
  }
  const announcement = loaded.value;
  if (!announcement) notFound();

  const [nameResult, audience, seasons, liveDeliveries] = await Promise.all([
    leagueNameForSeason(db, announcement.leagueSeasonId),
    loadAudience(db, announcement.leagueSeasonId),
    listCurrentLeagueSeasons(db),
    summarizeDeliveries(db, announcement.id, 'live')
  ]);
  const leagueName = (nameResult.ok && nameResult.value) || 'Unknown league';
  const recipients = audience.ok ? audience.value : [];
  const targets = await loadPushTargets(db, recipients.map(recipient => recipient.userId));
  const counts = countRecipients(recipients, announcement.category, targets.ok ? targets.value : new Map());
  const countsKnown = audience.ok && targets.ok;

  const base = appUrl() ?? 'https://bigexecfs.com';
  const isDraft = announcement.status === 'draft';
  const canSend = isDraft || announcement.status === 'sending';
  const checks = readinessChecks(true, true).slice(2);
  const locales: Array<{ locale: NotificationLocale; label: string }> = [{ locale: 'en', label: 'English' }, ...(announcement.es ? [{ locale: 'es-419' as const, label: 'Spanish' }] : [])];

  return (
    <div className={styles.page}>
      <section className="opsHero compactHero">
        <p className="eyebrow">ANNOUNCEMENT · {announcement.status.toUpperCase()}</p>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.6rem)', overflowWrap: 'anywhere' }}>{announcement.en.title}</h1>
        <p>Audience: members of {leagueName}. Signed in as {session.user.email ?? 'operator'}.</p>
      </section>

      {query.error && <StatusMessage tone="error">{query.error}</StatusMessage>}
      {query.notice && <StatusMessage tone="success">{query.notice}</StatusMessage>}

      <section className={styles.card} aria-labelledby="recipients-title">
        <h2 id="recipients-title" className={styles.cardTitle}>Recipients</h2>
        {countsKnown ? (
          <dl className={styles.counts}>
            <div><dt>Members</dt><dd>{counts.members}</dd></div>
            <div><dt>Email</dt><dd>{counts.email}</dd></div>
            <div><dt>Push (members)</dt><dd>{counts.push}</dd></div>
            <div><dt>Push (devices)</dt><dd>{counts.pushDevices}</dd></div>
            <div><dt>Chose Spanish</dt><dd>{counts.spanish}</dd></div>
          </dl>
        ) : <StatusMessage tone="error">The recipient count could not be loaded, so sending is unavailable.</StatusMessage>}
        <p className={styles.hint}>Counted now from each member&apos;s preferences. Email needs league email and league announcements switched on. Push needs both of those push switches and at least one device.</p>
        {liveDeliveries.ok && (Object.keys(liveDeliveries.value.email).length > 0 || Object.keys(liveDeliveries.value.push).length > 0) && (
          <>
            <h3 className={styles.listTitle}>Recorded so far</h3>
            <ul className={styles.rows}>
              {(['email', 'push'] as const).map(channel => (
                <li key={channel}><strong>{channel === 'email' ? 'Email' : 'Push'}</strong><span>{STATUS_ORDER.filter(status => liveDeliveries.value[channel][status]).map(status => `${status.replace('_', ' ')}: ${liveDeliveries.value[channel][status]}`).join(' · ') || 'nothing recorded'}</span></li>
              ))}
            </ul>
            <p className={styles.hint}>&quot;sending&quot; means a delivery was started and its result was never recorded. It is not retried automatically; check the provider before sending again.</p>
          </>
        )}
      </section>

      <section className={styles.card} aria-labelledby="preview-title">
        <h2 id="preview-title" className={styles.cardTitle}>Preview</h2>
        {locales.map(({ locale, label }) => {
          const picked = contentFor(announcement, locale);
          const email = renderAnnouncementEmail({ content: picked.content, locale, leagueName, appUrl: base, linkUrl: announcement.link ? `${base}${announcement.link}` : null, unsubscribeUrl: `${base}/unsubscribe?token=preview` });
          const push = buildPushPayload(announcement, locale);
          return (
            <div className={styles.grid2} key={locale}>
              <div className={styles.preview}>
                <h3>{label}: email (HTML)</h3>
                <p className={styles.hint}>Subject: {email.subject}</p>
                <iframe className={styles.previewFrame} title={`${label} email preview`} sandbox="" srcDoc={email.html} />
              </div>
              <div className={styles.preview}>
                <h3>{label}: push notification</h3>
                <div className={styles.pushCard} lang={locale}><strong>{push.title}</strong><span>{push.body}</span><small>Opens {push.url}</small></div>
                <h3>{label}: email (plain text)</h3>
                {/* Scrollable region: focusable so keyboard users can scroll it. */}
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                <pre className={styles.previewText} tabIndex={0} aria-label={`${label} plain-text email`} lang={locale}>{email.text}</pre>
              </div>
            </div>
          );
        })}
      </section>

      {canSend && (
        <section className={styles.card} aria-labelledby="send-title">
          <h2 id="send-title" className={styles.cardTitle}>Check, test, send</h2>
          <ul className={styles.checks}>{checks.map(check => <li key={check.text} data-ok={check.ok}><strong>{check.ok ? 'Ready: ' : 'Not ready: '}</strong>{check.text}</li>)}</ul>
          {isDraft && (
            <div className={styles.actions}>
              <form action={dryRunAnnouncement}><input type="hidden" name="notification_id" value={announcement.id} /><button className={styles.secondaryButton} type="submit">Dry run (sends nothing)</button></form>
              <form action={sendTestAnnouncement}><input type="hidden" name="notification_id" value={announcement.id} /><button className={styles.secondaryButton} type="submit">Send a test to me only</button></form>
            </div>
          )}
          {countsKnown && <SendConfirmation notificationId={announcement.id} leagueName={leagueName} title={announcement.en.title} counts={counts} resume={announcement.status === 'sending'} action={sendLiveAnnouncement} />}
        </section>
      )}

      <form action={saveAnnouncementDraft} className={styles.card} aria-labelledby="edit-title">
        <h2 id="edit-title" className={styles.cardTitle}>{isDraft ? 'Edit draft' : 'Content (locked)'}</h2>
        <input type="hidden" name="notification_id" value={announcement.id} />
        <AnnouncementFields idPrefix="edit" value={announcement} leagueSeasons={seasons.ok ? seasons.value : []} readOnly={!isDraft} />
        {isDraft && <div className={styles.actions}><button className={styles.primaryButton} type="submit">Save draft</button><p className={styles.hint}>Saving sends nothing.</p></div>}
      </form>

      {isDraft && (
        <form action={cancelAnnouncement} className={styles.card} aria-labelledby="cancel-title">
          <h2 id="cancel-title" className={styles.cardTitle}>Cancel this draft</h2>
          <input type="hidden" name="notification_id" value={announcement.id} />
          <p className={styles.hint}>A cancelled draft is kept for the record and can never be sent.</p>
          <div><button className={styles.secondaryButton} type="submit">Cancel draft</button></div>
        </form>
      )}

      <p><a className={styles.textLink} href="/ops/announcements">Back to announcements</a></p>
    </div>
  );
}
