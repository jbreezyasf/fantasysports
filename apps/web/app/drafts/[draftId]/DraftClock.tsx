'use client';

import { useEffect, useMemo, useState } from 'react';
import { announceToScreenReader } from '../../components/ScreenReaderAnnouncer';

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const thresholds = [30, 15, 5];

export default function DraftClock({ deadlineAt, announcementPrefix, announceThresholds = false }: { deadlineAt: string | null; announcementPrefix?: string; announceThresholds?: boolean }) {
  const deadline = useMemo(() => deadlineAt ? new Date(deadlineAt).getTime() : null, [deadlineAt]);
  const [now, setNow] = useState(() => Date.now());
  const [announced, setAnnounced] = useState<number[]>([]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setAnnounced([]);
  }, [deadlineAt]);

  const remaining = deadline ? deadline - now : null;
  const totalSeconds = remaining === null ? null : Math.max(0, Math.ceil(remaining / 1000));

  useEffect(() => {
    if (!announceThresholds || !announcementPrefix || totalSeconds === null || totalSeconds <= 0) return;
    const threshold = thresholds.find(value => totalSeconds <= value && !announced.includes(value));
    if (!threshold) return;
    setAnnounced(previous => [...previous, threshold]);
    announceToScreenReader({
      message: `${announcementPrefix} ${threshold} seconds remaining.`,
      key: `draft-clock-${deadlineAt}-${threshold}`,
      priority: threshold <= 5 ? 'assertive' : 'polite'
    });
  }, [announceThresholds, announcementPrefix, announced, deadlineAt, totalSeconds]);

  if (!deadline || remaining === null || totalSeconds === null) return <span className="draftClock" aria-live="polite">Clock pending</span>;
  if (remaining <= 0) return <span className="draftClock isExpired" aria-live="polite">Expired</span>;
  return <span className="draftClock" aria-label={`${totalSeconds} seconds remaining`}>{formatRemaining(remaining)}</span>;
}
