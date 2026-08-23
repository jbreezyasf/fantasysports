import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { proposeTrade } from '../../../social/actions';

type Athlete={display_name?:string;position?:string}; type Team={abbreviation?:string;display_name?:string}; type Franchise={name?:string;abbreviation?:string};
function first<T>(v:T|T[]|null|undefined):T|null{return !v?null:Array.isArray(v)?v[0]??null:v;}

export default async function TradesPage({params,searchParams}:{params:Promise<{leagueId:string}>;searchParams:Promise<{error?:string}>}){
 const {leagueId}=await params; const query=await searchParams; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
 const [{data:league},{data:member},{data:season}]=await Promise.all([
  supabase.from('fantasy_leagues').select('name').eq('id',leagueId).maybeSingle(),
  supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle(),
  supabase.from('league_seasons').select('id,trade_deadline_at').eq('league_id',leagueId).maybeSingle()
 ]); if(!league||!member||!season) notFound();
 const deadline=season.trade_deadline_at?new Date(season.trade_deadline_at):null;
 const tradeClosed=!!deadline&&Date.now()>=deadline.getTime();
 const deadlineLabel=deadline?deadline.toLocaleString('en-US',{timeZone:'America/Chicago',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):null;
 const {data:sfs}=await supabase.from('season_franchises').select('id,franchise_id,franchises(name,abbreviation)').eq('league_season_id',season.id);
 const {data:owns}=await supabase.from('franchise_owners').select('franchise_id').eq('user_id',user.id).is('ends_on',null);
 const ownFranchiseIds=new Set((owns??[]).map(o=>o.franchise_id)); const mine=(sfs??[]).find(sf=>ownFranchiseIds.has(sf.franchise_id)); if(!mine) notFound();
 const sfIds=(sfs??[]).map(sf=>sf.id); const {data:rosters}=sfIds.length?await supabase.from('roster_entries').select('season_franchise_id,athlete_id,real_team_id,athletes(display_name,position),real_teams(display_name,abbreviation)').in('season_franchise_id',sfIds).is('dropped_at',null):{data:[]};
 const {data:trades}=await supabase.from('trades').select('id,status,created_at,proposed_by_franchise_id,proposed_to_franchise_id').eq('league_season_id',season.id).order('created_at',{ascending:false});
 const franchiseMap=new Map((sfs??[]).map(sf=>[sf.id,first(sf.franchises as Franchise|Franchise[]|null)]));
 const assetLabel=(r:NonNullable<typeof rosters>[number])=>{if(r.athlete_id){const a=first(r.athletes as Athlete|Athlete[]|null);return `${a?.display_name??'Athlete'} • ${a?.position??''}`;}const t=first(r.real_teams as Team|Team[]|null);return `${t?.abbreviation??t?.display_name??'Team'} D/ST`;};
 const mineRoster=(rosters??[]).filter(r=>r.season_franchise_id===mine.id);
 return <main><section className="panel"><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><p className="eyebrow">TRADE CENTER / {league.name}</p><h1>Make the call.</h1><p className="lede">Trade proposals and negotiation are private to the two managers. Accepted deals become public league news.</p>{query.error&&<p className="errorNotice" role="alert">{query.error}</p>}<div className="actions"><a className="secondary" href={`/leagues/${leagueId}/locker-room`}>Locker Room</a></div></section>
 <section className="panel"><p className="eyebrow">TRADE WINDOW</p><h2>{tradeClosed?'Trades are closed.':'Trade window open.'}</h2><p className="lede">{deadlineLabel?`League trade deadline: ${deadlineLabel}.`:'No trade deadline is currently set for this season.'}</p>{tradeClosed&&<p className="successNotice">No new trades can be proposed or accepted after the deadline. Player acquisition remains available through the Players area.</p>}</section>
 {!tradeClosed&&<section className="panel"><p className="eyebrow">PROPOSE A TRADE</p><div className="weekStack">{(sfs??[]).filter(sf=>sf.id!==mine.id).map(sf=>{const opponent=franchiseMap.get(sf.id);const theirRoster=(rosters??[]).filter(r=>r.season_franchise_id===sf.id);return <article className="weekCard" key={sf.id}><div className="weekHeader"><div><span>TRADE WITH</span><strong>{opponent?.name??'Franchise'}</strong></div></div><form className="authForm" action={proposeTrade}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="league_season_id" value={season.id}/><input type="hidden" name="to_season_franchise_id" value={sf.id}/><label>You send<select name="offer_asset" required><option value="">Choose one asset</option>{mineRoster.map(r=><option key={`${r.athlete_id??r.real_team_id}`} value={`${r.athlete_id?'athlete':'team'}:${r.athlete_id??r.real_team_id}`}>{assetLabel(r)}</option>)}</select></label><label>You receive<select name="request_asset" required><option value="">Choose one asset</option>{theirRoster.map(r=><option key={`${r.athlete_id??r.real_team_id}`} value={`${r.athlete_id?'athlete':'team'}:${r.athlete_id??r.real_team_id}`}>{assetLabel(r)}</option>)}</select></label><button className="primary">Open Trade Room</button></form></article>})}</div></section>}
 <section className="panel"><p className="eyebrow">YOUR TRADE ROOMS</p><div className="weekStack">{(trades??[]).map(t=>{const from=franchiseMap.get(t.proposed_by_franchise_id);const to=franchiseMap.get(t.proposed_to_franchise_id);return <a className="weekCard" href={`/trades/${t.id}`} key={t.id}><div className="weekHeader"><div><span>{t.status.toUpperCase()}</span><strong>{from?.abbreviation??from?.name} ↔ {to?.abbreviation??to?.name}</strong></div><small>{new Date(t.created_at).toLocaleDateString()}</small></div><p className="lede">Private Trade Room →</p></a>})}{!trades?.length&&<p className="lede">No trade rooms yet.</p>}</div></section></main>;
}
