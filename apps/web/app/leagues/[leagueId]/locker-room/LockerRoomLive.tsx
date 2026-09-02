'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import { announceToScreenReader } from '../../../components/ScreenReaderAnnouncer';

export function LockerRoomLive({leagueId,latestEvent}:{leagueId:string;latestEvent?:{id:string;announcement:string}|null}) {
  const router = useRouter();

  useEffect(() => {
    if (!latestEvent) return;
    announceToScreenReader({
      message: latestEvent.announcement,
      key: `locker-room-${latestEvent.id}`,
      priority: 'polite'
    });
  }, [latestEvent]);

  useEffect(() => {
    const supabase = createClient();
    const scrollToLatest = () => {
      const messages = document.querySelector<HTMLElement>('.lockerMessages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    };
    const refresh = () => {
      router.refresh();
      window.setTimeout(scrollToLatest,400);
    };
    window.requestAnimationFrame(scrollToLatest);
    const channel = supabase.channel(`locker-room:${leagueId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'league_feed_events',filter:`league_id=eq.${leagueId}`},refresh)
      .subscribe();
    const polling = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    },20_000);
    return () => {
      window.clearInterval(polling);
      void supabase.removeChannel(channel);
    };
  },[leagueId,router]);

  return null;
}
