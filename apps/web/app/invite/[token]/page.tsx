import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { acceptLeagueInvite } from '../../leagues/actions';

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: invite } = await supabase
    .from('league_invites')
    .select('email,status,expires_at,league_id,fantasy_leagues(name)')
    .eq('invite_token', token)
    .maybeSingle();

  if (!invite || invite.status !== 'pending') {
    return <main><section className="panel"><p className="eyebrow">INVITE STATUS</p><h1>This invite is unavailable.</h1><p className="lede">It may have expired, already been claimed, or been replaced by a newer invitation.</p></section></main>;
  }

  const leagueName = Array.isArray(invite.fantasy_leagues) ? invite.fantasy_leagues[0]?.name : (invite.fantasy_leagues as { name?: string } | null)?.name;

  if (!user) {
    const next = `/invite/${token}`;
    redirect(`/login?message=${encodeURIComponent(`You've been invited to ${leagueName ?? 'a fantasy league'}. Sign in or create your account to claim your franchise.`)}&next=${encodeURIComponent(next)}`);
  }

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">YOU'VE BEEN INVITED</p>
        <h1>Claim your franchise.</h1>
        <p className="lede">You're joining <strong>{leagueName ?? 'this league'}</strong>. Create the franchise identity that will carry your record, rivalry history, achievements and future championship banners.</p>
        {query.error && <p className="errorNotice">{query.error}</p>}
        <form className="authForm" action={acceptLeagueInvite}>
          <input type="hidden" name="invite_token" value={token} />
          <label>Franchise name<input name="franchise_name" required placeholder="Atlanta Phantoms" /></label>
          <label>Abbreviation<input name="abbreviation" maxLength={5} placeholder="ATL" /></label>
          <div className="colorRow">
            <label>Primary color<input name="primary_color" type="color" defaultValue="#e9ff70" /></label>
            <label>Secondary color<input name="secondary_color" type="color" defaultValue="#0b0c0f" /></label>
          </div>
          <button className="primary" type="submit">Claim My Franchise</button>
        </form>
      </section>
    </main>
  );
}
