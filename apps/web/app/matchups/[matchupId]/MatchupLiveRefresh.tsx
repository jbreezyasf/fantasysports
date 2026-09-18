'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_MS = 30_000;

export type MatchupFeedState = 'upcoming' | 'live' | 'idle' | 'final' | 'unavailable';

export function matchupFeedMessage({state,updatedAt,nextGameAt,now}:{state:MatchupFeedState;updatedAt:string|null;nextGameAt:string|null;now:number}) {
  if(state==='final') return 'Final score';
  if(state==='unavailable') return 'Live game status is temporarily unavailable • Scores continue updating automatically';
  if(state==='upcoming' || state==='idle') {
    if(nextGameAt) return `No games in progress • Live scoring resumes ${new Date(nextGameAt).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' })}`;
    return 'No games in progress';
  }
  const ageSeconds=updatedAt?Math.max(0,Math.round((now-Date.parse(updatedAt))/1000)):null;
  return `Live scoring updates automatically every 30 seconds${ageSeconds===null?'':` • Data updated ${ageSeconds<60?`${ageSeconds} seconds`:`${Math.floor(ageSeconds/60)} minutes`} ago`}`;
}

export default function MatchupLiveRefresh({ isFinal, updatedAt, feedState='live', nextGameAt=null }: { isFinal: boolean; updatedAt: string | null; feedState?: MatchupFeedState; nextGameAt?: string | null }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (isFinal) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [isFinal, router]);

  return <p className="liveScoreFreshness" role="status">
    {matchupFeedMessage({state:isFinal?'final':feedState,updatedAt,nextGameAt,now:now??Date.now()})}
  </p>;
}
