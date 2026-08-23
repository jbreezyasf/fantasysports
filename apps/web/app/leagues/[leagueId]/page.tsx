import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createLeagueInvite, generateCircuitSchedule } from '../actions';
import { initializeDraft } from '../../drafts/actions';
import { FranchiseCrest } from '../../components/FranchiseCrest';

export default async function LeaguePage({ params, searchParams }: { params: Promise<{ leagueId: string }>; searchParams: Promise<{ invite_created?: string; invite_token?: string; invite_email?: string; invite_error?: string; joined?: string; draft_error?: string; schedule_error?: string; schedule_status?: string }> }) {
  const { leagueId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: league } = await supabase.from('fantasy_leagues').select('id,name,created_at,draft_min_franchises,max_franchises').eq('id', leagueId).maybeSingle();
  if (!league) notFound();
  const { data: franchises } = await supabase.from('franchises').select('id,name,abbreviation,primary_color,secondary_color,established_year').eq('league_id', leagueId).order('created_at');
  const { data: member } = await supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle();
  const { data: ownerships } = await supabase.from('franchise_owners').select('franchise_id').eq('user_id', user.id).is('ends_on', null);
  const ownedIds = new Set((ownerships ?? []).map(item => item.franchise_id));
  const myFranchise = (franchises ?? []).find(item => ownedIds.has(item.id));
  const { data: leagueSeason } = await supabase.from('league_seasons').select('id').eq('league_id', leagueId).maybeSingle();

  const [{ data: draft }, { count: circuitCount }, { data: seasonFranchises }, { data: standings }, { data: activeMatchup }] = leagueSeason ? await Promise.all([
    supabase.from('drafts').select('id,status,starts_at,pick_seconds').eq('league_season_id', leagueSeason.id).maybeSingle(),
    supabase.from('matchups').select('id', { count: 'exact', head: true }).eq('league_season_id', leagueSeason.id).gte('week', 1).lte('week', 9),
    supabase.from('season_franchises').select('id,franchise_id').eq('league_season_id', leagueSeason.id),
    supabase.from('standings').select('season_franchise_id,wins,losses,ties,points_for,points_against').eq('league_season_id', leagueSeason.id).order('wins', { ascending: false }).order('points_for', { ascending: false }),
    supabase.from('matchups').select('id,week,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final,event_type').eq('league_season_id', leagueSeason.id).order('week', { ascending: false }).limit(1).maybeSingle()
  ]) : [{ data: null }, { count: 0 }, { data: [] }, { data: [] }, { data: null }];

  const { data: invites } = member?.role === 'commissioner'
    ? await supabase.from('league_invites').select('id,email,status,expires_at,invite_token').eq('league_id', leagueId).order('created_at', { ascending: false })
    : { data: [] as Array<{ id: string; email: string; status: string; expires_at: string; invite_token: string }> };

  const memberCount = franchises?.length ?? 0;
  const leagueCapacity = league.max_franchises ?? 10;
  const draftMinimum = league.draft_min_franchises ?? leagueCapacity;
  const draftReady = memberCount >= draftMinimum;
  const pendingInviteCount = (invites ?? []).filter(invite => invite.status === 'pending').length;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://bigexecfs.com';
  const isCommissioner = member?.role === 'commissioner';
  const draftDate = draft?.starts_at ? new Date(draft.starts_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const franchiseBySeasonId = new Map((seasonFranchises ?? []).map(sf => [sf.id, (franchises ?? []).find(f => f.id === sf.franchise_id)]));

  return (
    <main className="leagueShell">
      <section className="leagueHero">
        <div className="leagueHeroGlow" />
        <div className="leagueTopline">
          <a className="backLink" href="/dashboard">← FRONT OFFICE</a>
          <span className="leagueRole">{isCommissioner ? 'COMMISSIONER' : 'FRANCHISE MANAGER'}</span>
        </div>
        <div className="leagueHeroContent">
          <p className="eyebrow">BIG EXEC • LEAGUE HQ</p>
          <h1>{league.name}</h1>
          <p className="leagueTagline">Build the franchise. Run the room. Own the season.</p>
          <div className="leagueMetaRow">
            <span>PRO FOOTBALL</span>
            <span>HALF-PPR</span>
            <span>{memberCount}/{leagueCapacity} FRANCHISES</span>
            <span>{draft?.status === 'completed' ? 'DRAFT COMPLETE' : draftReady ? 'DRAFT READY' : `${Math.max(0, draftMinimum - memberCount)} TO DRAFT READY`}</span>
          </div>
        </div>
      </section>

      {query.joined && <p className="successNotice">Franchise claimed. Welcome to the league.</p>}
      {query.schedule_status && <p className="successNotice">The Circuit schedule is ready: Weeks 1–9 are set.</p>}

      <section className="leagueQuickGrid">
        <article className="leagueStatCard featured">
          <span>DRAFT STATUS</span>
          <strong>{draft ? draft.status.toUpperCase() : draftReady ? 'READY TO SCHEDULE' : 'BUILDING THE ROOM'}</strong>
          <p>{draftDate ? `Draft Day: ${draftDate}` : `${memberCount} of ${draftMinimum} required franchises claimed for this league.`}</p>
        </article>
        <article className="leagueStatCard">
          <span>FRANCHISES</span>
          <strong>{memberCount}/{leagueCapacity}</strong>
          <p>{Math.max(0, leagueCapacity - memberCount)} open league slots remain.</p>
        </article>
        <article className="leagueStatCard">
          <span>INVITES OUT</span>
          <strong>{pendingInviteCount}</strong>
          <p>Pending manager invitations.</p>
        </article>
      </section>

      {draft?.status === 'completed' && (
        <section className="leagueCommandPanel">
          <div className="commandHeader">
            <div><p className="eyebrow">SEASON COMMAND</p><h2>Game mode.</h2></div>
            <span className="commandBadge">POST-DRAFT</span>
          </div>
          <div className="commandGrid">
            <article className="commandCard readyCard">
              <span>YOUR FRONT OFFICE</span>
              <strong>{myFranchise?.name ?? 'Franchise ready'}</strong>
              <p>Set starters, review your bench, and prepare each weekly lineup.</p>
              {myFranchise && <a className="primary" href={`/franchises/${myFranchise.id}/team`}>Manage Team</a>}
            </article>
            <article className="commandCard readyCard">
              <span>{activeMatchup?.is_final ? `WEEK ${activeMatchup.week} • FINAL` : activeMatchup ? `WEEK ${activeMatchup.week} • MATCHUP` : 'MATCHUP'}</span>
              <strong>{activeMatchup ? `${Number(activeMatchup.home_points).toFixed(2)} – ${Number(activeMatchup.away_points).toFixed(2)}` : 'Schedule pending'}</strong>
              <p>{activeMatchup ? `${franchiseBySeasonId.get(activeMatchup.home_season_franchise_id)?.name ?? 'Home'} vs ${franchiseBySeasonId.get(activeMatchup.away_season_franchise_id)?.name ?? 'Away'}` : 'Your next opponent will appear here when the schedule is set.'}</p>
              {activeMatchup && <a className="primary" href={`/matchups/${activeMatchup.id}`}>View Matchup</a>}
            </article>
          </div>
        </section>
      )}

      {isCommissioner && (
        <section className="leagueCommandPanel">
          <div className="commandHeader">
            <div><p className="eyebrow">COMMISSIONER COMMAND CENTER</p><h2>Run the league.</h2></div>
            <span className="commandBadge">BIG EXEC CONTROL</span>
          </div>
          <div className="commandGrid">
            <article className="commandCard">
              <span>01 • BUILD THE ROOM</span>
              <strong>{memberCount}/{leagueCapacity} franchises claimed</strong>
              <p>Invite managers and fill franchise seats. Draft setup unlocks at {draftMinimum} claimed franchises.</p>
              {query.invite_error && <p className="errorNotice">{query.invite_error}</p>}
              {query.invite_created && query.invite_token && <div className="inviteLinkBox"><span>INVITE READY FOR {query.invite_email}</span><code>{`${appUrl}/invite/${query.invite_token}`}</code></div>}
              {memberCount < leagueCapacity ? (
                <form className="inlineForm" action={createLeagueInvite}>
                  <input type="hidden" name="league_id" value={leagueId} />
                  <input name="email" type="email" required placeholder="manager@example.com" aria-label="Manager email" />
                  <button className="primary" type="submit">Send Invite</button>
                </form>
              ) : <p className="successNotice">League full. All {leagueCapacity} franchise spots are claimed.</p>}
            </article>
            <article className={`commandCard ${draftReady ? 'readyCard' : ''}`}>
              <span>02 • SET DRAFT DAY</span>
              <strong>{draft ? 'Draft room created' : draftReady ? 'Ready to schedule' : `Need ${Math.max(0, draftMinimum - memberCount)} more franchise${draftMinimum - memberCount === 1 ? '' : 's'}`}</strong>
              {query.draft_error && <p className="errorNotice">{query.draft_error}</p>}
              {draft ? <><p>{draftDate ? `Scheduled for ${draftDate}.` : `Draft status: ${draft.status}.`}</p><a className="primary" href={`/drafts/${draft.id}`}>Enter Draft Room</a></> : draftReady ? (
                <form className="authForm compactForm" action={initializeDraft}>
                  <input type="hidden" name="league_id" value={leagueId}/>
                  <label>Draft date & time<input name="starts_at" type="datetime-local" /></label>
                  <label>Seconds per pick<input name="pick_seconds" type="number" min="30" max="300" defaultValue="90" /></label>
                  <button className="primary" type="submit">Randomize Order + Create Draft</button>
                </form>
              ) : <p>Draft setup unlocks automatically when this league reaches {draftMinimum} claimed franchises.</p>}
            </article>
          </div>
          {!!invites?.length && <div className="inviteLedger"><div className="sectionMiniHeader"><span>INVITE LEDGER</span><strong>{invites.length} TOTAL</strong></div>{invites.map(invite => <div key={invite.id} className="inviteRow"><span>{invite.email}</span><strong>{invite.status.toUpperCase()}</strong></div>)}</div>}
        </section>
      )}

      <section className="leagueRosterSection">
        <div className="sectionTitleRow"><div><p className="eyebrow">FRANCHISE FLOOR</p><h2>The league.</h2></div><span className="sectionCounter">{memberCount}/{leagueCapacity}</span></div>
        <div className="franchiseGrid">
          {(franchises ?? []).map((franchise, index) => {
            const mine = ownedIds.has(franchise.id);
            const card = <article className={`franchiseCard ${mine ? 'myFranchise' : ''}`} style={{ '--team-primary': franchise.primary_color ?? '#d9b43b', '--team-secondary': franchise.secondary_color ?? '#f5f1e8' } as React.CSSProperties}>
              <div className="franchiseCardTop"><span>{mine ? 'YOUR FRANCHISE' : `SEAT ${String(index + 1).padStart(2,'0')}`}</span><b>{franchise.abbreviation ?? 'BEX'}</b></div>
              <FranchiseCrest className="franchiseMonogram franchiseCardCrest" name={franchise.name} abbreviation={franchise.abbreviation} primary={franchise.primary_color} secondary={franchise.secondary_color} decorative/><strong>{franchise.name}</strong><p>EST. {franchise.established_year ?? new Date().getFullYear()}</p>{mine && <em>ENTER TEAM HQ →</em>}
            </article>;
            return mine ? <a key={franchise.id} href={`/franchises/${franchise.id}/team`}>{card}</a> : <div key={franchise.id}>{card}</div>;
          })}
          {Array.from({ length: Math.max(0, leagueCapacity - memberCount) }).map((_, index) => <article className="franchiseCard openFranchise" key={`open-${index}`}><div className="franchiseCardTop"><span>OPEN SEAT</span><b>{String(memberCount + index + 1).padStart(2,'0')}</b></div><div className="franchiseMonogram">+</div><strong>Awaiting Exec</strong><p>Invite a manager to claim this franchise.</p></article>)}
        </div>
      </section>

      {!!standings?.length && (
        <section className="panel">
          <p className="eyebrow">STANDINGS</p><h2>League table.</h2>
          <div className="standingsList">{standings.map((row, index) => { const franchise = franchiseBySeasonId.get(row.season_franchise_id); return <div className="standingRow" key={row.season_franchise_id}><b>{index + 1}</b><span>{franchise?.name ?? 'Franchise'}</span><small>{row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ''}</small><small>PF {Number(row.points_for).toFixed(2)}</small></div>; })}</div>
        </section>
      )}

      {isCommissioner && leagueCapacity === 10 && memberCount === 10 && (
        <section className="panel">
          <p className="eyebrow">SEASON SCHEDULE</p><h2>{circuitCount === 45 ? 'The Circuit is set.' : 'Build Weeks 1–9.'}</h2>
          {query.schedule_error && <p className="errorNotice">{query.schedule_error}</p>}
          {circuitCount === 45 ? <p className="successNotice">45 head-to-head matchups generated. Every franchise plays every other franchise once.</p> : <form action={generateCircuitSchedule}><input type="hidden" name="league_id" value={leagueId}/><button className="primary" type="submit">Generate The Circuit</button></form>}
        </section>
      )}
    </main>
  );
}
