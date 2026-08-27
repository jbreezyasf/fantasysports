import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createSportradarDraftLab, syncSportradarDraftPool } from './actions';
import { syncSportradarHistoricalSchedules } from './history-actions';

export const maxDuration=60;
export default async function DataAdminPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const query=await searchParams; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
  const {count}=await supabase.from('league_members').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('role','commissioner'); if(!count) redirect('/dashboard');
  const [{count:radarPlayers},{data:season},{count:historyGames}]=await Promise.all([
    supabase.from('athlete_provider_ids').select('*',{count:'exact',head:true}).eq('provider','sportradar'),
    supabase.from('competition_seasons').select('season_year').eq('season_year',2026).maybeSingle(),
    supabase.from('real_games').select('id',{count:'exact',head:true}).gte('week',1).lte('week',18)
  ]);
  return <main><section className="panel"><p className="eyebrow">COMMISSIONER • DATA LAB</p><h1>NFL provider lab.</h1><p className="lede">Sportradar is normalized into canonical Big Exec records. Current rosters and historical schedules are separate, repeatable sync jobs.</p>
    {query.error&&<p className="errorNotice" role="alert">{query.error}</p>}
    {query.synced&&<p className="successNotice">2026 roster sync complete: {query.inserted} inserted, {query.updated} updated, {query.eligible} draft eligible across {query.requests} API requests.</p>}
    {query.history_synced&&<p className="successNotice">Historical schedule sync complete: {query.history_games} NFL regular-season games across {query.history_years} seasons.</p>}
    <div className="leagueQuickGrid"><article className="leagueStatCard"><span>SPORTRADAR PLAYERS</span><strong>{radarPlayers??0}</strong><p>Provider IDs remain linked to canonical Big Exec athlete IDs.</p></article><article className="leagueStatCard"><span>CURRENT TEST SEASON</span><strong>{season?.season_year??'NOT SYNCED'}</strong><p>2026 live/draft source layer.</p></article><article className="leagueStatCard"><span>REAL GAME RECORDS</span><strong>{historyGames??0}</strong><p>Normalized schedule/game rows currently stored.</p></article></div>
    <div className="actions"><form action={syncSportradarDraftPool}><button className="primary">Sync 2026 NFL rosters</button></form><form action={syncSportradarHistoricalSchedules}><button className="primary">Sync 2021–2025 NFL history</button></form>{season&&<form action={createSportradarDraftLab}><button className="secondary">Create 2026 test draft</button></form>}<a className="secondary" href="/dashboard">Return Home</a></div>
  </section></main>;
}
