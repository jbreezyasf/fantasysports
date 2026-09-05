'use client';

import { useDeferredValue, useState } from 'react';
import { addDraftQueueItem, makeDraftPick, moveDraftQueueItem, removeDraftQueueItem } from '../actions';
import { draftCandidateLabel } from './draftAccessibility';

type RankedAsset={overallRank:number;positionRank:number;rankingScore:number|null;rankingSource:string;rankingVersion:string};
type Athlete={id:string;displayName:string;position:string;team:string}&RankedAsset;
type Defense={id:string;displayName:string;team:string}&RankedAsset;
type QueuedAsset=(Athlete|Defense)&{position:string;queueItemId:string;queueRank:number;assetType:'athlete'|'defense'};
type Position='ALL'|'QB'|'RB'|'WR'|'TE'|'FLEX'|'K'|'D/ST';
const positions:Position[]=['ALL','QB','RB','WR','TE','FLEX','K','D/ST'];
const rosterGuide=[['QB','1 starter'],['RB','2 starters'],['WR','2 starters'],['TE','1 starter'],['FLEX','RB / WR / TE'],['K','1 starter'],['D/ST','1 starter']];

function formatRankingVersion(value:string){
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return value;
  // Explicit locale and time zone: an undefined locale resolves to the server's
  // locale during SSR and the viewer's locale on the client, which mismatches.
  return parsed.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}

function formatScore(value:number|null){
  return value===null?'NO VALUE':`${value.toFixed(1)} VALUE`;
}

