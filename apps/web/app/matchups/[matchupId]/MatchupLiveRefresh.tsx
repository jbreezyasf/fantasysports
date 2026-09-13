'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_MS = 30_000;

export default function MatchupLiveRefresh({ isFinal, updatedAt }: { isFinal: boolean; updatedAt: string | null }) {
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

  const ageSeconds = updatedAt && now !== null ? Math.max(0, Math.round((now - Date.parse(updatedAt)) / 1000)) : null;
  return <p className="liveScoreFreshness" role="status">
    {isFinal ? 'Final score' : `Updates automatically every 30 seconds${ageSeconds === null ? '' : ` • Data updated ${ageSeconds < 60 ? `${ageSeconds} seconds` : `${Math.floor(ageSeconds / 60)} minutes`} ago`}`}
  </p>;
}
