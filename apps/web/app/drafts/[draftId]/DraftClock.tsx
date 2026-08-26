'use client';

import { useEffect, useMemo, useState } from 'react';

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function DraftClock({ deadlineAt }: { deadlineAt: string | null }) {
  const deadline = useMemo(() => deadlineAt ? new Date(deadlineAt).getTime() : null, [deadlineAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!deadline) return <span className="draftClock" aria-live="polite">Clock pending</span>;

  const remaining = deadline - now;
  if (remaining <= 0) return <span className="draftClock isExpired" aria-live="polite">Expired</span>;
  return <span className="draftClock" aria-live="polite">{formatRemaining(remaining)}</span>;
}
