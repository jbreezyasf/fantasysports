import { describe, expect, it } from 'vitest';
import { describePlayerSearchResult, playerSearchSummary } from './playerSearchAccessibility';

describe('player search accessibility copy', () => {
  it('describes a searchable player with required fallback fields', () => {
    expect(describePlayerSearchResult({
      name: 'Player Example',
      position: 'QB',
      team: 'CHI',
      availability: 'Available',
      action: 'Add player'
    })).toBe('Player Example. Position QB. NFL team CHI. Availability Available. Injury status not available. Opponent not displayed. Projection not displayed. Action Add player');
  });

  it('describes result counts, filters, availability mode, and sort order', () => {
    expect(playerSearchSummary(1, 'FLEX', true, 'position then player name')).toBe('1 result for FLEX, available players only. Sorted by position then player name.');
    expect(playerSearchSummary(4, 'ALL', false, 'position then player name')).toBe('4 results for ALL, all roster statuses. Sorted by position then player name.');
  });
});
