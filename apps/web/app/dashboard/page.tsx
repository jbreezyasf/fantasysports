import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { signOut } from '../auth/actions';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [leagueResult, profileResult, inviteResult] = await Promise.all([
    supabase.from('fantasy_leagues').select('id,name,created_at').order('created_at', { ascending: false }),
    supabase.from('user_profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('league_invites').select('id,invite_token,email,status,expires_at,fantasy_leagues(name)').eq('status','pending').order('created_at', { ascending:false })
  ]);

  const leagues = leagueResult.data;
  const profile = profileResult.data;
  const invites = inviteResult.data;
  const displayName = profile?.display_name || user.user_metadata?.display_name || 'Manager';
  const firstName = String(displayName).trim().split(/\s+/)[0] || 'Manager';
  const dataError = leagueResult.error?.message || profileResult.error?.message || inviteResult.error?.message;
  const leagueCount = leagues?.length ?? 0;
  const inviteCount = invites?.length ?? 0;

  return (
    <main className="frontOfficeShell">
      <section className="frontOfficeHero">
        <div className="frontOfficeHeroGlow" aria-hidden="true" />
        <div className="frontOfficeTopline">
          <div className="brandLockup"><span>BE</span><strong>BIG EXEC</strong></div>
          <form><button className="ghostAction" formAction={signOut}>Sign out</button></form>
        </div>
        <div className="frontOfficeHeroGrid">
          <div>
            <p className="eyebrow">FRONT OFFICE / COMMAND CENTER</p>
            <h1 className="frontOfficeTitle">Welcome back,<br/><em>{firstName}.</em></h1>
            <p className="frontOfficeCopy">Run your franchises, enter your leagues, and keep every season moving from one place.</p>
          </div>
          <aside className="frontOfficeScoreboard" aria-label="Front Office status">
            <span>YOUR BIG EXEC</span>
            <div><strong>{leagueCount}</strong><small>LEAGUE{leagueCount===1?'':'S'}</small></div>
            <div><strong>{inviteCount}</strong><small>PENDING INVITE{inviteCount===1?'':'S'}</small></div>
          </aside>
        </div>
        <div className="frontOfficeCommands">
          <a className="primary" href="/leagues/new">＋ Create League</a>
          <a className="secondary" href="/join">Join League</a>
          {leagues?.[0] && <a className="secondary" href={`/leagues/${leagues[0].id}`}>Enter Latest League →</a>}
        </div>
        {dataError && <p className="errorNotice" role="alert">We could not load all of your Front Office data: {dataError}</p>}
      </section>

      {!!invites?.length && (
        <section className="frontOfficeSection">
          <div className="sectionHeadingCompact"><div><p className="eyebrow">INBOX</p><h2>Franchise invitations.</h2></div><span>{inviteCount} OPEN</span></div>
          <div className="leagueTileGrid">
            {invites.map((invite) => {
              const leagueRelation = invite.fantasy_leagues as unknown as { name?: string } | { name?: string }[] | null;
              const leagueName = Array.isArray(leagueRelation) ? leagueRelation[0]?.name : leagueRelation?.name;
              return (
                <a className="leagueTile inviteTile" key={invite.id} href={`/invite/${invite.invite_token}`}>
                  <div className="leagueTileTop"><span>INVITATION</span><b>OPEN</b></div>
                  <div className="leagueTileMark">BE</div>
                  <div><small>PRO FOOTBALL</small><strong>{leagueName ?? 'Big Exec League'}</strong><p>Claim your franchise →</p></div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section className="frontOfficeSection">
        <div className="sectionHeadingCompact"><div><p className="eyebrow">YOUR WORLD</p><h2>Your leagues.</h2></div><span>{leagueCount} ACTIVE</span></div>
        <div className="leagueTileGrid">
          {(leagues ?? []).map((league, index) => (
            <a className="leagueTile" key={league.id} href={`/leagues/${league.id}`}>
              <div className="leagueTileTop"><span>PRO FOOTBALL</span><b>{index===0?'LATEST':'LEAGUE'}</b></div>
              <div className="leagueTileMark">{String(index+1).padStart(2,'0')}</div>
              <div><small>BIG EXEC FANTASY SPORTS</small><strong>{league.name}</strong><p>Enter League HQ →</p></div>
            </a>
          ))}
          {!dataError && !leagues?.length && (
            <article className="leagueTile emptyLeagueTile">
              <div className="leagueTileTop"><span>NO LEAGUES YET</span><b>START HERE</b></div>
              <div className="leagueTileMark">+</div>
              <div><small>BUILD YOUR FIRST UNIVERSE</small><strong>Create or join a league.</strong><p>Your franchise history starts with the first season.</p></div>
            </article>
          )}
        </div>
      </section>

      <section className="frontOfficeFooterBand">
        <div><span>BIG EXEC SYSTEM</span><strong>Fantasy. Franchise. Legacy.</strong></div>
        <p>Your identity follows you across leagues and future Big Exec sports.</p>
      </section>
    </main>
  );
}
