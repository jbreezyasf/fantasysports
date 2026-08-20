import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { generateAwards, postLockerMessage, toggleReaction } from '../../../social/actions';

export default async function LockerRoomPage({params,searchParams}:{params:Promise<{leagueId:string}>;searchParams:Promise<{error?:string;awards?:string}>}) {
  const {leagueId}=await params; const query=await searchParams; const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
  const [{data:league},{data:member},{data:season}] = await Promise.all([
    supabase.from('fantasy_leagues').select('name').eq('id',leagueId).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle(),
    supabase.from('league_seasons').select('id').eq('league_id',leagueId).maybeSingle()
  ]);
  if(!league||!member) notFound();
  const {data:events}=await supabase.from('league_feed_events').select('id,actor_user_id,event_type,body,payload,created_at').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(100);
  const eventIds=(events??[]).map(e=>e.id); const actorIds=[...new Set((events??[]).map(e=>e.actor_user_id).filter(Boolean))] as string[];
  const [{data:reactions},{data:profiles}] = await Promise.all([
    eventIds.length?supabase.from('feed_reactions').select('event_id,user_id,reaction').in('event_id',eventIds):Promise.resolve({data:[]}),
    actorIds.length?supabase.from('user_profiles').select('user_id,display_name').in('user_id',actorIds):Promise.resolve({data:[]})
  ]);
  const names=new Map((profiles??[]).map(p=>[p.user_id,p.display_name]));
  const reactionSet=['🔥','😂','👀','👏','💀','🏆'];
  return <main>
    <section className="panel"><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><p className="eyebrow">LOCKER ROOM / {league.name}</p><h1>Everybody can hear it.</h1><p className="lede">League chatter is public to league members. Trade negotiations stay inside private Trade Rooms.</p>{query.error&&<p className="errorNotice" role="alert">{query.error}</p>}{query.awards&&<p className="successNotice">Week {query.awards} awards posted to the Locker Room.</p>}<div className="actions"><a className="secondary" href={`/leagues/${leagueId}/trades`}>Trade Center</a></div></section>
    <section className="panel"><p className="eyebrow">SAY SOMETHING</p><form className="authForm" action={postLockerMessage}><input type="hidden" name="league_id" value={leagueId}/><label>Locker Room message<textarea name="body" required maxLength={1000} rows={4} placeholder="Talk your talk. Keep it fun."/></label><button className="primary" type="submit">Post to League</button></form></section>
    {member.role==='commissioner'&&season&&<section className="panel"><p className="eyebrow">COMMISSIONER</p><h2>Weekly awards.</h2><form className="inlineForm" action={generateAwards}><input type="hidden" name="league_id" value={leagueId}/><input name="week" type="number" min="1" max="17" defaultValue="1"/><button className="secondary">Post Awards</button></form></section>}
    <section className="panel"><p className="eyebrow">LEAGUE FEED</p><div className="weekStack">{(events??[]).map(event=>{const grouped=(reactions??[]).filter(r=>r.event_id===event.id);return <article className="weekCard" id={`event-${event.id}`} key={event.id}><div className="weekHeader"><div><span>{event.event_type.replaceAll('_',' ').toUpperCase()}</span><strong>{event.actor_user_id?names.get(event.actor_user_id)??'League Manager':'BIG EXEC'}</strong></div><small>{new Date(event.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></div><p className="lede">{event.body??'League update'}</p>{event.event_type==='trade_accepted'&&<p><strong>Trade complete.</strong> The negotiation stayed private; the result is league news.</p>}{event.event_type==='weekly_awards'&&<p><strong>Awards posted.</strong> Highest Score, Biggest Blowout and Closest Win are now part of league history.</p>}<div className="actions">{reactionSet.map(reaction=>{const count=grouped.filter(r=>r.reaction===reaction).length;const mine=grouped.some(r=>r.reaction===reaction&&r.user_id===user.id);return <form action={toggleReaction} key={reaction}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="event_id" value={event.id}/><input type="hidden" name="reaction" value={reaction}/><button className="miniAction" aria-pressed={mine}>{reaction}{count?` ${count}`:''}</button></form>})}</div></article>})}{!events?.length&&<p className="lede">The room is quiet. Be the first to say something.</p>}</div></section>
  </main>;
}
