import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export default async function JoinLeaguePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/join');

  const { data: invites } = await supabase
    .from('league_invites')
    .select('id,invite_token,status,expires_at,fantasy_leagues(name)')
    .eq('status','pending')
    .order('created_at', { ascending:false });

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">JOIN A BIG EXEC LEAGUE</p>
        <h1>Claim your franchise.</h1>
        <p className="lede">Big Exec leagues are invite-based during the friend beta. Open the invitation sent by your commissioner or claim any pending invitation shown below.</p>
        <div className="actions"><a className="secondary" href="/dashboard">Back to Front Office</a></div>
      </section>

      <section className="panel">
        <p className="eyebrow">PENDING INVITATIONS</p>
        <div className="sportGrid">
          {(invites ?? []).map((invite) => {
            const leagueRelation = invite.fantasy_leagues as unknown as { name?: string } | { name?: string }[] | null;
            const leagueName = Array.isArray(leagueRelation) ? leagueRelation[0]?.name : leagueRelation?.name;
            return (
              <a className="sportCard" key={invite.id} href={`/invite/${invite.invite_token}`}>
                <span>CLAIM FRANCHISE</span>
                <strong>{leagueName ?? 'Big Exec League'}</strong>
              </a>
            );
          })}
          {!invites?.length && (
            <article className="sportCard">
              <span>NO INVITES YET</span>
              <strong>Your commissioner sends the league invitation.</strong>
              <p className="lede">When an invite arrives, use the secure link in the email. It will return you directly to the franchise-claim screen after sign-in.</p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
