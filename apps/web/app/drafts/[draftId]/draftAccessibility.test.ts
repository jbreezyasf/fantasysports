import { describe, expect, it } from 'vitest';
import { draftCandidateLabel, draftStateAnnouncement, onClockAnnouncement } from './draftAccessibility';

describe('draft accessibility copy', () => {
  it('announces the current draft state', () => {
    expect(draftStateAnnouncement({
      status: 'live',
      currentRound: 2,
      currentPick: 13,
      roundPick: 3,
      managerOnClock: 'The Executives',
      userNextPick: 17
    })).toBe('Draft status live. Round 2, Pick 3. Overall pick 13. The Executives is on the clock. Your next pick is pick 17.');
  });

  it('announces when the user is on the clock', () => {
    expect(onClockAnnouncement(4, 6, 30)).toBe('You are on the clock. Round 4, Pick 6. 30 seconds remaining.');
  });

  it('labels a draft candidate with rank and action', () => {
    expect(draftCandidateLabel({
      name: 'Draft Example',
      position: 'TE',
      team: 'NYJ',
      rank: 44,
      score: '12.0 PTS',
      action: 'Draft player'
    })).toBe('Draft Example. Position TE. NFL team NYJ. Overall rank 44. Score 12.0 PTS. Action Draft player.');
  });
});
