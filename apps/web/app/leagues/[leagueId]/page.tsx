import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';

export default async function LeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: league } = await supabase.from('fantasy_leagues').select('id,name,created_at').eq('id', leagueId).maybeSingle();
  if (!league) notFound();
  const { data: franchises } = await supabase.from('franchises').select('id,name,abbreviation,primary_color,secondary_color,established_year').eq('league_id', leagueId).order('created_at');

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">LEAGUE FRONT OFFICE</p>
        <h1>{league.name}</h1>
        <p className="lede">Pro Football • Half-PPR • Persistent franchises</p>
      </section>
      <section className="panel">
        <p className="eyebrow">FRANCHISES</p>
        <div className="sportGrid">{(franchises ?? []).map((franchise) => <article className="sportCard" key={franchise.id}><span>EST. {franchise.established_year}</span><strong>{franchise.name}</strong><p className="lede">{franchise.abbreviation ?? 'FRANCHISE'}</p></article>)}</div>
      </section>
    </main>
  );
}
