import type { Metadata } from 'next';
import { StatusMessage } from '../../components/accessibility';
import { requireAnnouncementOperator } from '../../../lib/ops/permissions';
import { readinessChecks } from '../../../lib/notifications/readiness';
import { listAnnouncements, listCurrentLeagueSeasons, type Db } from '../../../lib/notifications/store';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createAnnouncementDraft } from './actions';
import AnnouncementFields from './AnnouncementFields';
import styles from '../../settings/notifications/notifications.module.css';

export const metadata: Metadata = { title: 'Announcements' };

export default async function OpsAnnouncementsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireAnnouncementOperator();
  const query = await searchParams;

  let db: Db | null = null;
  try { db = createAdminClient(); } catch { db = null; }
  const [announcements, seasons] = db ? await Promise.all([listAnnouncements(db), listCurrentLeagueSeasons(db)]) : [null, null];
  const installed = Boolean(announcements?.ok);
  const checks = readinessChecks(installed, Boolean(db));

  return (
    <div className={styles.page}>
      <section className="opsHero compactHero">
        <p className="eyebrow">ANNOUNCEMENTS</p>
        <h1 style={{ fontSize: 'clamp(1.7rem, 7vw, 3.2rem)', overflowWrap: 'anywhere' }}>League announcements</h1>
        <p>Draft a notice for one league, preview it, send a test to yourself, then send it to the members by email and push. Only platform owners can use this page.</p>
      </section>

      {query.error && <StatusMessage tone="error">{query.error}</StatusMessage>}
      {query.notice && <StatusMessage tone="success">{query.notice}</StatusMessage>}

      <section className={styles.card} aria-labelledby="readiness-title">
        <h2 id="readiness-title" className={styles.cardTitle}>Readiness</h2>
        <ul className={styles.checks}>
          {checks.map(check => <li key={check.text} data-ok={check.ok}><strong>{check.ok ? 'Ready: ' : 'Not ready: '}</strong>{check.text}</li>)}
        </ul>
      </section>

      {installed && announcements?.ok && (
        <section className={styles.card} aria-labelledby="existing-title">
          <h2 id="existing-title" className={styles.cardTitle}>Announcements</h2>
          {announcements.value.length ? (
            <ul className={styles.rows}>
              {announcements.value.map(item => (
                <li key={item.id}>
                  <a className={styles.textLink} href={`/ops/announcements/${item.id}`}>{item.en.title}</a>
                  <span className={styles.badge}>{item.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className={styles.hint}>No announcements yet.</p>}
        </section>
      )}

      {installed && seasons?.ok && (
        <>
          <section className={styles.card} aria-labelledby="seed-title">
            <h2 id="seed-title" className={styles.cardTitle}>Prepared draft: Chaos Week 2026</h2>
            <p className={styles.hint}>Creates a draft of the Chaos Clause and Week 13 rule-card announcement for Stress Test 2026, in English and Spanish. It is saved as a draft only. Nothing is sent.</p>
            <form action={createAnnouncementDraft}>
              <input type="hidden" name="seed" value="chaos-week-2026" />
              <button className={styles.secondaryButton} type="submit">Create the Chaos Week draft</button>
            </form>
          </section>

          <form action={createAnnouncementDraft} className={styles.card} aria-labelledby="new-title">
            <h2 id="new-title" className={styles.cardTitle}>New draft</h2>
            <AnnouncementFields idPrefix="new" value={null} leagueSeasons={seasons.value} />
            <div className={styles.actions}><button className={styles.primaryButton} type="submit">Save draft</button><p className={styles.hint}>Saving a draft sends nothing.</p></div>
          </form>
        </>
      )}
    </div>
  );
}
