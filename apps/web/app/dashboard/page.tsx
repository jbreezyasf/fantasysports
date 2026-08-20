import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { signOut } from '../auth/actions';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: leagues } = await supabase.from('fantasy_leagues').select('id,name,created_at').order('created_at', { ascending: false });

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">FRONT OFFICE</p>
        <h1>Your leagues.</h1>
        <p className="lede">Signed in as {user.email}</p>
        <div className="actions"><a className="primary" href="/leagues/new">Create league</a><form><button className="secondary" formAction={signOut}>Sign out</button></form></div>
      </section>
      <section className="panel">
        <div className="sportGrid">
          {(leagues ?? []).map((league) => <a className="sportCard" key={league.id} href={`/leagues/${league.id}`}><span>PRO FOOTBALL</span><strong>{league.name}</strong></a>)}
          {!leagues?.length && <article className="sportCard"><span>NO LEAGUES YET</span><strong>Create your first franchise league.</strong></article>}
        </div>
      </section>
    </main>
  );
}
