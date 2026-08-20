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

  const { data: league } = await supabase.from('fantasy_leagues').select('id,name,created_at').eq('id', leagueId).maybeSingle();
  if (!league) notFound();
  const { data: franchises } = await supabase.from('franchises').select('id,name,abbreviation,primary_color,secondary_color,established_year').eq('league_id', leagueId).order('created_at');
  const { data: member } = await supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle();
  const { data: ownerships } = await supabase.from('franchise_owners').select('franchise_id').eq('user_id', user.id).is('ends_on', null);
  const ownedIds = new Set((ownerships ?? []).map(item => item.franchise_id));
  const { data: leagueSeason } = await supabase.from('league_seasons').select('id').eq('league_id', leagueId).maybeSingle();
  const { data: draft } = leagueSeason ? await supabase.from('drafts').select('id,status,starts_at').eq('league_season_id', leagueSeason.id).maybeSingle() : { data: null };
  const { count: circuitCount } = leagueSeason ? await supabase.from('matchups').select('id', { count: 'exact', head: true }).eq('league_season_id', leagueSeason.id).gte('week', 1).lte('week', 9) : { count: 0 };
  const { data: invites } = member?.role === 'commissioner'
    ? await supabase.from('league_invites').select('id,email,status,expires_at,invite_token').eq('league_id', leagueId).order('created_at', { ascending: false })
    : { data: [] as Array<{ id: string; email: string; status: string; expires_at: string; invite_token: string }> };
  const memberCount = franchises?.length ?? 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bigexecfs.com';

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">LEAGUE FRONT OFFICE</p>
        <h1>{league.name}</h1>
        <p className="lede">Pro Football • Half-PPR • {memberCount}/10 franchises claimed</p>
        {query.joined && <p className="successNotice">Franchise claimed. Welcome to the league.</p>}
        {query.schedule_status && <p className="successNotice">The Circuit schedule is ready: Weeks 1–9 are set.</p>}
      </section>

      {member?.role === 'commissioner' && (
        <section className="panel">
          <p className="eyebrow">COMMISSIONER / INVITES</p>
          <h2>Bring your league in.</h2>
          <p className="lede">Invite managers by email. Big Exec creates a secure claim link and sends it automatically when email delivery is configured.</p>
          {query.invite_error && <p className="errorNotice">{query.invite_error}</p>}
          {query.invite_created && query.invite_token && (
            <div className="inviteLinkBox">
              <span>INVITE READY FOR {query.invite_email}</span>
              <code>{`${appUrl}/invite/${query.invite_token}`}</code>
              <p className="lede">You can copy this claim link as a fallback if the email is delayed.</p>
            </div>
          )}
          {memberCount < 10 ? (
            <form className="inlineForm" action={createLeagueInvite}>
              <input type="hidden" name="league_id" value={leagueId} />
              <input name="email" type="email" required placeholder="manager@example.com" aria-label="Manager email" />
              <button className="primary" type="submit">Create Invite</button>
            </form>
          ) : <p className="successNotice">League full. All 10 franchise spots are claimed.</p>}
          {!!invites?.length && <div className="inviteList">{invites.map(invite => <div key={invite.id} className="inviteRow"><span>{invite.email}</span><strong>{invite.status.toUpperCase()}</strong></div>)}</div>}
        </section>
      )}

      <section className="panel">
        <p className="eyebrow">FRANCHISES</p>
        <div className="sportGrid">
          {(franchises ?? []).map((franchise) => {
            const card = <article className="sportCard" style={{ borderTop: `4px solid ${franchise.primary_color ?? '#e9ff70'}` }}>
              <span>{ownedIds.has(franchise.id) ? 'YOUR FRANCHISE' : `EST. ${franchise.established_year}`}</span>
              <strong>{franchise.name}</strong>
              <p className="lede">{franchise.abbreviation ?? 'FRANCHISE'}</p>
            </article>;
            return ownedIds.has(franchise.id) ? <a key={franchise.id} href={`/franchises/${franchise.id}/team`}>{card}</a> : <div key={franchise.id}>{card}</div>;
          })}
          {Array.from({ length: Math.max(0, 10 - memberCount) }).map((_, index) => <article className="sportCard emptyCard" key={`open-${index}`}><span>OPEN SLOT</span><strong>Awaiting Franchise</strong></article>)}
        </div>
      </section>

      {member?.role === 'commissioner' && (
        <section className="panel">
          <p className="eyebrow">DRAFT CONTROL</p>
          <h2>{draft ? 'Draft room ready.' : 'Set Draft Day.'}</h2>
          {query.draft_error && <p className="errorNotice">{query.draft_error}</p>}
          {draft ? (
            <div className="actions"><a className="primary" href={`/drafts/${draft.id}`}>Enter Draft Room</a><span className="lede">Status: {draft.status}</span></div>
          ) : memberCount === 10 ? (
            <form className="authForm" action={initializeDraft}>
              <input type="hidden" name="league_id" value={leagueId}/>
              <label>Draft date & time<input name="starts_at" type="datetime-local" /></label>
              <label>Seconds per pick<input name="pick_seconds" type="number" min="30" max="300" defaultValue="90" /></label>
              <button className="primary" type="submit">Randomize Order + Create Draft</button>
            </form>
          ) : <p className="lede">Draft setup unlocks after all 10 franchises are claimed.</p>}
        </section>
      )}

      {member?.role === 'commissioner' && memberCount === 10 && (
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
