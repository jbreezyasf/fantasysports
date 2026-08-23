'use client';

import { useDeferredValue, useState } from 'react';
import { makeDraftPick } from '../actions';

type Athlete={id:string;displayName:string;position:string;team:string};
type Defense={id:string;displayName:string;team:string};
type Position='ALL'|'QB'|'RB'|'WR'|'TE'|'FLEX'|'K'|'D/ST';
const positions:Position[]=['ALL','QB','RB','WR','TE','FLEX','K','D/ST'];
const rosterGuide=[['QB','1 starter'],['RB','2 starters'],['WR','2 starters'],['TE','1 starter'],['FLEX','RB / WR / TE'],['K','1 starter'],['D/ST','1 starter']];

export function DraftPlayerPool({draftId,status,athletes,defenses}:{draftId:string;status:string;athletes:Athlete[];defenses:Defense[]}){
  const [position,setPosition]=useState<Position>('ALL');
  const [search,setSearch]=useState('');
  const deferredSearch=useDeferredValue(search.trim().toLowerCase());
  const athleteMatches=athletes.filter(player=>(position==='ALL'||position==='FLEX'?position==='ALL'||['RB','WR','TE'].includes(player.position):player.position===position)&&(!deferredSearch||`${player.displayName} ${player.team}`.toLowerCase().includes(deferredSearch)));
  const defenseMatches=(position==='ALL'||position==='D/ST')?defenses.filter(team=>!deferredSearch||`${team.displayName} ${team.team} defense`.toLowerCase().includes(deferredSearch)):[];
  const resultCount=athleteMatches.length+defenseMatches.length;
  const countFor=(value:Position)=>value==='D/ST'?defenses.length:value==='ALL'?athletes.length+defenses.length:value==='FLEX'?athletes.filter(player=>['RB','WR','TE'].includes(player.position)).length:athletes.filter(player=>player.position===value).length;

  return <section className="panel draftPlayerFinder" aria-labelledby="draft-player-heading">
    <div className="draftFinderHeading"><div><p className="eyebrow">PLAYER FINDER</p><h2 id="draft-player-heading">Build your roster.</h2><p className="lede">New to fantasy? Choose the position you need. Know exactly who you want? Search their name or team.</p></div><span className="sectionCounter" aria-live="polite">{resultCount} AVAILABLE</span></div>
    <details className="draftRosterGuide"><summary>What positions do I need?</summary><div>{rosterGuide.map(([label,description])=><span key={label}><b>{label}</b><small>{description}</small></span>)}</div><p>Your FLEX can be another running back, wide receiver, or tight end. Bench selections add depth after your starters.</p></details>
    <div className="draftFinderControls">
      <label className="draftSearch"><span className="srOnly">Search available players</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search player or team" autoComplete="off"/><b aria-hidden="true">⌕</b></label>
      <div className="draftPositionRail" role="group" aria-label="Filter available players by position">{positions.map(value=><button key={value} type="button" className={position===value?'isActive':''} aria-pressed={position===value} onClick={()=>setPosition(value)}><span>{value}</span><small>{countFor(value)}</small></button>)}</div>
    </div>
    <div className="draftResultHeader"><strong>{position==='ALL'?'ALL PLAYERS':position}</strong><span>{deferredSearch?`MATCHING “${search.trim()}”`:'AVAILABLE NOW'}</span></div>
    <div className="draftPlayerResults">
      {athleteMatches.map(player=><form className="draftCandidate" action={makeDraftPick} key={player.id}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="athlete_id" value={player.id}/><span className="draftPositionBadge">{player.position}</span><div><strong>{player.displayName}</strong><small>{player.team||'FA'} • AVAILABLE</small></div><button className="draftPickButton" type="submit" disabled={status!=='live'} aria-label={`Draft ${player.displayName}`}>Draft</button></form>)}
      {defenseMatches.map(team=><form className="draftCandidate" action={makeDraftPick} key={team.id}><input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="real_team_id" value={team.id}/><span className="draftPositionBadge">D/ST</span><div><strong>{team.team||team.displayName} D/ST</strong><small>DEFENSE • AVAILABLE</small></div><button className="draftPickButton" type="submit" disabled={status!=='live'} aria-label={`Draft ${team.team||team.displayName} defense`}>Draft</button></form>)}
      {!resultCount&&<div className="draftEmpty" role="status"><strong>No available players match.</strong><p>Try another name or choose a different position.</p><button type="button" onClick={()=>{setSearch('');setPosition('ALL')}}>Clear filters</button></div>}
    </div>
  </section>;
}
