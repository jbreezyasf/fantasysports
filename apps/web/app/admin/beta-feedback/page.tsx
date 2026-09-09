import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { isBetaFeedbackAdmin } from '../../../lib/beta-feedback/adminAuth';
import { reviewBetaFeedback, routeFeedbackToSupport } from './actions';
import styles from './styles.module.css';

export default async function BetaFeedbackAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/beta-feedback');
  if (!isBetaFeedbackAdmin(user.email)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data: analyses, error } = await admin
    .from('beta_feedback_analysis')
    .select('id,category,problem_statement,user_requested_solution,proposed_action,severity,churn_risk_score,confidence,feature_candidate,cluster_key,cluster_count,review_status,implementation_proposal,support_recommended,support_reason,support_summary,support_response_draft,support_disposition,analyzed_at,beta_feedback_submissions(id,task_area,outcome,ease_rating,happened,expected,frustration,liked,improvement,missing_capability,churn_risk,disappointment,nps_score,page_path,created_at,user_id)')
    .order('severity', { ascending: false })
    .order('analyzed_at', { ascending: false });
  if (error) throw new Error(`Could not load beta feedback: ${error.message}`);

  const rows = analyses ?? [];
  const pending = rows.filter((row) => row.review_status === 'pending').length;
  const support = rows.filter((row) => row.support_disposition === 'send_to_support').length;
  const features = rows.filter((row) => row.feature_candidate).length;
  const critical = rows.filter((row) => row.severity >= 4).length;

  return <main className={styles.shell}>
    <header className={styles.header}><div><p className={styles.eyebrow}>OWNER ADMIN • BETA INTELLIGENCE</p><h1>Voice of the Player</h1><p>Private product feedback for the Big Exec owner/admin. Commissioners cannot access this page.</p></div><a className={styles.link} href="/dashboard">Back to Big Exec</a></header>
    <section className={styles.stats} aria-label="Feedback summary">
      <article><span>Total reports</span><strong>{rows.length}</strong></article><article><span>Awaiting review</span><strong>{pending}</strong></article><article><span>Severity 4–5</span><strong>{critical}</strong></article><article><span>Feature candidates</span><strong>{features}</strong></article><article><span>Sent to support</span><strong>{support}</strong></article>
    </section>
    <section className={styles.list} aria-label="Feedback reports">
      {rows.length === 0 ? <div className={styles.empty}>No beta feedback has been submitted yet.</div> : rows.map((row) => {
        const rawValue = row.beta_feedback_submissions;
        const raw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
        return <article className={styles.card} key={row.id}>
          <div className={styles.cardHead}><div><span className={styles.badge}>{String(row.category).replaceAll('_',' ')}</span><span className={styles.status}>{row.review_status}</span>{row.support_recommended ? <span className={styles.supportBadge}>support suggested</span> : null}</div><strong>Severity {row.severity}/5</strong></div>
          <h2>{row.problem_statement}</h2>
          <dl className={styles.grid}>
            <div><dt>Area</dt><dd>{raw?.task_area?.replaceAll('_',' ') ?? 'Unknown'}</dd></div>
            <div><dt>Outcome</dt><dd>{raw?.outcome?.replaceAll('_',' ') ?? 'Unknown'}</dd></div>
            <div><dt>Ease</dt><dd>{raw?.ease_rating ?? '—'}/5</dd></div>
            <div><dt>NPS</dt><dd>{raw?.nps_score ?? '—'}/10</dd></div>
            <div><dt>Churn risk</dt><dd>{raw?.churn_risk?.replaceAll('_',' ') ?? '—'}</dd></div>
            <div><dt>Confidence</dt><dd>{Math.round(Number(row.confidence) * 100)}%</dd></div>
          </dl>
          <section className={styles.raw}><h3>Original player feedback</h3><p><strong>What happened:</strong> {raw?.happened}</p><p><strong>Expected:</strong> {raw?.expected}</p>{raw?.frustration ? <p><strong>Frustration:</strong> {raw.frustration}</p> : null}{raw?.liked ? <p><strong>Liked:</strong> {raw.liked}</p> : null}{raw?.improvement ? <p><strong>Suggested improvement:</strong> {raw.improvement}</p> : null}{raw?.missing_capability ? <p><strong>Missing capability:</strong> {raw.missing_capability}</p> : null}</section>
          <section><h3>Product analysis</h3><p>{row.proposed_action}</p>{row.user_requested_solution ? <p><strong>User-requested solution:</strong> {row.user_requested_solution}</p> : null}<p><strong>Cluster:</strong> {row.cluster_key} · {row.cluster_count} report(s) at analysis time</p></section>
          {row.support_recommended ? <section className={styles.support}><h3>Customer support handoff</h3><p><strong>Why suggested:</strong> {row.support_reason}</p><p><strong>Support summary:</strong> {row.support_summary}</p><p><strong>Draft response:</strong> {row.support_response_draft}</p><form action={routeFeedbackToSupport} className={styles.actions}><input type="hidden" name="analysis_id" value={row.id}/><button name="support_disposition" value="send_to_support" type="submit">Send to support queue</button><button name="support_disposition" value="none" type="submit">Do not send</button><button name="support_disposition" value="resolved" type="submit">Mark support resolved</button></form><p className={styles.small}>Current support state: {row.support_disposition.replaceAll('_',' ')}</p></section> : null}
          <form action={reviewBetaFeedback} className={styles.review}><label>Admin note <span>(optional)</span><textarea name="note" rows={2} maxLength={2000}/></label><input type="hidden" name="analysis_id" value={row.id}/><div className={styles.actions}><button name="status" value="approved" type="submit">Approve for product work</button><button name="status" value="investigate" type="submit">Investigate</button><button name="status" value="deferred" type="submit">Defer</button><button name="status" value="denied" type="submit">Deny</button></div></form>
          <p className={styles.guardrail}>Approval authorizes product work for review. It does not deploy code or automatically add a feature to Big Exec.</p>
        </article>;
      })}
    </section>
  </main>;
}
