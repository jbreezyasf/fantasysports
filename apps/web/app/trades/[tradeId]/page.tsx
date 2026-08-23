import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { postTradeRoomMessage, resolveTradeAction } from '../../social/actions';

type Franchise={name?:string;abbreviation?:string}; type Athlete={display_name?:string;position?:string}; type Team={display_name?:string;abbreviation?:string};
function first<T>(v:T|T[]|null|undefined):T|null{return !v?null:Array.isArray(v)?v[0]??null:v;}

export default async function TradeRoomPage({params,searchParams}:{params:Promise<{tradeId:string}>;searchParams:Promise<{error?:string;resolved?:string}>}){
 const {tradeId}=await params; const query=await searchParams; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
 const {data:trade}=await supabase.from('trades').select('id,league_season_id,status,created_at,proposed_by_franchise_id,proposed_to_franchise_id').eq('id',tradeId).maybeSingle(); if(!trade) notFound();
 const {data:season}=await supabase.from('league_seasons').select('league_id,trade_deadline_at').eq('id',trade.league_season_id).maybeSingle(); if(!season) notFound();
 const deadline=season.trade_deadline_at?new Date(season.trade_deadline_at):null;
 const tradeClosed=!!deadline&&Date.now()>=deadline.getTime();
 const deadlineLabel=deadline?deadline.toLocaleString('en-US',{timeZone:'America/Chicago',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):null;
 const [{data:sfs},{data:items},{data:messages},{data:owns},{data:profiles}]=await Promise.all([
  supabase.from('season_franchises').select('id,franchise_id,franchises(name,abbreviation)').in('id',[trade.proposed_by_franchise_id,trade.proposed_to_franchise_id]),
  supabase.from('trade_items').select('id,from_season_franchise_id,to_season_franchise_id,athlete_id,real_team_id,athletes(display_name,position),real_teams(display_name,abbreviation)').eq('trade_id',tradeId),
  supabase.from('trade_messages').select('id,user_id,body,created_at').eq('trade_id',tradeId).order('created_at'),
  supabase.from('franchise_owners').select('franchise_id,user_id').eq('user_id',user.id).is('ends_on',null),
  supabase.from('user_profiles').select('user_id,display_name')
 ]);
 const sfMap=new Map((sfs??[]).map(sf=>[sf.id,{franchise_id:sf.franchise_id,...(first(sf.franchises as Franchise|Franchise[]|null)??{})}]));
 const from=sfMap.get(trade.proposed_by_franchise_id); const to=sfMap.get(trade.proposed_to_franchise_id); const ownedIds=new Set((owns??[]).map(o=>o.franchise_id)); const isProposer=!!from&&ownedIds.has(from.franchise_id); const isRecipient=!!to&&ownedIds.has(to.franchise_id);
 const names=new Map((profiles??[]).map(p=>[p.user_id,p.display_name]));
 const assetLabel=(item:NonNullable<typeof items>[number])=>{if(item.athlete_id){const a=first(item.athletes as Athlete|Athlete[]|null);return `${a?.display_name??'Athlete'} • ${a?.position??''}`;}const t=first(item.real_teams as Team|Team[]|null);return `${t?.abbreviation??t?.display_name??'Team'} D/ST`;};
 return <main><section className="panel"><a className="backLink" href={`/leagues/${season.league_id}/trades`}>← TRADE CENTER</a><p className="eyebrow">PRIVATE TRADE ROOM</p><h1>{from?.name??'Franchise'} ↔ {to?.name??'Franchise'}</h1><p className="lede">Only the two managers in this deal can see this room. If accepted, the result—not this conversation—posts to the Locker Room.</p>{query.error&&<p className="errorNotice" role="alert">{query.error}</p>}{query.resolved&&<p className="successNotice">Trade {query.resolved}.</p>}<div className="leagueMetaRow"><span>{trade.status.toUpperCase()}</span><span>{new Date(trade.created_at).toLocaleString()}</span>{deadlineLabel&&<span>DEADLINE • {deadlineLabel}</span>}</div>{trade.status==='proposed'&&tradeClosed&&<p className="errorNotice" role="status">The trade deadline has passed. This offer can no longer be accepted.</p>}</section>
 <section className="panel"><p className="eyebrow">DEAL SHEET</p><div className="playerList">{(items??[]).map(item=><div className="playerRow" key={item.id}><div><span>{sfMap.get(item.from_season_franchise_id)?.abbreviation??'FROM'} → {sfMap.get(item.to_season_franchise_id)?.abbreviation??'TO'}</span><strong>{assetLabel(item)}</strong></div></div>)}</div></section>
 <section className="panel"><p className="eyebrow">NEGOTIATION</p><div className="weekStack">{(messages??[]).map(m=><article className="weekCard" key={m.id}><div className="weekHeader"><strong>{names.get(m.user_id)??'Manager'}</strong><small>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></div><p className="lede">{m.body}</p></article>)}{!messages?.length&&<p className="lede">No messages yet.</p>}</div>{trade.status==='proposed'&&!tradeClosed&&<form className="authForm" action={postTradeRoomMessage}><input type="hidden" name="trade_id" value={tradeId}/><label>Private message<textarea name="body" required maxLength={1000} rows={3} placeholder="Make the case, counter, or close the deal."/></label><button className="secondary">Send Private Message</button></form>}</section>
 {trade.status==='proposed'&&<section className="panel"><p className="eyebrow">DECISION</p><div className="actions">{isRecipient&&<>{!tradeClosed&&<form action={resolveTradeAction}><input type="hidden" name="trade_id" value={tradeId}/><input type="hidden" name="trade_action" value="accept"/><button className="primary">Accept Trade</button></form>}<form action={resolveTradeAction}><input type="hidden" name="trade_id" value={tradeId}/><input type="hidden" name="trade_action" value="reject"/><button className="secondary">Reject</button></form></>}{isProposer&&<form action={resolveTradeAction}><input type="hidden" name="trade_id" value={tradeId}/><input type="hidden" name="trade_action" value="cancel"/><button className="secondary">Cancel Offer</button></form>}</div></section>}
 </main>;
}
