import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import BigExecAppHeader from '../../components/BigExecAppHeader';
import BigExecMobileNav from '../../components/BigExecMobileNav';
import { MainContent, SkipLink, StatusMessage } from '../../components/accessibility';
import { vapidConfig } from '../../../lib/notifications/channels';
import { preferencesFromRow } from '../../../lib/notifications/preferences';
import { storeFailure } from '../../../lib/notifications/store';
import { createClient } from '../../../lib/supabase/server';
import { saveNotificationPreferences } from './actions';
import NotificationSettings, { type PushDevice } from './NotificationSettings';
import { N } from './strings';
import styles from './notifications.module.css';

export const metadata: Metadata = { title: 'Notifications' };

// Manager notification settings. The text is English source; the locale provider translates
// it for Spanish, and the client component translates its own strings through t().
export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings/notifications');

  const [membership, preferenceResult, deviceResult] = await Promise.all([
    supabase.from('league_members').select('league_id,role').eq('user_id', user.id).order('joined_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('notification_preferences').select('email_enabled,push_enabled,league_announcements,lineup_lock_reminder,score_final,trade_offer,waiver_result,weekly_recap,locale').eq('user_id', user.id).maybeSingle(),
    supabase.from('push_subscriptions').select('id,user_agent,created_at,last_success_at').is('revoked_at', null).order('created_at', { ascending: false })
  ]);

  // Fail closed: if the tables are absent or unreadable, show no controls at all.
  const problem = preferenceResult.error ?? deviceResult.error;
  const failure = problem ? storeFailure(problem) : null;
  const vapid = vapidConfig();
  const leagueId = membership.data?.league_id as string | undefined;
  const devices: PushDevice[] = (deviceResult.data ?? []).map(row => ({ id: row.id, userAgent: row.user_agent, createdAt: row.created_at, lastSuccessAt: row.last_success_at }));

  const content = (
    <main className={leagueId ? styles.page : `${styles.page} ${styles.standalone}`}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{N.eyebrow}</p>
        <h1 className={styles.title}>{N.title}</h1>
        <p className={styles.lede}>{N.lede}</p>
      </header>
      {failure
        ? <StatusMessage tone={failure.reason === 'not_installed' ? 'info' : 'error'}>{failure.reason === 'not_installed' ? N.unavailable : N.loadError}</StatusMessage>
        : <NotificationSettings preferences={preferencesFromRow(preferenceResult.data)} devices={devices} vapidPublicKey={vapid.ready ? vapid.publicKey : null} saveAction={saveNotificationPreferences} />}
      <p><a className={styles.textLink} href={leagueId ? `/leagues/${leagueId}` : '/dashboard'}>{leagueId ? N.backToLeague : N.backToDashboard}</a></p>
    </main>
  );

  // Inside the canonical product shell when the manager has a league; otherwise a plain page.
  if (!leagueId) return <><SkipLink /><MainContent>{content}</MainContent></>;
  return (
    <>
      <SkipLink />
      <BigExecAppHeader leagueId={leagueId} isCommissioner={membership.data?.role === 'commissioner'} />
      <MainContent>{content}</MainContent>
      <BigExecMobileNav leagueId={leagueId} />
    </>
  );
}
