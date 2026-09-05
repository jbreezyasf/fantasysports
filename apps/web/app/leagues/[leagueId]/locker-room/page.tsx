import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { generateAwards, postLockerMessage, toggleReaction } from '../../../social/actions';
import { LockerRoomLive } from './LockerRoomLive';
import { lockerRoomMessageLabel, lockerRoomNotification } from './lockerRoomAccessibility';

export default async function LockerRoomPage({params,searchParams}:{params:Promise<{leagueId:string}>;searchParams:Promise<{error?:string;awards?:string;message_status?:string;reply_to?:string}>}) {
  const {leagueId}=await params; const query=await searchParams; const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
  const [{data:league},{data:member},{data:season}] = await Promise.all([
    supabase.from('fantasy_leagues').select('name').eq('id',leagueId).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle(),
    supabase.from('league_seasons').select('id').eq('league_id',leagueId).eq('is_current',true).maybeSingle()
  ]);
  if(!league||!member) notFound();
  const {data:events}=await supabase.from('league_feed_events').select('id,actor_user_id,event_type,body,payload,created_at').eq('league_id',leagueId).order('created_at',{ascending:true}).limit(100);
  const eventIds=(events??[]).map(e=>e.id); const actorIds=[...new Set((events??[]).map(e=>e.actor_user_id).filter(Boolean))] as string[];
  const [{data:reactions},{data:profiles}] = await Promise.all([
    eventIds.length?supabase.from('feed_reactions').select('event_id,user_id,reaction').in('event_id',eventIds):Promise.resolve({data:[]}),
    actorIds.length?supabase.from('user_profiles').select('user_id,display_name').in('user_id',actorIds):Promise.resolve({data:[]})
  ]);
  const names=new Map((profiles??[]).map(p=>[p.user_id,p.display_name]));
  const reactionSet=['🔥','😂','👀','👏','💀','🏆'];
  const reactionLabels:Record<string,string>={'🔥':'fire','😂':'laugh','👀':'eyes','👏':'clap','💀':'dead','🏆':'trophy'};
  const eventTime=(createdAt:string)=>new Date(createdAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const actorFor=(actorId:string|null)=>actorId?names.get(actorId)??'League Manager':'Big Exec';
  const latest=events?.at(-1);
  const latestAnnouncement=latest?{id:latest.id,announcement:lockerRoomNotification({sender:actorFor(latest.actor_user_id),timestamp:eventTime(latest.created_at),body:latest.body??'League update',eventType:latest.event_type})}:null;
  const replyEvent=(events??[]).find(event=>event.id===query.reply_to);
  const replyActor=replyEvent?actorFor(replyEvent.actor_user_id):null;
  return <main className="lockerRoomPage">
    <LockerRoomLive leagueId={leagueId} latestEvent={latestAnnouncement}/>
    <header className="lockerRoomHeader"><div><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><p className="eyebrow">LIVE LOCKER ROOM</p><h1>{league.name}</h1><p>League conversation, reactions and game-day moments—all in one room.</p></div><a className="secondary" href={`/leagues/${leagueId}/trades`}>Trade Center</a></header>
    {query.error&&<p className="errorNotice" role="alert">{query.error}</p>}{query.awards&&<p className="successNotice" role="status">Week {query.awards} awards posted.</p>}{query.message_status==='sent'&&<p className="successNotice" role="status">Locker Room message sent.</p>}
    {member.role==='commissioner'&&season&&<details className="lockerCommissioner"><summary>Commissioner tools</summary><form className="inlineForm" action={generateAwards}><input type="hidden" name="league_id" value={leagueId}/><label><span>Week</span><input name="week" type="number" min="1" max="17" defaultValue="1"/></label><button className="secondary">Post Awards</button></form></details>}
    <section className="lockerConversation" aria-label={`${league.name} conversation`}>
      <div className="lockerConversationTop"><div><span className="lockerLiveDot" aria-hidden="true"/>LIVE CONVERSATION</div><span>{events?.length??0} MOMENTS</span></div>
      <div className="lockerMessages">{(events??[]).map(event=>{const grouped=(reactions??[]).filter(r=>r.event_id===event.id);const isMessage=event.event_type==='locker_room_message';const isMine=event.actor_user_id===user.id;const actor:string=actorFor(event.actor_user_id);const timestamp=eventTime(event.created_at);const initials=actor.split(/\s+/).map((part:string)=>part[0]).join('').slice(0,2).toUpperCase();const reactionSummary=reactionSet.map(reaction=>{const count=grouped.filter(r=>r.reaction===reaction).length;return count?`${reactionLabels[reaction]} ${count}`:null;}).filter((value):value is string=>Boolean(value));return <article className={`lockerEntry ${isMessage?'lockerChatEntry':'lockerSystemEntry'} ${isMine?'isMine':''}`} aria-label={lockerRoomMessageLabel({sender:actor,timestamp,body:event.body??'League update',eventType:event.event_type,reactions:reactionSummary})} id={`event-${event.id}`} key={event.id}>{isMessage&&<div className="lockerAvatar" aria-hidden="true">{initials}</div>}<div className="lockerEntryBody"><div className="lockerEntryMeta"><strong>{actor}</strong><time dateTime={event.created_at}>{timestamp}</time></div>{!isMessage&&<span className="lockerEventLabel">{event.event_type.replaceAll('_',' ')}</span>}<p>{event.body??'League update'}</p><div className="lockerReactions" aria-label={`Reactions to ${actor}'s post`}>{reactionSet.map(reaction=>{const count=grouped.filter(r=>r.reaction===reaction).length;const mine=grouped.some(r=>r.reaction===reaction&&r.user_id===user.id);const label=reactionLabels[reaction]??'reaction';return <form action={toggleReaction} key={reaction}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="event_id" value={event.id}/><input type="hidden" name="reaction" value={reaction}/><button className="lockerReaction" aria-label={`${mine?'Remove':'Add'} ${label} reaction to ${actor}'s post${count?`, ${count} total`:''}`} aria-pressed={mine}>{reaction}{count?` ${count}`:''}</button></form>})}<a className="lockerReplyAction" href={`?reply_to=${event.id}#locker-message`} aria-label={`Reply to ${actor}'s post from ${timestamp}`}>Reply</a></div></div></article>})}{!events?.length&&<div className="lockerEmpty"><strong>Start the conversation.</strong><span>Pregame predictions, reactions and victory laps belong here.</span></div>}</div>
      {replyEvent&&<p className="successNotice" role="status">Replying to {replyActor}: {replyEvent.body??'League update'}</p>}
      <form className="lockerComposer" action={postLockerMessage}><input type="hidden" name="league_id" value={leagueId}/><label className="srOnly" htmlFor="locker-message">{replyEvent?`Reply to ${replyActor}`:'Message the league'}</label><textarea id="locker-message" name="body" required maxLength={1000} rows={2} placeholder={replyEvent?`Reply to ${replyActor}`:'Message the league…'}/><button className="primary" type="submit">Send</button></form>
    </section>
  </main>;
}
