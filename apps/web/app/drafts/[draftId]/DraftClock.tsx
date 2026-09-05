'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { announceToScreenReader } from '../../components/ScreenReaderAnnouncer';

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const thresholds = [30, 15, 5];

export default function DraftClock({
  deadlineAt,
  announcementPrefix,
  announceThresholds = false,
  draftId,
  processExpiredAction
}: {
  deadlineAt: string | null;
  announcementPrefix?: string;
  announceThresholds?: boolean;
  draftId?: string;
  processExpiredAction?: (formData: FormData) => void | Promise<void>;
}) {
  const deadline = useMemo(() => deadlineAt ? new Date(deadlineAt).getTime() : null, [deadlineAt]);
  const expiredFormRef = useRef<HTMLFormElement>(null);
  // `now` stays null through the server render and the first client render.
  // Seeding it with Date.now() made the server emit a countdown computed from
  // server time that the client immediately disagreed with, which is a hydration
  // mismatch on both the text and the aria-label. The server now renders the
  // existing "Clock pending" state and the real clock starts on mount.
  const [now, setNow] = useState<number | null>(null);
  const [announced, setAnnounced] = useState<number[]>([]);
  const [submittedDeadline, setSubmittedDeadline] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setAnnounced([]);
    setSubmittedDeadline(null);
  }, [deadlineAt]);

  const remaining = deadline !== null && now !== null ? deadline - now : null;
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

  useEffect(() => {
    if (!draftId || !processExpiredAction || !deadlineAt || remaining === null || remaining > 0 || submittedDeadline === deadlineAt) return;
    setSubmittedDeadline(deadlineAt);
    expiredFormRef.current?.requestSubmit();
  }, [deadlineAt, draftId, processExpiredAction, remaining, submittedDeadline]);

  if (!deadline || remaining === null || totalSeconds === null) return <span className="draftClock" aria-live="polite">Clock pending</span>;
  const clock = remaining <= 0
    ? <span className="draftClock isExpired" aria-live="polite">Expired</span>
    : <span className="draftClock" aria-label={`${totalSeconds} seconds remaining`}>{formatRemaining(remaining)}</span>;
  if (!draftId || !processExpiredAction) return clock;
  return <>
    {clock}
    <form ref={expiredFormRef} action={processExpiredAction} hidden aria-hidden="true">
      <input type="hidden" name="draft_id" value={draftId} />
      <button type="submit">Process expired pick</button>
    </form>
  </>;
}
