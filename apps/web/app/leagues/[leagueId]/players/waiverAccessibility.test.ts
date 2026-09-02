import { describe, expect, it } from 'vitest';
import { waiverReviewAnnouncement } from './waiverAccessibility';

describe('waiver accessibility copy', () => {
  it('announces claim review details without FAAB when the league has no FAAB engine', () => {
    expect(waiverReviewAnnouncement({
      addLabel: 'WR • Player Example • KC',
      dropLabel: 'RB • Drop Example',
      clearsAt: 'Sep 1, 6:00 PM',
      source: 'BEX',
      faabEnabled: false
    })).toBe('Review waiver claim for WR • Player Example • KC. Drop player RB • Drop Example. FAAB amount not used by this league. Processing information: clears Sep 1, 6:00 PM, from BEX');
  });
});
