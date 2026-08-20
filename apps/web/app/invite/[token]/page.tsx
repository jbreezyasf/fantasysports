import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { acceptLeagueInvite } from '../../leagues/actions';

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: inviteRows, error: inviteLookupError } = await supabase.rpc('get_public_league_invite', {
    p_invite_token: token
  });
  const invite = Array.isArray(inviteRows) ? inviteRows[0] : null;

  if (inviteLookupError) {
    return <main><section className="panel"><p className="eyebrow">INVITE STATUS</p><h1>We couldn't load this invite.</h1><p className="lede">The invitation service is temporarily unavailable. Please try the link again in a moment or ask your commissioner to resend it.</p></section></main>;
  }

  if (!invite) {
    return <main><section className="panel"><p className="eyebrow">INVITE STATUS</p><h1>This invite is unavailable.</h1><p className="lede">It may have expired, already been claimed, or been replaced by a newer invitation.</p></section></main>;
  }

  const leagueName = invite.league_name as string | undefined;

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
            <label>Primary color<input name="primary_color" type="color" defaultValue="#D4AF37" /></label>
            <label>Secondary color<input name="secondary_color" type="color" defaultValue="#0B0C0F" /></label>
          </div>
          <button className="primary" type="submit">Claim My Franchise</button>
        </form>
      </section>
    </main>
  );
}
