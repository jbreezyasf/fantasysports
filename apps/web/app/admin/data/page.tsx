import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createSportradarDraftLab, syncSportradarDraftPool } from './actions';

export const maxDuration = 60;

export default async function DataAdminPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const {count} = await supabase.from('league_members').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('role','commissioner');
  if (!count) redirect('/dashboard');
  const [{count:radarPlayers},{data:season}] = await Promise.all([
    supabase.from('athlete_provider_ids').select('*',{count:'exact',head:true}).eq('provider','sportradar'),
    supabase.from('competition_seasons').select('season_year').eq('season_year',2026).maybeSingle(),
  ]);
  return <main><section className="panel"><p className="eyebrow">COMMISSIONER • DATA LAB</p><h1>Current NFL test pool.</h1><p className="lede">Sportradar is normalized into Big Exec records. The scoring engine and whole-team D/ST rules remain unchanged.</p>
    {query.error&&<p className="errorNotice" role="alert">{query.error}</p>}
    {query.synced&&<p className="successNotice" role="status">Sportradar sync complete: {query.inserted} inserted, {query.updated} updated, {query.eligible} draft eligible across {query.requests} API requests.</p>}
    <div className="leagueQuickGrid"><article className="leagueStatCard"><span>SPORTRADAR PLAYERS</span><strong>{radarPlayers??0}</strong><p>Provider IDs linked without replacing canonical Big Exec IDs.</p></article><article className="leagueStatCard"><span>TEST SEASON</span><strong>{season?.season_year??'NOT SYNCED'}</strong><p>Separate from the validated 2025 Gate 1 reference season.</p></article></div>
    <div className="actions"><form action={syncSportradarDraftPool}><button className="primary" type="submit">Sync 2026 NFL rosters</button></form>{season&&<form action={createSportradarDraftLab}><button className="secondary" type="submit">Create 2026 test draft</button></form>}<a className="secondary" href="/dashboard">Return Home</a></div>
  </section></main>;
}
