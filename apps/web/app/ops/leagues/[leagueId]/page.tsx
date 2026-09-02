import { notFound } from 'next/navigation';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { recordOpsAuditEvent } from '../../../../lib/ops/audit';
import { loadOpsLeague } from '../../../../lib/ops/data';
import { requireOpsPermission } from '../../../../lib/ops/permissions';

export default async function OpsLeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const session = await requireOpsPermission('leagues.read');
  const { leagueId } = await params;
  const data = await loadOpsLeague(leagueId);
  if (!data) notFound();
  await recordOpsAuditEvent(createAdminClient(), { actorUserId: session.user.id, action: 'ops.view_league', targetType: 'league', targetId: leagueId });

  const franchiseById = new Map(data.franchises.map(franchise => [franchise.id, franchise]));
  const franchiseBySf = new Map(data.seasonFranchises.map(sf => [sf.id, franchiseById.get(sf.franchise_id)]));
  const rosterCounts = new Map<string, number>();
  for (const row of data.rosterEntries) rosterCounts.set(row.season_franchise_id, (rosterCounts.get(row.season_franchise_id) ?? 0) + 1);
  const lineupCounts = new Map<string, number>();
  for (const row of data.lineups as { season_franchise_id?: string }[]) {
    if (row.season_franchise_id) lineupCounts.set(row.season_franchise_id, (lineupCounts.get(row.season_franchise_id) ?? 0) + 1);
  }

  return (
    <>
      <section className="opsHero compactHero">
        <a className="backLink" href="/ops">Back to search</a>
        <p className="eyebrow">LEAGUE VISIBILITY</p>
        <h1>{data.league.name}</h1>
        <p>Read-only operational view of league state, franchise counts, schedules, standings, draft, waivers, trades, and feed activity.</p>
      </section>

      <section className="opsGrid">
        <article><span>Franchises</span><strong>{data.franchises.length}/{data.league.max_franchises ?? 10}</strong><p>{data.members.length} league membership records.</p></article>
        <article><span>Season</span><strong>{data.currentSeason?.status ?? 'Unknown'}</strong><p>{data.currentSeason?.id ?? 'No current season found.'}</p></article>
        <article><span>Draft</span><strong>{data.drafts[0]?.status ?? 'None'}</strong><p>{data.drafts.length} draft record(s).</p></article>
        <article><span>Matchups</span><strong>{data.matchups.length}</strong><p>{data.matchups.filter(game => game.is_final).length} final.</p></article>
        <article><span>Waiver Holds</span><strong>{data.waiverHolds.length}</strong><p>{data.waiverHolds.filter(row => row.status === 'open').length} open.</p></article>
        <article><span>Waiver Claims</span><strong>{data.waiverClaims.length}</strong><p>{data.waiverClaims.filter(row => row.status === 'pending').length} pending.</p></article>
        <article><span>Trades</span><strong>{data.trades.length}</strong><p>{data.trades.filter(row => !['completed', 'rejected', 'withdrawn', 'expired', 'vetoed'].includes(row.status)).length} active-ish.</p></article>
        <article><span>Feed Events</span><strong>{data.events.length}</strong><p>Most recent league events loaded.</p></article>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">FRANCHISE FLOOR</p><h2>Roster and lineup snapshot</h2></div><span>{data.seasonFranchises.length}</span></div>
        <div className="opsList">
          {data.seasonFranchises.map(sf => {
            const franchise = franchiseById.get(sf.franchise_id);
            return (
              <div className="opsRow" key={sf.id}>
                <div><span>{sf.roster_locked_at ? 'Locked roster' : 'Active roster'}</span><strong>{franchise?.name ?? 'Franchise'}</strong><small>{franchise?.abbreviation ?? sf.franchise_id}</small></div>
                <b>{rosterCounts.get(sf.id) ?? 0} roster / {lineupCounts.get(sf.id) ?? 0} lineup</b>
              </div>
            );
          })}
          {!data.seasonFranchises.length && <p className="opsEmpty">No season franchises found.</p>}
        </div>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">STANDINGS</p><h2>Official table</h2></div><span>{data.standings.length}</span></div>
        <div className="opsTable" role="table" aria-label="Operations standings">
          {data.standings.map((row, index) => {
            const franchise = franchiseBySf.get(row.season_franchise_id);
            return <div className="opsTableRow" role="row" key={row.season_franchise_id}><b>{index + 1}</b><span>{franchise?.name ?? 'Franchise'}</span><span>{row.wins ?? 0}-{row.losses ?? 0}-{row.ties ?? 0}</span><span>{Number(row.points_for ?? 0).toFixed(2)} PF</span></div>;
          })}
          {!data.standings.length && <p className="opsEmpty">No standings rows found.</p>}
        </div>
      </section>

      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">SCHEDULE</p><h2>Recent game state</h2></div><span>{data.matchups.length}</span></div>
        <div className="opsList">
          {data.matchups.slice(0, 20).map(game => {
            const home = franchiseBySf.get(game.home_season_franchise_id);
            const away = franchiseBySf.get(game.away_season_franchise_id);
            return <a className="opsRow" href={`/matchups/${game.id}`} key={game.id}><div><span>Week {game.week} {game.is_final ? 'Final' : 'Open'}</span><strong>{home?.abbreviation ?? home?.name ?? 'Home'} vs {away?.abbreviation ?? away?.name ?? 'Away'}</strong><small>{Number(game.home_points).toFixed(2)} - {Number(game.away_points).toFixed(2)} {game.event_type ?? ''}</small></div><b>App view</b></a>;
          })}
          {!data.matchups.length && <p className="opsEmpty">No schedule rows found.</p>}
        </div>
      </section>
    </>
  );
}
