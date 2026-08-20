import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createLeagueInvite, generateCircuitSchedule } from '../actions';
import { initializeDraft } from '../../drafts/actions';

export default async function LeaguePage({ params, searchParams }: { params: Promise<{ leagueId: string }>; searchParams: Promise<{ invite_created?: string; invite_token?: string; invite_email?: string; invite_error?: string; joined?: string; draft_error?: string; schedule_error?: string; schedule_status?: string }> }) {
  const { leagueId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: league } = await supabase.from('fantasy_leagues').select('id,name,created_at,draft_min_franchises').eq('id', leagueId).maybeSingle();
  if (!league) notFound();
  const { data: franchises } = await supabase.from('franchises').select('id,name,abbreviation,primary_color,secondary_color,established_year').eq('league_id', leagueId).order('created_at');
  const { data: member } = await supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle();
  const { data: ownerships } = await supabase.from('franchise_owners').select('franchise_id').eq('user_id', user.id).is('ends_on', null);
  const ownedIds = new Set((ownerships ?? []).map(item => item.franchise_id));
  const { data: leagueSeason } = await supabase.from('league_seasons').select('id').eq('league_id', leagueId).maybeSingle();
  const { data: draft } = leagueSeason ? await supabase.from('drafts').select('id,status,starts_at,pick_seconds').eq('league_season_id', leagueSeason.id).maybeSingle() : { data: null };
  const { count: circuitCount } = leagueSeason ? await supabase.from('matchups').select('id', { count: 'exact', head: true }).eq('league_season_id', leagueSeason.id).gte('week', 1).lte('week', 9) : { count: 0 };
  const { data: invites } = member?.role === 'commissioner'
    ? await supabase.from('league_invites').select('id,email,status,expires_at,invite_token').eq('league_id', leagueId).order('created_at', { ascending: false })
    : { data: [] as Array<{ id: string; email: string; status: string; expires_at: string; invite_token: string }> };

  const memberCount = franchises?.length ?? 0;
  const draftMinimum = league.draft_min_franchises ?? 10;
  const draftReady = memberCount >= draftMinimum;
  const pendingInviteCount = (invites ?? []).filter(invite => invite.status === 'pending').length;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bigexecfs.com';
  const isCommissioner = member?.role === 'commissioner';
  const draftDate = draft?.starts_at ? new Date(draft.starts_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

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
            <span>{memberCount}/10 FRANCHISES</span>
            <span>{draftReady ? 'DRAFT READY' : `${Math.max(0, draftMinimum - memberCount)} TO DRAFT READY`}</span>
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
          <strong>{memberCount}</strong>
          <p>{Math.max(0, 10 - memberCount)} open league slots remain.</p>
        </article>
        <article className="leagueStatCard">
          <span>INVITES OUT</span>
          <strong>{pendingInviteCount}</strong>
          <p>Pending manager invitations.</p>
        </article>
      </section>

      {isCommissioner && (
        <section className="leagueCommandPanel">
          <div className="commandHeader">
            <div>
              <p className="eyebrow">COMMISSIONER COMMAND CENTER</p>
              <h2>Run the league.</h2>
            </div>
            <span className="commandBadge">BIG EXEC CONTROL</span>
          </div>

          <div className="commandGrid">
            <article className="commandCard">
              <span>01 • BUILD THE ROOM</span>
              <strong>{memberCount}/10 franchises claimed</strong>
              <p>Invite managers and fill franchise seats. This test league can draft once {draftMinimum} franchises are claimed.</p>
              {query.invite_error && <p className="errorNotice">{query.invite_error}</p>}
              {query.invite_created && query.invite_token && (
                <div className="inviteLinkBox">
                  <span>INVITE READY FOR {query.invite_email}</span>
                  <code>{`${appUrl}/invite/${query.invite_token}`}</code>
                </div>
              )}
              {memberCount < 10 ? (
                <form className="inlineForm" action={createLeagueInvite}>
                  <input type="hidden" name="league_id" value={leagueId} />
                  <input name="email" type="email" required placeholder="manager@example.com" aria-label="Manager email" />
                  <button className="primary" type="submit">Send Invite</button>
                </form>
              ) : <p className="successNotice">League full. All 10 franchise spots are claimed.</p>}
            </article>

            <article className={`commandCard ${draftReady ? 'readyCard' : ''}`}>
              <span>02 • SET DRAFT DAY</span>
              <strong>{draft ? 'Draft room created' : draftReady ? 'Ready to schedule' : `Need ${Math.max(0, draftMinimum - memberCount)} more franchise${draftMinimum - memberCount === 1 ? '' : 's'}`}</strong>
              {query.draft_error && <p className="errorNotice">{query.draft_error}</p>}
              {draft ? (
                <>
                  <p>{draftDate ? `Scheduled for ${draftDate}.` : 'Draft room exists and can be started by the commissioner.'}</p>
                  <a className="primary" href={`/drafts/${draft.id}`}>Enter Draft Room</a>
                </>
              ) : draftReady ? (
                <form className="authForm compactForm" action={initializeDraft}>
                  <input type="hidden" name="league_id" value={leagueId}/>
                  <label>Draft date & time<input name="starts_at" type="datetime-local" /></label>
                  <label>Seconds per pick<input name="pick_seconds" type="number" min="30" max="300" defaultValue="90" /></label>
                  <button className="primary" type="submit">Randomize Order + Create Draft</button>
                </form>
              ) : <p>Draft setup unlocks automatically when this league reaches {draftMinimum} claimed franchises.</p>}
            </article>
          </div>

          {!!invites?.length && (
            <div className="inviteLedger">
              <div className="sectionMiniHeader"><span>INVITE LEDGER</span><strong>{invites.length} TOTAL</strong></div>
              {invites.map(invite => <div key={invite.id} className="inviteRow"><span>{invite.email}</span><strong>{invite.status.toUpperCase()}</strong></div>)}
            </div>
          )}
        </section>
      )}

      <section className="leagueRosterSection">
        <div className="sectionTitleRow">
          <div>
            <p className="eyebrow">FRANCHISE FLOOR</p>
            <h2>The league.</h2>
          </div>
          <span className="sectionCounter">{memberCount}/10</span>
        </div>
        <div className="franchiseGrid">
          {(franchises ?? []).map((franchise, index) => {
            const mine = ownedIds.has(franchise.id);
            const card = (
              <article className={`franchiseCard ${mine ? 'myFranchise' : ''}`} style={{ '--team-primary': franchise.primary_color ?? '#d9b43b', '--team-secondary': franchise.secondary_color ?? '#f5f1e8' } as React.CSSProperties}>
                <div className="franchiseCardTop"><span>{mine ? 'YOUR FRANCHISE' : `SEAT ${String(index + 1).padStart(2,'0')}`}</span><b>{franchise.abbreviation ?? 'BEX'}</b></div>
                <div className="franchiseMonogram">{(franchise.abbreviation ?? franchise.name.slice(0,3)).slice(0,3).toUpperCase()}</div>
                <strong>{franchise.name}</strong>
                <p>EST. {franchise.established_year ?? new Date().getFullYear()}</p>
                {mine && <em>ENTER TEAM HQ →</em>}
              </article>
            );
            return mine ? <a key={franchise.id} href={`/franchises/${franchise.id}/team`}>{card}</a> : <div key={franchise.id}>{card}</div>;
          })}
          {Array.from({ length: Math.max(0, 10 - memberCount) }).map((_, index) => (
            <article className="franchiseCard openFranchise" key={`open-${index}`}>
              <div className="franchiseCardTop"><span>OPEN SEAT</span><b>{String(memberCount + index + 1).padStart(2,'0')}</b></div>
              <div className="franchiseMonogram">+</div>
              <strong>Awaiting Exec</strong>
              <p>Invite a manager to claim this franchise.</p>
            </article>
          ))}
        </div>
      </section>

      {isCommissioner && memberCount === 10 && (
        <section className="panel">
          <p className="eyebrow">SEASON SCHEDULE</p>
          <h2>{circuitCount === 45 ? 'The Circuit is set.' : 'Build Weeks 1–9.'}</h2>
          {query.schedule_error && <p className="errorNotice">{query.schedule_error}</p>}
          {circuitCount === 45 ? <p className="successNotice">45 head-to-head matchups generated. Every franchise plays every other franchise once.</p> : <form action={generateCircuitSchedule}><input type="hidden" name="league_id" value={leagueId}/><button className="primary" type="submit">Generate The Circuit</button></form>}
        </section>
      )}
    </main>
  );
}
