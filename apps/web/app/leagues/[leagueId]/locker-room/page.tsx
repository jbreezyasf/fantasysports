import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { generateAwards, postLockerMessage, toggleReaction } from '../../../social/actions';
import { LockerRoomLive } from './LockerRoomLive';
import { lockerRoomMessageLabel, lockerRoomNotification } from './lockerRoomAccessibility';
import { isConversationEvent, presentLockerEvent } from './lockerRoomPresentation';

export default async function LockerRoomPage({params,searchParams}:{params:Promise<{leagueId:string}>;searchParams:Promise<{error?:string;awards?:string;message_status?:string;reply_to?:string}>}) {
  const {leagueId}=await params; const query=await searchParams; const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
  const [{data:league},{data:member},{data:season}] = await Promise.all([
    supabase.from('fantasy_leagues').select('name').eq('id',leagueId).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle(),
    supabase.from('league_seasons').select('id').eq('league_id',leagueId).eq('is_current',true).maybeSingle()
  ]);
  if(!league||!member) notFound();
  const {data:events}=await supabase.from('league_feed_events').select('id,actor_user_id,event_type,body,payload,created_at').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(200);
  const orderedEvents=[...(events??[])].reverse();
  const eventIds=orderedEvents.map(e=>e.id); const actorIds=[...new Set((events??[]).map(e=>e.actor_user_id).filter(Boolean))] as string[];
  const payloads=orderedEvents.map(event=>(event.payload&&typeof event.payload==='object'?event.payload:{} as Record<string,unknown>)) as Record<string,unknown>[];
  const athleteIds=[...new Set(payloads.map(p=>typeof p.athlete_id==='string'?p.athlete_id:null).filter(Boolean))] as string[];
  const teamIds=[...new Set(payloads.map(p=>typeof p.real_team_id==='string'?p.real_team_id:null).filter(Boolean))] as string[];
  const seasonFranchiseIds=[...new Set(payloads.flatMap(p=>[p.season_franchise_id,p.winner_season_franchise_id]).filter((value):value is string=>typeof value==='string'))];
  const [{data:reactions},{data:profiles},{data:eventAthletes},{data:eventTeams},{data:eventFranchises}] = await Promise.all([
    eventIds.length?supabase.from('feed_reactions').select('event_id,user_id,reaction').in('event_id',eventIds):Promise.resolve({data:[]}),
    actorIds.length?supabase.from('user_profiles').select('user_id,display_name').in('user_id',actorIds):Promise.resolve({data:[]}),
    athleteIds.length?supabase.from('athletes').select('id,display_name').in('id',athleteIds):Promise.resolve({data:[]}),
    teamIds.length?supabase.from('real_teams').select('id,display_name,abbreviation').in('id',teamIds):Promise.resolve({data:[]}),
    seasonFranchiseIds.length?supabase.from('season_franchises').select('id,franchises(name)').in('id',seasonFranchiseIds):Promise.resolve({data:[]})
  ]);
  const names=new Map((profiles??[]).map(p=>[p.user_id,p.display_name]));
  const eventLookups={athletes:new Map((eventAthletes??[]).map(a=>[a.id,a.display_name])),teams:new Map((eventTeams??[]).map(t=>[t.id,t.display_name??t.abbreviation])),franchises:new Map((eventFranchises??[]).map(sf=>{const franchise=Array.isArray(sf.franchises)?sf.franchises[0]:sf.franchises;return [sf.id,(franchise as {name?:string}|null)?.name??'A franchise'];}))};
  const conversationEvents=orderedEvents.filter(isConversationEvent);
  const leagueMoments=orderedEvents.filter(event=>!isConversationEvent(event));
  const reactionSet=['🔥','😂','👀','👏','💀','🏆'];
  const reactionLabels:Record<string,string>={'🔥':'fire','😂':'laugh','👀':'eyes','👏':'clap','💀':'dead','🏆':'trophy'};
  const eventTime=(createdAt:string)=>new Date(createdAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const actorFor=(actorId:string|null)=>actorId?names.get(actorId)??'League Manager':'Big Exec';
  const latest=orderedEvents.at(-1);
  const latestAnnouncement=latest?{id:latest.id,announcement:lockerRoomNotification({sender:actorFor(latest.actor_user_id),timestamp:eventTime(latest.created_at),body:presentLockerEvent(latest,eventLookups),eventType:latest.event_type})}:null;
  const replyEvent=orderedEvents.find(event=>event.id===query.reply_to);
  const replyActor=replyEvent?actorFor(replyEvent.actor_user_id):null;
  return <main className="lockerRoomPage">
    <LockerRoomLive leagueId={leagueId} latestEvent={latestAnnouncement}/>
    <header className="lockerRoomHeader"><div><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><p className="eyebrow">LIVE LOCKER ROOM</p><h1>{league.name}</h1><p>League conversation, reactions and game-day moments—all in one room.</p></div><a className="secondary" href={`/leagues/${leagueId}/trades`}>Trade Center</a></header>
    {query.error&&<p className="errorNotice" role="alert">{query.error}</p>}{query.awards&&<p className="successNotice" role="status">Week {query.awards} awards posted.</p>}{query.message_status==='sent'&&<p className="successNotice" role="status">Locker Room message sent.</p>}
    {member.role==='commissioner'&&season&&<details className="lockerCommissioner"><summary>Commissioner tools</summary><form className="inlineForm" action={generateAwards}><input type="hidden" name="league_id" value={leagueId}/><label><span>Week</span><input name="week" type="number" min="1" max="17" defaultValue="1"/></label><button className="secondary">Post Awards</button></form></details>}
    <section className="lockerConversation" aria-label={`${league.name} conversation`}>
      <div className="lockerConversationTop"><div><span className="lockerLiveDot" aria-hidden="true"/>LIVE CONVERSATION</div><span>{events?.length??0} MOMENTS</span></div>
      <div className="lockerSectionHeading"><div><span>MANAGER CHAT</span><strong>Talk your talk</strong></div><small>{conversationEvents.length} messages</small></div>
      <div className="lockerMessages">{conversationEvents.map(event=>{const grouped=(reactions??[]).filter(r=>r.event_id===event.id);const isMessage=true;const isMine=event.actor_user_id===user.id;const actor:string=actorFor(event.actor_user_id);const timestamp=eventTime(event.created_at);const initials=actor.split(/\s+/).map((part:string)=>part[0]).join('').slice(0,2).toUpperCase();const reactionSummary=reactionSet.map(reaction=>{const count=grouped.filter(r=>r.reaction===reaction).length;return count?`${reactionLabels[reaction]} ${count}`:null;}).filter((value):value is string=>Boolean(value));return <article className={`lockerEntry ${isMessage?'lockerChatEntry':'lockerSystemEntry'} ${isMine?'isMine':''}`} aria-label={lockerRoomMessageLabel({sender:actor,timestamp,body:presentLockerEvent(event,eventLookups),eventType:event.event_type,reactions:reactionSummary})} id={`event-${event.id}`} key={event.id}>{isMessage&&<div className="lockerAvatar" aria-hidden="true">{initials}</div>}<div className="lockerEntryBody"><div className="lockerEntryMeta"><strong>{actor}</strong><time dateTime={event.created_at}>{timestamp}</time></div>{!isMessage&&<span className="lockerEventLabel">{event.event_type.replaceAll('_',' ')}</span>}<p>{presentLockerEvent(event,eventLookups)}</p><div className="lockerReactions" aria-label={`Reactions to ${actor}'s post`}>{reactionSet.map(reaction=>{const count=grouped.filter(r=>r.reaction===reaction).length;const mine=grouped.some(r=>r.reaction===reaction&&r.user_id===user.id);const label=reactionLabels[reaction]??'reaction';return <form action={toggleReaction} key={reaction}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="event_id" value={event.id}/><input type="hidden" name="reaction" value={reaction}/><button className="lockerReaction" aria-label={`${mine?'Remove':'Add'} ${label} reaction to ${actor}'s post${count?`, ${count} total`:''}`} aria-pressed={mine}>{reaction}{count?` ${count}`:''}</button></form>})}<a className="lockerReplyAction" href={`?reply_to=${event.id}#locker-message`} aria-label={`Reply to ${actor}'s post from ${timestamp}`}>Reply</a></div></div></article>})}{!conversationEvents.length&&<div className="lockerEmpty"><strong>Start the conversation.</strong><span>Pregame predictions, friendly trash talk and victory laps belong here.</span></div>}</div>
      <details className="lockerLeagueMoments"><summary><span>LEAGUE MOMENTS</span><strong>{leagueMoments.length} updates</strong></summary><div>{leagueMoments.slice(-30).reverse().map(event=><article className="lockerMoment" key={event.id}><span>{event.event_type.replaceAll('_',' ')}</span><p>{presentLockerEvent(event,eventLookups)}</p><time dateTime={event.created_at}>{eventTime(event.created_at)}</time></article>)}</div></details>
      {replyEvent&&<p className="successNotice" role="status">Replying to {replyActor}: {replyEvent.body??'League update'}</p>}
      <form className="lockerComposer" action={postLockerMessage}><input type="hidden" name="league_id" value={leagueId}/><label className="srOnly" htmlFor="locker-message">{replyEvent?`Reply to ${replyActor}`:'Message the league'}</label><textarea id="locker-message" name="body" required maxLength={1000} rows={2} placeholder={replyEvent?`Reply to ${replyActor}`:'Message the league…'}/><button className="primary" type="submit">Send</button></form>
    </section>
  </main>;
}
