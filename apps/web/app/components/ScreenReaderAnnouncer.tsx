'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnnouncementQueue, type Announcement } from './announcementQueue';

export const SCREEN_READER_ANNOUNCEMENT_EVENT = 'big-exec:a11y-announce';
export const GM_AUDIO_STATE_EVENT = 'big-exec:gm-audio-state';

export function announceToScreenReader(announcement: Announcement) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Announcement>(SCREEN_READER_ANNOUNCEMENT_EVENT, { detail: announcement }));
}

export function setGmAudioSpeaking(speaking: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<{ speaking: boolean }>(GM_AUDIO_STATE_EVENT, { detail: { speaking } }));
}

export default function ScreenReaderAnnouncer() {
  const queue = useMemo(() => new AnnouncementQueue(), []);
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');

  useEffect(() => {
    const publish = (announcement: { message: string; priority: 'polite' | 'assertive' }) => {
      if (announcement.priority === 'assertive') setAssertive(announcement.message);
      else setPolite(announcement.message);
    };

    const onAnnouncement = (event: Event) => {
      const customEvent = event as CustomEvent<Announcement>;
      const next = queue.enqueue(customEvent.detail);
      if (next) publish(next);
    };
    const onGmAudioState = (event: Event) => {
      queue.setGmSpeaking(Boolean((event as CustomEvent<{ speaking: boolean }>).detail?.speaking));
    };

    window.addEventListener(SCREEN_READER_ANNOUNCEMENT_EVENT, onAnnouncement);
    window.addEventListener(GM_AUDIO_STATE_EVENT, onGmAudioState);
    const interval = window.setInterval(() => {
      for (const due of queue.flushDue()) publish(due);
    }, 250);

    return () => {
      window.removeEventListener(SCREEN_READER_ANNOUNCEMENT_EVENT, onAnnouncement);
      window.removeEventListener(GM_AUDIO_STATE_EVENT, onGmAudioState);
      window.clearInterval(interval);
      queue.clear();
    };
  }, [queue]);

  return (
    <>
      <div className="srOnly" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="srOnly" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}
