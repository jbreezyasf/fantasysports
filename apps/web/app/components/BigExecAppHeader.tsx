'use client';

import { usePathname } from 'next/navigation';

const items=[['League HQ',''],['Locker Room','/locker-room'],['Schedule','/schedule'],['Trades','/trades'],['Players','/players']] as const;

export default function BigExecAppHeader({leagueId}:{leagueId:string}){
  const pathname=usePathname();
  return <header className="bigExecAppHeader">
    <a className="appBrandLockup" href="/dashboard" aria-label="Big Exec dashboard"><span>BE</span><div><strong>BIG EXEC</strong><small>FANTASY SPORTS</small></div></a>
    <nav aria-label="League sections">{items.map(([label,suffix])=>{const href=`/leagues/${leagueId}${suffix}`;const active=suffix?pathname.startsWith(href):pathname===href;return <a key={label} href={href} aria-current={active?'page':undefined}>{label}</a>})}</nav>
    <a className="appHomeAction" href="/dashboard">Front Office</a>
  </header>;
}