export function DraftPlayerPool({draftId,status,athletes,defenses,queuedAssets,rankingSource,rankingVersion}:{draftId:string;status:string;athletes:Athlete[];defenses:Defense[];queuedAssets:QueuedAsset[];rankingSource:string;rankingVersion:string}){
  const [position,setPosition]=useState<Position>('ALL');
  const [search,setSearch]=useState('');
  const deferredSearch=useDeferredValue(search.trim().toLowerCase());
  const queuedAthleteIds=new Set(queuedAssets.filter(asset=>asset.assetType==='athlete').map(asset=>asset.id));
  const queuedDefenseIds=new Set(queuedAssets.filter(asset=>asset.assetType==='defense').map(asset=>asset.id));
  const athleteMatches=athletes.filter(player=>(position==='ALL'||position==='FLEX'?position==='ALL'||['RB','WR','TE'].includes(player.position):player.position===position)&&(!deferredSearch||`${player.displayName} ${player.team}`.toLowerCase().includes(deferredSearch)));
  const defenseMatches=(position==='ALL'||position==='D/ST')?defenses.filter(team=>!deferredSearch||`${team.displayName} ${team.team} defense`.toLowerCase().includes(deferredSearch)):[];
  const resultCount=athleteMatches.length+defenseMatches.length;
  const countFor=(value:Position)=>value==='D/ST'?defenses.length:value==='ALL'?athletes.length+defenses.length:value==='FLEX'?athletes.filter(player=>['RB','WR','TE'].includes(player.position)).length:athletes.filter(player=>player.position===value).length;
  const candidateDetails=(details:{position:string;team:string;rank:number;score:string})=><dl className="playerDetailsList staticDetails"><div><dt>Position</dt><dd>{details.position}</dd></div><div><dt>NFL team</dt><dd>{details.team}</dd></div><div><dt>Overall rank</dt><dd>{details.rank}</dd></div><div><dt>Draft value</dt><dd>{details.score}</dd></div></dl>;

  return <section className="panel draftPlayerFinder" aria-labelledby="draft-player-heading">
    <div className="draftFinderHeading"><div><p className="eyebrow">PLAYER FINDER</p><h2 id="draft-player-heading">Build your roster.</h2><p className="lede">Ranked by {rankingSource} • Updated {formatRankingVersion(rankingVersion)}</p></div><span className="sectionCounter" aria-live="polite">{resultCount} AVAILABLE</span></div>
    <div className="draftQueuePanel" aria-labelledby="draft-queue-heading">
      <div className="draftResultHeader"><strong id="draft-queue-heading">MY QUEUE</strong><span>{queuedAssets.length} SAVED</span></div>
      <div className="draftQueueList">
        {queuedAssets.map((asset,index)=><article className="draftQueueItem" key={asset.queueItemId}>
          <span>{asset.queueRank}</span>
          <div><strong>{asset.displayName}</strong><small>{asset.position} {asset.positionRank} • #{asset.overallRank} • {formatScore(asset.rankingScore)}</small></div>
          <form action={moveDraftQueueItem}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="queue_item_id" value={asset.queueItemId}/><input type="hidden" name="direction" value="up"/><button type="submit" disabled={index===0} aria-label={`Move ${asset.displayName} up`}>Up</button></form>
          <form action={moveDraftQueueItem}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="queue_item_id" value={asset.queueItemId}/><input type="hidden" name="direction" value="down"/><button type="submit" disabled={index===queuedAssets.length-1} aria-label={`Move ${asset.displayName} down`}>Down</button></form>
          <form action={removeDraftQueueItem}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="queue_item_id" value={asset.queueItemId}/><button type="submit" aria-label={`Remove ${asset.displayName} from queue`}>X</button></form>
        </article>)}
        {!queuedAssets.length&&<p className="draftQueueEmpty">No players queued yet.</p>}
      </div>
    </div>
    <details className="draftRosterGuide"><summary>What positions do I need?</summary><div>{rosterGuide.map(([label,description])=><span key={label}><b>{label}</b><small>{description}</small></span>)}</div><p>Your FLEX can be another running back, wide receiver, or tight end. Bench selections add depth after your starters.</p></details>
    <div className="draftFinderControls">
      <label className="draftSearch"><span className="srOnly">Search available players</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search player or team" autoComplete="off"/><b aria-hidden="true">⌕</b></label>
      <div className="draftPositionRail" role="group" aria-label="Filter available players by position">{positions.map(value=><button key={value} type="button" className={position===value?'isActive':''} aria-pressed={position===value} onClick={()=>setPosition(value)}><span>{value}</span><small>{countFor(value)}</small></button>)}</div>
    </div>
    <div className="draftResultHeader"><strong>{position==='ALL'?'ALL PLAYERS':position}</strong><span>{deferredSearch?`MATCHING “${search.trim()}”`:'AVAILABLE NOW'}</span></div>
    <p className="srOnly" role="status">{resultCount} available draft result{resultCount===1?'':'s'} for {position}. Sorted by overall draft rank.</p>
    <div className="draftPlayerResults">
      {athleteMatches.map(player=>{const score=formatScore(player.rankingScore);const assetLabel=`${player.displayName} • ${player.position} • ${player.team||'FA'}`;return <article className="draftCandidate" aria-label={draftCandidateLabel({name:player.displayName,position:player.position,team:player.team||'FA',rank:player.overallRank,score,action:status==='live'?'Review draft pick':'Draft unavailable until live'})} key={player.id}><span className="draftPositionBadge">#{player.overallRank}</span><div><strong>{player.displayName}</strong><small>{player.position} {player.positionRank} • {player.team||'FA'} • {score}</small></div><form action={addDraftQueueItem}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="athlete_id" value={player.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftQueueButton" type="submit" disabled={queuedAthleteIds.has(player.id)} aria-label={`${queuedAthleteIds.has(player.id)?'Already queued':'Queue'} ${player.displayName}`}>{queuedAthleteIds.has(player.id)?'Queued':'Queue'}</button></form><details className="draftPickReview"><summary aria-label={`Review draft pick for ${player.displayName}`}>Draft</summary>{candidateDetails({position:player.position,team:player.team||'FA',rank:player.overallRank,score})}<form action={makeDraftPick}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="athlete_id" value={player.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftPickButton" type="submit" disabled={status!=='live'} aria-label={`Confirm draft pick for ${player.displayName}`}>Confirm Draft Pick</button></form></details></article>;})}
      {defenseMatches.map(team=>{const score=formatScore(team.rankingScore);const name=`${team.team||team.displayName} D/ST`;const assetLabel=`${name} • D/ST`;return <article className="draftCandidate" aria-label={draftCandidateLabel({name,position:'D/ST',team:team.team||team.displayName,rank:team.overallRank,score,action:status==='live'?'Review draft pick':'Draft unavailable until live'})} key={team.id}><span className="draftPositionBadge">#{team.overallRank}</span><div><strong>{name}</strong><small>D/ST {team.positionRank} • DEFENSE • {score}</small></div><form action={addDraftQueueItem}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="real_team_id" value={team.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftQueueButton" type="submit" disabled={queuedDefenseIds.has(team.id)} aria-label={`${queuedDefenseIds.has(team.id)?'Already queued':'Queue'} ${name}`}>{queuedDefenseIds.has(team.id)?'Queued':'Queue'}</button></form><details className="draftPickReview"><summary aria-label={`Review draft pick for ${name}`}>Draft</summary>{candidateDetails({position:'D/ST',team:team.team||team.displayName,rank:team.overallRank,score})}<form action={makeDraftPick}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="real_team_id" value={team.id}/><input type="hidden" name="asset_label" value={assetLabel}/><button className="draftPickButton" type="submit" disabled={status!=='live'} aria-label={`Confirm draft pick for ${name}`}>Confirm Draft Pick</button></form></details></article>;})}
      {!resultCount&&<div className="draftEmpty" role="status"><strong>No available players match.</strong><p>Try another name or choose a different position.</p><button type="button" onClick={()=>{setSearch('');setPosition('ALL')}}>Clear filters</button></div>}
    </div>
  </section>;
}
