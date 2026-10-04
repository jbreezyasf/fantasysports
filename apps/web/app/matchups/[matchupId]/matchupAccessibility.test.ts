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

  it('names the Chaos Clause winner instead of calling a decided final tied', () => {
    const level = { homeTeam: 'Home Team', awayTeam: 'Away Team', homeScore: 100, awayScore: 100, isFinal: true, eventType: 'playoff_qf' };
    const decidedNote = 'Home Team wins. Decided by the Chaos Clause: 131.40 to 118.25 in Chaos Week.';
    expect(matchupStatus({ ...level, decidedNote })).toBe('Final matchup. Home Team 100.00. Away Team 100.00. Level on points. Home Team wins. Decided by the Chaos Clause: 131.40 to 118.25 in Chaos Week. Projected final scores not displayed. Players remaining not tracked on this page.');
    expect(matchupStatus({ ...level, userTeam: 'Away Team', opponentTeam: 'Home Team', userScore: 100, opponentScore: 100, decidedNote })).toContain('Home Team 100.00. level on points. Home Team wins. Decided by the Chaos Clause: 131.40 to 118.25 in Chaos Week. Projected');
    expect(matchupStatus(level)).toContain('Game tied');
    expect(matchupStatus({ ...level, isFinal: false, decidedNote })).toContain('Game tied');
  });

  it('labels scoring rows with both sides and points', () => {
    expect(matchupRowLabel('QB', 'A Player', 20, 'B Player', 17.4)).toBe('QB. A Player, 20.00 points. B Player, 17.40 points.');
  });
});
