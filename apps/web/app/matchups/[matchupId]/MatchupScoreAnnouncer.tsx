'use client';

import { useEffect } from 'react';
import { announceToScreenReader } from '../../components/ScreenReaderAnnouncer';

export default function MatchupScoreAnnouncer({ matchupId, summary }: { matchupId: string; summary: string }) {
  useEffect(() => {
    announceToScreenReader({
      message: summary,
      key: `matchup-score-${matchupId}-${summary}`,
      priority: 'polite',
      throttleMs: 5000,
      channel: 'live-scoring'
    });
  }, [matchupId, summary]);

  return null;
}
