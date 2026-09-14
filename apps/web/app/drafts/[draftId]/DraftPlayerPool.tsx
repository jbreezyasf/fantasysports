'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { addDraftQueueItem, makeDraftPick, moveDraftQueueItem, removeDraftQueueItem } from '../actions';
import { draftCandidateLabel } from './draftAccessibility';

type RankedAsset={overallRank:number;positionRank:number;rankingScore:number|null;rankingSource:string;rankingVersion:string};
type Athlete={id:string;displayName:string;position:string;team:string}&RankedAsset;
type Defense={id:string;displayName:string;team:string}&RankedAsset;
type QueuedAsset=(Athlete|Defense)&{position:string;queueItemId:string;queueRank:number;assetType:'athlete'|'defense'};
type DraftedAsset={id:string;pickNumber:number;label:string};
type Position='ALL'|'QB'|'RB'|'WR'|'TE'|'K'|'D/ST';
const positions:Position[]=['ALL','QB','RB','WR','TE','K','D/ST'];
const rosterGuide=[['QB','1 starter'],['RB','2 starters'],['WR','2 starters'],['TE','1 starter'],['FLEX','RB / WR / TE'],['K','1 starter'],['D/ST','1 starter']];

function formatRankingVersion(value:string){
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?value:parsed.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}
function formatScore(value:number|null){return value===null?'NO CURRENT PROJECTION':`${value.toFixed(1)} RANKING SCORE`;}

