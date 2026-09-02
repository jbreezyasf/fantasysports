import { createAdminClient } from '../../lib/supabase/admin';
import { recordOpsAuditEvent } from '../../lib/ops/audit';
import { loadOpsDashboard } from '../../lib/ops/data';
import { requireOpsPermission } from '../../lib/ops/permissions';
import { statusLabel } from '../../lib/ops/health';

export default async function OpsHomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireOpsPermission('portal.access');
  const query = (await searchParams).q ?? '';
  const data = await loadOpsDashboard(query);
  await recordOpsAuditEvent(createAdminClient(), { actorUserId: session.user.id, action: 'ops.view_dashboard', targetType: 'ops_dashboard', metadata: { query: data.query || null } });

  return (
    <>
      <section className="opsHero">
        <p className="eyebrow">BIG EXEC INTERNAL</p>
        <h1>Operations Portal</h1>
        <p>Read-only beta command surface for support lookup, league visibility, KPI checks, and data-health triage.</p>
        <form className="opsSearch" method="get">
          <label htmlFor="ops-search">Search users, leagues, or franchises</label>
          <div>
            <input id="ops-search" name="q" type="search" defaultValue={data.query} placeholder="Name, email, league, franchise" />
            <button className="primary">Search</button>
          </div>
        </form>
      </section>

      <section className="opsGrid" aria-label="Beta operations summary">
        <article><span>Auth Users Sample</span><strong>{data.counts.authUsers}</strong><p>First admin-auth page loaded for support search.</p></article>
        <article><span>Profiles</span><strong>{data.counts.profiles}</strong><p>Manager profile records available for lookup.</p></article>
        <article><span>Leagues</span><strong>{data.counts.leagues}</strong><p>Fantasy league records visible to ops.</p></article>
        <article><span>Franchises</span><strong>{data.counts.franchises}</strong><p>Persistent franchise records.</p></article>
        <article><span>Open Waivers</span><strong>{data.counts.openWaivers}</strong><p>Players currently awaiting claim priority.</p></article>
        <article><span>Pending Claims</span><strong>{data.counts.pendingWaivers}</strong><p>Unprocessed waiver requests.</p></article>
        <article><span>Trades</span><strong>{data.counts.trades}</strong><p>Trade records across leagues.</p></article>
        <article><span>Athletes</span><strong>{data.counts.athletes}</strong><p>Canonical player records.</p></article>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">SEARCH RESULTS</p><h2>{data.query ? `Matches for "${data.query}"` : 'Support lookup'}</h2></div><span>{data.results.length}</span></div>
        <div className="opsList">
          {data.results.map(result => (
            <a className="opsRow" href={result.href} key={`${result.type}-${result.id}`}>
              <div><span>{result.type.toUpperCase()}</span><strong>{result.label}</strong><small>{result.context}</small></div>
              <b>Open</b>
            </a>
          ))}
          {data.query && !data.results.length && <p className="opsEmpty">No matching user, league, or franchise records were found.</p>}
          {!data.query && <p className="opsEmpty">Enter at least two characters to search the beta data.</p>}
        </div>
      </section>

      <section className="opsGrid compact" aria-label="Data health snapshot">
        <article className={`opsStatus ${data.health.athletes.status}`}><span>Players</span><strong>{statusLabel(data.health.athletes.status)}</strong><p>{data.health.athletes.updatedAt ? new Date(data.health.athletes.updatedAt).toLocaleString() : 'No update timestamp found.'}</p></article>
        <article className={`opsStatus ${data.health.games.status}`}><span>Games</span><strong>{statusLabel(data.health.games.status)}</strong><p>{data.health.games.updatedAt ? new Date(data.health.games.updatedAt).toLocaleString() : 'No game timestamp found.'}</p></article>
        <article className={`opsStatus ${data.health.stats.status}`}><span>Stats</span><strong>{statusLabel(data.health.stats.status)}</strong><p>{data.health.stats.updatedAt ? new Date(data.health.stats.updatedAt).toLocaleString() : 'No stat timestamp found.'}</p></article>
      </section>
    </>
  );
}
