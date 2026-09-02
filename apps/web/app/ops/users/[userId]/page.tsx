import { notFound } from 'next/navigation';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { recordOpsAuditEvent } from '../../../../lib/ops/audit';
import { loadOpsUser } from '../../../../lib/ops/data';
import { requireOpsPermission } from '../../../../lib/ops/permissions';

export default async function OpsUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await requireOpsPermission('users.read');
  const { userId } = await params;
  const data = await loadOpsUser(userId);
  if (!data.authUser && !data.profile) notFound();
  await recordOpsAuditEvent(createAdminClient(), { actorUserId: session.user.id, action: 'ops.view_user', targetType: 'user', targetId: userId });
  const leagueById = new Map((data.leagues as { id: string; name: string | null }[]).map(league => [league.id, league]));
  const franchiseById = new Map((data.franchises as { id: string; name: string | null; abbreviation?: string | null; league_id?: string | null }[]).map(franchise => [franchise.id, franchise]));

  return (
    <>
      <section className="opsHero compactHero">
        <a className="backLink" href="/ops">Back to search</a>
        <p className="eyebrow">SUPPORT LOOKUP</p>
        <h1>{data.profile?.display_name ?? data.authUser?.email ?? 'User'}</h1>
        <p>{data.authUser?.email ?? 'No auth email returned.'}</p>
      </section>

      <section className="opsGrid compact">
        <article><span>User ID</span><strong className="mono">{userId}</strong><p>Supabase Auth identity.</p></article>
        <article><span>Created</span><strong>{data.authUser?.created_at ? new Date(data.authUser.created_at).toLocaleDateString() : 'Unknown'}</strong><p>Account creation date.</p></article>
        <article><span>Last Sign-In</span><strong>{data.authUser?.last_sign_in_at ? new Date(data.authUser.last_sign_in_at).toLocaleDateString() : 'None'}</strong><p>Recent account activity.</p></article>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">LEAGUE ACCESS</p><h2>Memberships</h2></div><span>{data.memberships.length}</span></div>
        <div className="opsList">
          {data.memberships.map((membership: { league_id: string; role?: string | null }) => (
            <a className="opsRow" href={`/ops/leagues/${membership.league_id}`} key={membership.league_id}>
              <div><span>{membership.role ?? 'member'}</span><strong>{leagueById.get(membership.league_id)?.name ?? 'League'}</strong><small>{membership.league_id}</small></div>
              <b>League</b>
            </a>
          ))}
          {!data.memberships.length && <p className="opsEmpty">No league memberships found.</p>}
        </div>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">FRANCHISES</p><h2>Ownership</h2></div><span>{data.ownerships.length}</span></div>
        <div className="opsList">
          {data.ownerships.map((ownership: { franchise_id: string; starts_on?: string | null; ends_on?: string | null; franchises?: unknown }) => {
            const franchise = franchiseById.get(ownership.franchise_id);
            return (
              <a className="opsRow" href={franchise?.league_id ? `/ops/leagues/${franchise.league_id}` : '/ops'} key={ownership.franchise_id}>
                <div><span>{ownership.ends_on ? 'Past owner' : 'Active owner'}</span><strong>{franchise?.name ?? 'Franchise'}</strong><small>{franchise?.abbreviation ?? ownership.franchise_id}</small></div>
                <b>{ownership.starts_on ? new Date(ownership.starts_on).getFullYear() : 'Open'}</b>
              </a>
            );
          })}
          {!data.ownerships.length && <p className="opsEmpty">No franchise ownership records found.</p>}
        </div>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">ACTIVITY</p><h2>Recent league events</h2></div><span>{data.events.length}</span></div>
        <div className="opsList">
          {data.events.map((event: { id: string; event_type: string; body?: string | null; created_at: string }) => (
            <div className="opsRow" key={event.id}>
              <div><span>{new Date(event.created_at).toLocaleString()}</span><strong>{event.event_type.replaceAll('_', ' ')}</strong><small>{event.body ?? 'No event body.'}</small></div>
            </div>
          ))}
          {!data.events.length && <p className="opsEmpty">No recent user-attributed league events found.</p>}
        </div>
      </section>
    </>
  );
}