export function DraftPlayerPool({draftId,status,canDraft,athletes,defenses,queuedAssets,draftedAssets,rankingSource,rankingVersion}:{draftId:string;status:string;canDraft:boolean;athletes:Athlete[];defenses:Defense[];queuedAssets:QueuedAsset[];draftedAssets:DraftedAsset[];rankingSource:string;rankingVersion:string}){
  const [position,setPosition]=useState<Position>('ALL');
  const [search,setSearch]=useState('');
  const [preferencesRestored,setPreferencesRestored]=useState(false);
  const storagePrefix=`big-exec:draft:${draftId}`;

  useEffect(()=>{
    const savedPosition=window.sessionStorage.getItem(`${storagePrefix}:position`);
    const savedSearch=window.sessionStorage.getItem(`${storagePrefix}:search`);
    if(savedPosition&&positions.includes(savedPosition as Position))setPosition(savedPosition as Position);
    if(savedSearch)setSearch(savedSearch);
    setPreferencesRestored(true);
    const savedScroll=window.sessionStorage.getItem(`${storagePrefix}:scrollY`);
    if(savedScroll){window.sessionStorage.removeItem(`${storagePrefix}:scrollY`);window.requestAnimationFrame(()=>window.scrollTo({top:Number(savedScroll),behavior:'instant'}));}
  },[storagePrefix]);
  useEffect(()=>{if(preferencesRestored){window.sessionStorage.setItem(`${storagePrefix}:position`,position);window.sessionStorage.setItem(`${storagePrefix}:search`,search);}},[position,preferencesRestored,search,storagePrefix]);

  const rememberViewport=()=>window.sessionStorage.setItem(`${storagePrefix}:scrollY`,String(window.scrollY));
  const choosePosition=(value:Position)=>{window.sessionStorage.setItem(`${storagePrefix}:position`,value);setPosition(value);};
  const deferredSearch=useDeferredValue(search.trim().toLowerCase());
  const queuedAthleteIds=new Set(queuedAssets.filter(asset=>asset.assetType==='athlete').map(asset=>asset.id));
  const queuedDefenseIds=new Set(queuedAssets.filter(asset=>asset.assetType==='defense').map(asset=>asset.id));
  const athleteMatches=athletes.filter(player=>(position==='ALL'||player.position===position)&&(!deferredSearch||`${player.displayName} ${player.team}`.toLowerCase().includes(deferredSearch)));
  const defenseMatches=(position==='ALL'||position==='D/ST')?defenses.filter(team=>!deferredSearch||`${team.displayName} ${team.team} defense`.toLowerCase().includes(deferredSearch)):[];
  const resultCount=athleteMatches.length+defenseMatches.length;
  const countFor=(value:Position)=>value==='D/ST'?defenses.length:value==='ALL'?athletes.length+defenses.length:athletes.filter(player=>player.position===value).length;
  const candidateDetails=(details:{position:string;team:string;rank:number;score:string})=><dl className="playerDetailsList staticDetails"><div><dt>Position</dt><dd>{details.position}</dd></div><div><dt>NFL team</dt><dd>{details.team}</dd></div><div><dt>Overall rank</dt><dd>{details.rank}</dd></div><div><dt>Draft value</dt><dd>{details.score}</dd></div></dl>;

  return <section className="draftWorkspace" aria-label="Draft decision workspace">
    <nav className="draftMobileNav" aria-label="Draft room sections"><a href="#available-players">Players</a><a href="#my-queue">Queue</a><a href="#my-draft-roster">My Team</a><a href="#draft-board">Board</a></nav>
    <section className="panel draftPlayerFinder" id="available-players" aria-labelledby="draft-player-heading">
      <div className="draftFinderHeading"><div><p className="eyebrow">AVAILABLE PLAYERS</p><h2 id="draft-player-heading">Make the next pick.</h2><p className="lede">Ranked by {rankingSource} • Updated {formatRankingVersion(rankingVersion)}</p></div><span className="sectionCounter" aria-live="polite">{resultCount} AVAILABLE</span></div>
      <div className="draftFinderControls">
        <label className="draftSearch"><span className="srOnly">Search available players</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search player or NFL team" autoComplete="off"/><b aria-hidden="true">⌕</b></label>
        <div className="draftPositionRail" role="group" aria-label="Filter available players by position">{positions.map(value=><button key={value} type="button" className={position===value?'isActive':''} aria-pressed={position===value} onClick={()=>choosePosition(value)}><span>{value}</span><small>{countFor(value)}</small></button>)}</div>
      </div>
      <div className="draftResultHeader"><strong>{position==='ALL'?'ALL PLAYERS':position}</strong><span>{deferredSearch?`MATCHING “${search.trim()}”`:'BEST AVAILABLE'}</span></div>
      <p className="srOnly" role="status">{resultCount} available draft result{resultCount===1?'':'s'} for {position}. Sorted by overall draft rank.</p>
      <div className="draftPlayerResults">
        {athleteMatches.map(player=>{const score=formatScore(player.rankingScore);const assetLabel=`${player.displayName} • ${player.position} • ${player.team||'FA'}`;return <article className="draftCandidate" aria-label={draftCandidateLabel({name:player.displayName,position:player.position,team:player.team||'FA',rank:player.overallRank,score,action:canDraft?'Review draft pick':status==='live'?'Available when you are on the clock':'Draft unavailable until live'})} key={player.id}><span className="draftPositionBadge">#{player.overallRank}</span><div><strong>{player.displayName}</strong><small>{player.position} {player.positionRank} • {player.team||'FA'} • {score}</small></div><form action={addDraftQueueItem} onSubmit={rememberViewport}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="athlete_id" value={player.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftQueueButton" type="submit" disabled={queuedAthleteIds.has(player.id)}>{queuedAthleteIds.has(player.id)?'Queued':'Queue'}</button></form><details className="draftPickReview"><summary aria-label={`Review draft pick for ${player.displayName}`}>Draft</summary>{candidateDetails({position:player.position,team:player.team||'FA',rank:player.overallRank,score})}<form action={makeDraftPick}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="athlete_id" value={player.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftPickButton" type="submit" disabled={!canDraft}>Confirm Draft Pick</button></form></details></article>;})}
        {defenseMatches.map(team=>{const score=formatScore(team.rankingScore);const name=`${team.team||team.displayName} D/ST`;const assetLabel=`${name} • D/ST`;return <article className="draftCandidate" key={team.id}><span className="draftPositionBadge">#{team.overallRank}</span><div><strong>{name}</strong><small>D/ST {team.positionRank} • DEFENSE • {score}</small></div><form action={addDraftQueueItem} onSubmit={rememberViewport}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="real_team_id" value={team.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftQueueButton" type="submit" disabled={queuedDefenseIds.has(team.id)}>{queuedDefenseIds.has(team.id)?'Queued':'Queue'}</button></form><details className="draftPickReview"><summary>Draft</summary>{candidateDetails({position:'D/ST',team:team.team||team.displayName,rank:team.overallRank,score})}<form action={makeDraftPick}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="real_team_id" value={team.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftPickButton" type="submit" disabled={!canDraft}>Confirm Draft Pick</button></form></details></article>;})}
        {!resultCount&&<div className="draftEmpty" role="status"><strong>No available players match.</strong><p>Try another name or choose a different position.</p><button type="button" onClick={()=>{setSearch('');setPosition('ALL')}}>Clear filters</button></div>}
      </div>
    </section>
    <aside className="draftSideRail">
      <section className="draftQueuePanel" id="my-queue" aria-labelledby="draft-queue-heading">
        <div className="draftResultHeader"><strong id="draft-queue-heading">MY QUEUE</strong><span>{queuedAssets.length} SAVED</span></div>
        <div className="draftQueueList">{queuedAssets.map((asset,index)=>{const assetLabel=`${asset.displayName} • ${asset.position} • ${asset.team||'FA'}`;return <article className="draftQueueItem" key={asset.queueItemId}><span>{index+1}</span><div><strong>{asset.displayName}</strong><small>{asset.position} {asset.positionRank} • #{asset.overallRank}</small></div><details className="queueDraftReview"><summary aria-label={`Review queued draft pick for ${asset.displayName}`}>Draft</summary><form action={makeDraftPick}><p>Draft {asset.displayName}?</p><input type="hidden" name="draft_id" value={draftId}/>{asset.assetType==='athlete'?<input type="hidden" name="athlete_id" value={asset.id}/>:<input type="hidden" name="real_team_id" value={asset.id}/>}<input type="hidden" name="asset_label" value={assetLabel}/><button type="submit" disabled={!canDraft}>Confirm</button></form></details><form action={moveDraftQueueItem} onSubmit={rememberViewport}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="queue_item_id" value={asset.queueItemId}/><input type="hidden" name="direction" value="up"/><button type="submit" disabled={index===0} aria-label={`Move ${asset.displayName} up`}>↑</button></form><form action={moveDraftQueueItem} onSubmit={rememberViewport}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="queue_item_id" value={asset.queueItemId}/><input type="hidden" name="direction" value="down"/><button type="submit" disabled={index===queuedAssets.length-1} aria-label={`Move ${asset.displayName} down`}>↓</button></form><form action={removeDraftQueueItem} onSubmit={rememberViewport}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="queue_item_id" value={asset.queueItemId}/><button type="submit" aria-label={`Remove ${asset.displayName} from queue`}>×</button></form></article>;})}{!queuedAssets.length&&<p className="draftQueueEmpty">Queue players to keep your short list here.</p>}</div>
        {!canDraft&&status==='live'&&<p className="draftQueueHint">Draft becomes available here when your franchise is on the clock.</p>}
      </section>
      <details className="draftRosterGuide"><summary>Roster needs</summary><div>{rosterGuide.map(([label,description])=><span key={label}><b>{label}</b><small>{description}</small></span>)}</div><p>FLEX accepts a running back, wide receiver, or tight end. It is a lineup slot—not a player position.</p></details>
      <details className="draftMyRoster" id="my-draft-roster"><summary>My drafted roster <b>{draftedAssets.length}</b></summary><div>{draftedAssets.map(asset=><p key={asset.id}><span>#{asset.pickNumber}</span><strong>{asset.label}</strong></p>)}{!draftedAssets.length&&<small>Your selections will appear here.</small>}</div></details>
    </aside>
  </section>;
}
