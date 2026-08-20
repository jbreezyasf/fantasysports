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
  const dataError = leagueResult.error?.message || profileResult.error?.message || inviteResult.error?.message;

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">BIG EXEC FRONT OFFICE</p>
        <h1>Welcome, {displayName}.</h1>
        <p className="lede">Your Big Exec account follows you across leagues and sports. Your role is determined inside each league: create one to become its commissioner, or join one as a franchise manager.</p>
        {dataError && <p className="errorNotice">We could not load all of your Front Office data: {dataError}</p>}
        <div className="actions">
          <a className="primary" href="/leagues/new">Create a League</a>
          <a className="secondary" href="/join">Join a League</a>
          <form><button className="secondary" formAction={signOut}>Sign out</button></form>
        </div>
      </section>

      {!!invites?.length && (
        <section className="panel">
          <p className="eyebrow">YOUR INVITATIONS</p>
          <h2>Franchises waiting for you.</h2>
          <div className="sportGrid">
            {invites.map((invite) => {
              const leagueRelation = invite.fantasy_leagues as unknown as { name?: string } | { name?: string }[] | null;
              const leagueName = Array.isArray(leagueRelation) ? leagueRelation[0]?.name : leagueRelation?.name;
              return (
                <a className="sportCard" key={invite.id} href={`/invite/${invite.invite_token}`}>
                  <span>PENDING INVITE</span>
                  <strong>{leagueName ?? 'Big Exec League'}</strong>
                  <p className="lede">Claim your franchise</p>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <p className="eyebrow">YOUR LEAGUES</p>
        <div className="sportGrid">
          {(leagues ?? []).map((league) => (
            <a className="sportCard" key={league.id} href={`/leagues/${league.id}`}>
              <span>PRO FOOTBALL</span>
              <strong>{league.name}</strong>
            </a>
          ))}
          {!dataError && !leagues?.length && (
            <article className="sportCard">
              <span>NO LEAGUES YET</span>
              <strong>Build or join your first franchise universe.</strong>
              <p className="lede">Creating a league makes you its commissioner. Joining an invitation makes you a franchise manager.</p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
