'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

export default function DraftRoomLive({ draftId, seasonFranchiseId }: { draftId: string; seasonFranchiseId: string | null }) {
  const router = useRouter();
  const [connectionState,setConnectionState]=useState<'connecting'|'connected'|'reconnecting'>('connecting');

  useEffect(() => {
    const supabase = createClient();
    let refreshQueued = false;
    const refresh = () => {
      if (refreshQueued) return;
      refreshQueued = true;
      window.setTimeout(() => {
        refreshQueued = false;
        router.refresh();
      }, 250);
    };

    const channel = supabase.channel(`draft-room:${draftId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drafts', filter: `id=eq.${draftId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `draft_id=eq.${draftId}` }, refresh);

    if (seasonFranchiseId) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'draft_queues', filter: `season_franchise_id=eq.${seasonFranchiseId}` }, refresh);
    }

    channel.subscribe(status=>setConnectionState(status==='SUBSCRIBED'?'connected':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'reconnecting':'connecting'));
    const polling = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 15_000);

    return () => {
      window.clearInterval(polling);
      void supabase.removeChannel(channel);
    };
  }, [draftId, router, seasonFranchiseId]);

  return <span className={`draftConnection ${connectionState}`} role="status"><i aria-hidden="true"/>{connectionState==='connected'?'Live sync':connectionState==='reconnecting'?'Reconnecting':'Connecting'}</span>;
}
