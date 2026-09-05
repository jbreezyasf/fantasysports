'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import AskGmPushToTalk from './AskGmPushToTalk';
import { askHeaderAssistantGm } from './assistantGmActions';
import { VisuallyHidden } from './accessibility';

const items=[['League HQ',''],['Locker Room','/locker-room'],['Schedule','/schedule'],['Trades','/trades'],['Players','/players']] as const;

export default function BigExecAppHeader({leagueId,isCommissioner=false,voiceInputEnabled=false,criticalControlsActive=false}:{leagueId:string;isCommissioner?:boolean;voiceGmEnabled?:boolean;voiceInputEnabled?:boolean;criticalControlsActive?:boolean}){
  const pathname=usePathname();
  const currentItem=items.find(([_,suffix])=>{const href=`/leagues/${leagueId}${suffix}`;return suffix?pathname.startsWith(href):pathname===href;});
  const rosterIntegrityActive=pathname.startsWith(`/leagues/${leagueId}/settings/roster-integrity`);
  return <header className="bigExecAppHeader">
    <a className="appBrandLockup" href="/dashboard" aria-label="Big Exec dashboard"><span>BE</span><div><strong>BIG EXEC</strong><small>FANTASY SPORTS</small></div></a>
    <nav aria-label="League sections">
      {(currentItem || rosterIntegrityActive) && <VisuallyHidden>Current league section: {rosterIntegrityActive?'Roster Integrity':currentItem?.[0]}</VisuallyHidden>}
      {items.map(([label,suffix])=>{const href=`/leagues/${leagueId}${suffix}`;const active=suffix?pathname.startsWith(href):pathname===href;return <a key={label} href={href} aria-current={active?'page':undefined} aria-label={`${label}${active?', current section':''}`}>{label}</a>})}
    </nav>
    <div className="actions">
      <AskGmPushToTalk onAsk={(question)=>askHeaderAssistantGm(leagueId,question)} voiceInputEnabled={voiceInputEnabled} capabilities={{voiceInput:voiceInputEnabled,spokenOutput:true,criticalControlsActive}} />
      {isCommissioner&&<a className="secondary" href={`/leagues/${leagueId}/settings/roster-integrity`} aria-current={rosterIntegrityActive?'page':undefined} aria-label={`Roster Integrity${rosterIntegrityActive?', current section':''}`}>Roster Integrity</a>}
      <a className="appHomeAction" href="/dashboard" aria-label="Front Office dashboard">Front Office</a>
    </div>
  </header>;
}
