import { createAdminClient } from '../../../lib/supabase/admin';
import { recordOpsAuditEvent } from '../../../lib/ops/audit';
import { loadOpsDataHealth } from '../../../lib/ops/data';
import { requireOpsPermission } from '../../../lib/ops/permissions';
import { statusLabel } from '../../../lib/ops/health';

export default async function OpsDataHealthPage() {
  const session = await requireOpsPermission('data_health.read');
  const data = await loadOpsDataHealth();
  await recordOpsAuditEvent(createAdminClient(), { actorUserId: session.user.id, action: 'ops.view_data_health', targetType: 'data_health' });

  return (
    <>
      <section className="opsHero compactHero">
        <p className="eyebrow">DATA HEALTH</p>
        <h1>Feeds and freshness</h1>
        <p>Read-only snapshot of records Big Exec needs for beta support triage.</p>
      </section>

      <section className="opsGrid">
        <article className={`opsStatus ${data.health.athletes.status}`}><span>Athletes</span><strong>{statusLabel(data.health.athletes.status)}</strong><p>{data.counts.athletes} records. Latest update {data.health.athletes.updatedAt ? new Date(data.health.athletes.updatedAt).toLocaleString() : 'unknown'}.</p></article>
        <article className={`opsStatus ${data.health.games.status}`}><span>Real Games</span><strong>{statusLabel(data.health.games.status)}</strong><p>{data.counts.realGames} records. Latest state {data.health.games.latestStatus ?? 'unknown'}.</p></article>
        <article className={`opsStatus ${data.health.stats.status}`}><span>Athlete Stats</span><strong>{statusLabel(data.health.stats.status)}</strong><p>{data.counts.athleteStats} records. Latest update {data.health.stats.updatedAt ? new Date(data.health.stats.updatedAt).toLocaleString() : 'unknown'}.</p></article>
        <article><span>Real Teams</span><strong>{data.teams}</strong><p>Provider-normalized teams.</p></article>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">PROVIDER IDS</p><h2>Player identity coverage</h2></div><span>{data.providerCounts.size}</span></div>
        <div className="opsList">
          {Array.from(data.providerCounts.entries()).map(([provider, total]) => <div className="opsRow" key={provider}><div><span>Provider</span><strong>{provider}</strong><small>Linked athlete IDs</small></div><b>{total}</b></div>)}
          {!data.providerCounts.size && <p className="opsEmpty">No provider ID rows found.</p>}
        </div>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">RECENT REAL GAMES</p><h2>Schedule source</h2></div><span>{data.recentGames.length}</span></div>
        <div className="opsList">
          {data.recentGames.map((game: { status?: string | null; starts_at?: string | null; updated_at?: string | null }, index) => <div className="opsRow" key={`${game.starts_at}-${index}`}><div><span>{game.status ?? 'unknown'}</span><strong>{game.starts_at ? new Date(game.starts_at).toLocaleString() : 'No start time'}</strong><small>Updated {game.updated_at ? new Date(game.updated_at).toLocaleString() : 'unknown'}</small></div></div>)}
        </div>
      </section>
    </>
  );
}
