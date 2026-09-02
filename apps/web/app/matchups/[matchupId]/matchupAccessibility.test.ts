import { describe, expect, it } from 'vitest';
import { matchupRowLabel, matchupStatus } from './matchupAccessibility';

describe('matchup accessibility copy', () => {
  it('summarizes a participant matchup with result state', () => {
    expect(matchupStatus({
      userTeam: 'Home Team',
      opponentTeam: 'Away Team',
      userScore: 101.25,
      opponentScore: 98,
      homeTeam: 'Home Team',
      awayTeam: 'Away Team',
      homeScore: 101.25,
      awayScore: 98,
      isFinal: false,
      eventType: 'live'
    })).toBe('Live matchup. Home Team 101.25. Away Team 98.00. winning by 3.25. Projected final scores not displayed. Players remaining not tracked on this page. Game status live');
  });

  it('labels scoring rows with both sides and points', () => {
    expect(matchupRowLabel('QB', 'A Player', 20, 'B Player', 17.4)).toBe('QB. A Player, 20.00 points. B Player, 17.40 points.');
  });
});
