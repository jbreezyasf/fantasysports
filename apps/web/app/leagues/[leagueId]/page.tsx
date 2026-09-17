import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createLeagueShareInvite, generateCircuitSchedule, removePreDraftFranchise, resendLeagueInvite } from '../actions';
import { initializeDraft } from '../../drafts/actions';
import { FranchiseCrest } from '../../components/FranchiseCrest';
import { standingRowLabel } from './standingsAccessibility';
import InviteManagersForm from './InviteManagersForm';
import DraftSettingsFields from './DraftSettingsFields';
import { inviteConfirmation } from './invitationAccessibility';
import { currentCompetitionWeek, selectFrontOfficeMatchup } from './frontOfficeMatchup';

export default async function LeaguePage({ params, searchParams }: { params: Promise<{ leagueId: string }>; searchParams: Promise<{ invite_created?: string; invite_resent?: string; invite_count?: string; email_status?: string; invite_error?: string; joined?: string; member_removed?: string; draft_error?: string; schedule_error?: string; schedule_status?: string }> }) {
  const { leagueId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: league } = await supabase.from('fantasy_leagues').select('id,name,created_at,draft_min_franchises,max_franchises').eq('id', leagueId).maybeSingle();
  if (!league) notFound();
  const { data: franchises } = await supabase.from('franchises').select('id,name,abbreviation,primary_color,secondary_color,avatar_key,established_year').eq('league_id', leagueId).order('created_at');
  const { data: member } = await supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle();
  const { data: ownerships } = await supabase.from('franchise_owners').select('franchise_id').eq('user_id', user.id).is('ends_on', null);
  const { data: profile } = await supabase.from('user_profiles').select('display_name').eq('user_id', user.id).maybeSingle();
  const { data: activeOwners } = await supabase.from('franchise_owners').select('franchise_id,user_id').is('ends_on', null);
  const ownedIds = new Set((ownerships ?? []).map(item => item.franchise_id));
  const myFranchise = (franchises ?? []).find(item => ownedIds.has(item.id));
  const { data: leagueSeason } = await supabase.from('league_seasons').select('id,competition_season_id').eq('league_id', leagueId).eq('is_current', true).maybeSingle();

  const [{ data: draft }, { count: circuitCount }, { data: seasonFranchises }, { data: standings }, { data: seasonMatchups }, { data: competitionGames }, { data: leagueNews }] = leagueSeason ? await Promise.all([
    supabase.from('drafts').select('id,status,starts_at,pick_seconds').eq('league_season_id', leagueSeason.id).maybeSingle(),
    supabase.from('matchups').select('id', { count: 'exact', head: true }).eq('league_season_id', leagueSeason.id).gte('week', 1).lte('week', 9),
    supabase.from('season_franchises').select('id,franchise_id').eq('league_season_id', leagueSeason.id),
    supabase.from('standings').select('season_franchise_id,wins,losses,ties,points_for,points_against').eq('league_season_id', leagueSeason.id).order('wins', { ascending: false }).order('points_for', { ascending: false }),
    supabase.from('matchups').select('id,week,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final,event_type').eq('league_season_id', leagueSeason.id).order('week', { ascending: true }),
    supabase.from('real_games').select('week,starts_at').eq('competition_season_id', leagueSeason.competition_season_id).order('starts_at', { ascending: true }),
    supabase.from('league_feed_events').select('id,event_type,body,created_at').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(4)
  ]) : [{ data: null }, { count: 0 }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const { data: invites } = member?.role === 'commissioner'
    ? await supabase.from('league_invites').select('id,email,status,expires_at,invite_token').eq('league_id', leagueId).order('created_at', { ascending: false })
    : { data: [] as Array<{ id: string; email: string; status: string; expires_at: string; invite_token: string }> };

  const memberCount = franchises?.length ?? 0;
  const leagueCapacity = league.max_franchises ?? 10;
  const draftMinimum = league.draft_min_franchises ?? leagueCapacity;
  const draftReady = memberCount >= draftMinimum;
  const isShareInvite = (email: string) => /^share\+[a-f0-9]{32}@bigexecfs\.local$/i.test(email);
  const pendingInvites = (invites ?? []).filter(invite => invite.status === 'pending');
  const historicalInvites = (invites ?? []).filter(invite => invite.status !== 'pending');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://bigexecfs.com';
  const isCommissioner = member?.role === 'commissioner';
  const draftDate = draft?.starts_at ? new Date(draft.starts_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const franchiseBySeasonId = new Map((seasonFranchises ?? []).map(sf => [sf.id, (franchises ?? []).find(f => f.id === sf.franchise_id)]));
  const ownerByFranchiseId = new Map((activeOwners ?? []).map(owner => [owner.franchise_id, owner.user_id]));
  const canRemoveManagers = isCommissioner && (!draft || draft.status === 'scheduled');
  const draftComplete = draft?.status === 'completed';
  const mySeasonFranchise = (seasonFranchises ?? []).find(item=>item.franchise_id===myFranchise?.id);
  const myStanding = (standings ?? []).find(row=>row.season_franchise_id===mySeasonFranchise?.id);
  const myRank = myStanding ? (standings ?? []).findIndex(row=>row.season_franchise_id===myStanding.season_franchise_id)+1 : null;
  const currentWeek = currentCompetitionWeek(competitionGames ?? []);
  const activeMatchup = selectFrontOfficeMatchup(seasonMatchups ?? [], mySeasonFranchise?.id, currentWeek);
  const managerName = profile?.display_name || user.user_metadata?.display_name || 'Franchise Manager';
  const record = myStanding ? `${myStanding.wins}-${myStanding.losses}${myStanding.ties?`-${myStanding.ties}`:''}` : '0-0';
  const frontOfficePrimaryHref = draftComplete ? `/leagues/${leagueId}/players` : draft ? `/drafts/${draft.id}` : '#league-administration';
  const frontOfficePrimaryLabel = draftComplete ? 'Free Agency' : 'Draft Room';
  const homeFranchise = activeMatchup ? franchiseBySeasonId.get(activeMatchup.home_season_franchise_id) : null;
  const awayFranchise = activeMatchup ? franchiseBySeasonId.get(activeMatchup.away_season_franchise_id) : null;

  return (
    <main className="leagueShell">
      <section className="frontOfficeLeagueHero" style={{'--team-primary':myFranchise?.primary_color??'#d9b43b','--team-secondary':myFranchise?.secondary_color??'#f5f1e8'} as React.CSSProperties}>
        <div className="executiveSuiteScene" aria-hidden="true" />
        <div className="frontOfficeLeagueTop"><a href="/dashboard">BIG EXEC</a><div><span>{league.name}</span><b>{isCommissioner?'COMMISSIONER':'MANAGER'}</b></div></div>
        <div className="frontOfficeIdentity">
          {myFranchise&&<FranchiseCrest className="frontOfficeCrest" name={myFranchise.name} abbreviation={myFranchise.abbreviation} primary={myFranchise.primary_color} secondary={myFranchise.secondary_color} avatarKey={myFranchise.avatar_key}/>}
          <div><p className="eyebrow">YOUR FRONT OFFICE</p><h1>{myFranchise?.name??league.name}</h1><p>{managerName}</p>{myFranchise&&<a className="officeLineupLink" href={`/franchises/${myFranchise.id}/team`}>Manage your lineup <span aria-hidden="true">↗</span></a>}</div>
          <div className="frontOfficeRecord" aria-label={`Record ${record}${myRank?`, league rank ${myRank}`:''}`}><span>RECORD</span><strong>{record}</strong>{myRank&&<small>#{myRank} IN LEAGUE</small>}</div>
        </div>
        <div className="frontOfficeGameStrip">
          <div className="officeWeek"><span>{activeMatchup?`WEEK ${activeMatchup.week}`:'SEASON STATUS'}</span><strong>{activeMatchup?(activeMatchup.is_final?'Final result':'This week’s matchup'):(draftComplete?'Schedule pending':'Draft preparation')}</strong></div>
          {activeMatchup&&<div className="frontOfficeMiniScore" aria-label={`${franchiseBySeasonId.get(activeMatchup.home_season_franchise_id)?.name??'Home'} ${Number(activeMatchup.home_points).toFixed(2)}, ${franchiseBySeasonId.get(activeMatchup.away_season_franchise_id)?.name??'Away'} ${Number(activeMatchup.away_points).toFixed(2)}`}><div>{homeFranchise&&<FranchiseCrest className="frontOfficeMatchupCrest" name={homeFranchise.name} abbreviation={homeFranchise.abbreviation} primary={homeFranchise.primary_color} secondary={homeFranchise.secondary_color} avatarKey={homeFranchise.avatar_key} decorative/>}<span>{franchiseBySeasonId.get(activeMatchup.home_season_franchise_id)?.name??'Home'}</span><b>{Number(activeMatchup.home_points).toFixed(2)}</b></div><i aria-hidden="true">VS</i><div>{awayFranchise&&<FranchiseCrest className="frontOfficeMatchupCrest" name={awayFranchise.name} abbreviation={awayFranchise.abbreviation} primary={awayFranchise.primary_color} secondary={awayFranchise.secondary_color} avatarKey={awayFranchise.avatar_key} decorative/>}<span>{franchiseBySeasonId.get(activeMatchup.away_season_franchise_id)?.name??'Away'}</span><b>{Number(activeMatchup.away_points).toFixed(2)}</b></div></div>}
          {activeMatchup?<a href={`/matchups/${activeMatchup.id}`}>Open matchup <span aria-hidden="true">→</span></a>:myFranchise?<a href={`/franchises/${myFranchise.id}/team`}>Manage lineup <span aria-hidden="true">→</span></a>:null}
        </div>
      </section>

      {query.joined && <p className="successNotice">Franchise claimed. Welcome to the league.</p>}
      {query.member_removed && <p className="successNotice">Franchise seat reopened.</p>}
      {query.schedule_status && <p className="successNotice">The Circuit schedule is ready: Weeks 1–9 are set.</p>}

      <section className="frontOfficeActions" aria-labelledby="front-office-actions-heading">
        <div className="frontOfficeSectionTitle"><div><p className="eyebrow">MAKE YOUR MOVE</p><h2 id="front-office-actions-heading">What needs attention</h2></div><span>{draftComplete?'SEASON ACTIVE':draft?.status?.toUpperCase()??'PRESEASON'}</span></div>
        <div className="frontOfficeActionGrid">
          <a className="frontOfficeActionCard is-primary" href={frontOfficePrimaryHref}><span>01</span><div><small>{draftComplete?'ROSTER MARKET':draftDate??'BUILD YOUR BOARD'}</small><strong>{frontOfficePrimaryLabel}</strong><p>{draftComplete?'Add players and manage waiver claims.':draft?.status==='live'?'The room is live. Make your pick.':'Prepare your queue and enter the room.'}</p></div><b aria-hidden="true">→</b></a>
          <a className="frontOfficeActionCard" href={`/leagues/${leagueId}/locker-room`}><span>02</span><div><small>LEAGUE CONVERSATION</small><strong>Locker Room</strong><p>Talk with managers and follow league activity.</p></div><b aria-hidden="true">→</b></a>
          <a className="frontOfficeActionCard" href={`/leagues/${leagueId}/trades`}><span>03</span><div><small>DEALS & NEGOTIATIONS</small><strong>Trade Room</strong><p>Build offers and review proposals.</p></div><b aria-hidden="true">→</b></a>
          <a className="frontOfficeActionCard" href={`/leagues/${leagueId}/news`}><span>04</span><div><small>LATEST FROM {league.name.toUpperCase()}</small><strong>League News</strong><p>{leagueNews?.[0]?.body??'Standings, moves, and weekly headlines appear here.'}</p></div><b aria-hidden="true">→</b></a>
        </div>
      </section>

      {isCommissioner && (
        <details className="commissionerDrawer" id="league-administration" open={!draftComplete}>
          <summary><span><small>COMMISSIONER</small><strong>League administration</strong></span><b>{memberCount}/{leagueCapacity} FRANCHISES</b></summary>
          <section className="leagueCommandPanel">
          <div className="commandHeader">
            <div><p className="eyebrow">COMMISSIONER COMMAND CENTER</p><h2>Run the league.</h2></div>
            <a className="secondary" href={`/leagues/${leagueId}/settings/roster-integrity`}>League Settings</a>
          </div>
          <div className="commandGrid">
            <article className="commandCard">
              <span>01 • BUILD THE ROOM</span>
              <strong>{memberCount}/{leagueCapacity} franchises claimed</strong>
              <p>Invite managers and fill franchise seats. Draft setup unlocks at {draftMinimum} claimed franchises.</p>
              {query.invite_error && <p className="errorNotice" role="alert">{query.invite_error}</p>}
              {query.invite_created && <p className="successNotice" role="status">{inviteConfirmation(Number(query.invite_count??1),'manager',query.email_status)} The secure links are available in Invitations Needing Action below.</p>}
              {query.invite_resent && <p className="successNotice" role="status">{inviteConfirmation(1,'manager',query.email_status)}</p>}
              {memberCount < leagueCapacity ? (
                <>
                  <InviteManagersForm leagueId={leagueId} pendingEmails={(invites??[]).filter(invite=>invite.status==='pending' && !isShareInvite(invite.email)).map(invite=>invite.email)} />
                  <form action={createLeagueShareInvite} className="shareInviteForm">
                    <input type="hidden" name="league_id" value={leagueId} />
                    <p>One link can be sent by text or message and reused until the league fills.</p>
                    <button className="secondary" type="submit">Create Share Link</button>
                  </form>
                </>
              ) : <p className="successNotice">League full. All {leagueCapacity} franchise spots are claimed.</p>}
            </article>
            <article className={`commandCard ${draftReady ? 'readyCard' : ''}`}>
              <span>{draftComplete?'02 • TRADE ROOM':'02 • SET DRAFT DAY'}</span>
              <strong>{draftComplete?'Shape the roster':draft ? 'Draft room created' : draftReady ? 'Ready to schedule' : `Need ${Math.max(0, draftMinimum - memberCount)} more franchise${draftMinimum - memberCount === 1 ? '' : 's'}`}</strong>
              {query.draft_error && <p className="errorNotice">{query.draft_error}</p>}
              {draftComplete?<><p>Draft night is over. Move into season management and work the trade market.</p><a className="primary" href={`/leagues/${leagueId}/trades`}>Enter Trade Room</a></>:draft ? <><p>{draftDate ? `Scheduled for ${draftDate}.` : `Draft status: ${draft.status}.`}</p><a className="primary" href={`/drafts/${draft.id}`}>Enter Draft Room</a></> : draftReady ? (
                <form className="authForm compactForm" action={initializeDraft}>
                  <input type="hidden" name="league_id" value={leagueId}/>
                  <DraftSettingsFields franchiseCount={memberCount}/>
                  <button className="primary" type="submit">Randomize Order + Create Draft</button>
                </form>
              ) : <p>Draft setup unlocks automatically when this league reaches {draftMinimum} claimed franchises.</p>}
            </article>
          </div>
          {!!pendingInvites.length && <div className="inviteLedger" role="table" aria-label="Pending league invitations"><div className="sectionMiniHeader"><span>INVITATIONS NEEDING ACTION</span><strong>{pendingInvites.length} PENDING</strong></div><div className="srOnly" role="row"><span role="columnheader">Email</span><span role="columnheader">Status</span><span role="columnheader">Expires</span><span role="columnheader">Invite link</span><span role="columnheader">Actions</span></div>{pendingInvites.map(invite => { const shareInvite = isShareInvite(invite.email); const inviteLabel = shareInvite ? 'Share link' : invite.email; return <div key={invite.id} className="inviteRow" role="row" aria-label={`Invite for ${inviteLabel}. Status pending. Expires ${new Date(invite.expires_at).toLocaleDateString()}. Invite link ${appUrl}/invite/${invite.invite_token}.${!shareInvite?' Resend available.':' Reusable share link.'}`}><span role="cell">{inviteLabel}</span><strong role="cell">PENDING</strong><small className="srOnly" role="cell">Expires {new Date(invite.expires_at).toLocaleDateString()}</small><a role="cell" href={`/invite/${invite.invite_token}`} aria-label={`Open invite link for ${inviteLabel}`}>Invite Link</a><span role="cell">{!shareInvite?<form action={resendLeagueInvite}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="invite_id" value={invite.id}/><button className="miniAction" type="submit" aria-label={`Resend invitation to ${invite.email}`}>Resend</button></form>:<span className="srOnly">Reusable share link</span>}</span></div>})}</div>}
          {!!historicalInvites.length && <details className="inviteHistory"><summary><span>Invitation history</span><strong>{historicalInvites.length} completed or expired</strong></summary><div className="inviteLedger" role="table" aria-label="Completed and expired league invitations"><div className="srOnly" role="row"><span role="columnheader">Email</span><span role="columnheader">Status</span></div>{historicalInvites.map(invite => { const inviteLabel=isShareInvite(invite.email)?'Share link':invite.email; return <div key={invite.id} className="inviteRow historicalInviteRow" role="row" aria-label={`Invite for ${inviteLabel}. Status ${invite.status}.`}><span role="cell">{inviteLabel}</span><strong role="cell">{invite.status.toUpperCase()}</strong></div>})}</div></details>}
          </section>
        </details>
      )}

      <details className="frontOfficeSecondary">
        <summary><span><small>LEAGUE DIRECTORY</small><strong>All franchises</strong></span><b>{memberCount}/{leagueCapacity}</b></summary>
      <section className="leagueRosterSection">
        <div className="sectionTitleRow"><div><p className="eyebrow">FRANCHISE FLOOR</p><h2>The league.</h2></div><span className="sectionCounter">{memberCount}/{leagueCapacity}</span></div>
        <div className="franchiseGrid">
          {(franchises ?? []).map((franchise, index) => {
            const mine = ownedIds.has(franchise.id);
            const canRemove = canRemoveManagers && !mine && ownerByFranchiseId.get(franchise.id);
            const card = <article className={`franchiseCard ${mine ? 'myFranchise' : ''}`} style={{ '--team-primary': franchise.primary_color ?? '#d9b43b', '--team-secondary': franchise.secondary_color ?? '#f5f1e8' } as React.CSSProperties}>
              <div className="franchiseCardTop"><span>{mine ? 'YOUR FRANCHISE' : `SEAT ${String(index + 1).padStart(2,'0')}`}</span><b>{franchise.abbreviation ?? 'BEX'}</b></div>
              <FranchiseCrest className="franchiseMonogram franchiseCardCrest" name={franchise.name} abbreviation={franchise.abbreviation} primary={franchise.primary_color} secondary={franchise.secondary_color} avatarKey={franchise.avatar_key} decorative/><strong>{franchise.name}</strong><p>EST. {franchise.established_year ?? new Date().getFullYear()}</p>{mine && <em>ENTER TEAM HQ →</em>}
              {canRemove && <form action={removePreDraftFranchise} className="franchiseRemoveForm"><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="franchise_id" value={franchise.id}/><button className="miniAction" type="submit" aria-label={`Remove ${franchise.name} and reopen this franchise seat`}>Remove</button></form>}
            </article>;
            return mine ? <a key={franchise.id} href={`/franchises/${franchise.id}/team`}>{card}</a> : <div key={franchise.id}>{card}</div>;
          })}
          {Array.from({ length: Math.max(0, leagueCapacity - memberCount) }).map((_, index) => <article className="franchiseCard openFranchise" key={`open-${index}`}><div className="franchiseCardTop"><span>OPEN SEAT</span><b>{String(memberCount + index + 1).padStart(2,'0')}</b></div><div className="franchiseMonogram">+</div><strong>Awaiting Exec</strong><p>Invite a manager to claim this franchise.</p></article>)}
        </div>
      </section>
      </details>

      <section className="frontOfficeLowerGrid">
      {!!standings?.length && (
        <section className="panel frontOfficeStandings">
          <p className="eyebrow">STANDINGS</p><h2>League table.</h2>
          <div className="standingsList" role="table" aria-label="League standings"><div className="srOnly" role="row"><span role="columnheader">Rank</span><span role="columnheader">Team</span><span role="columnheader">Record</span><span role="columnheader">Points for</span></div>{standings.map((row, index) => { const franchise = franchiseBySeasonId.get(row.season_franchise_id); const record=`${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`; return <div className="standingRow" role="row" aria-label={standingRowLabel({rank:index+1,team:franchise?.name??'Franchise',record,pointsFor:Number(row.points_for)})} key={row.season_franchise_id}><b role="cell">{index + 1}</b><span role="cell">{franchise?.name ?? 'Franchise'}</span><small role="cell">{record}</small><small role="cell">PF {Number(row.points_for).toFixed(2)}</small></div>; })}</div>
        </section>
      )}

      <section className="panel frontOfficeNews" id="league-news">
        <p className="eyebrow">LEAGUE NEWS</p><h2>From around the league</h2>
        <div className="frontOfficeNewsList">{(leagueNews??[]).map(item=><article key={item.id}><span>{item.event_type.replaceAll('_',' ')}</span><strong>{item.body}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</time></article>)}{!leagueNews?.length&&<p>No league headlines yet. Draft picks, trades, results, and awards will appear here.</p>}</div>
        <a className="secondary" href={`/leagues/${leagueId}/news`}>Open League News</a>
      </section>
      </section>

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
