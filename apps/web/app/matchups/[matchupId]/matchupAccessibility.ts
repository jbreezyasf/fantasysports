export type MatchupSummary = {
  userTeam?: string | null;
  opponentTeam?: string | null;
  userScore?: number | null;
  opponentScore?: number | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  isFinal: boolean;
  eventType: string;
};

export function matchupStatus(summary: MatchupSummary) {
  if (summary.userTeam && summary.opponentTeam && summary.userScore != null && summary.opponentScore != null) {
    const delta = summary.userScore - summary.opponentScore;
    const result = delta > 0 ? `winning by ${delta.toFixed(2)}` : delta < 0 ? `losing by ${Math.abs(delta).toFixed(2)}` : 'tied';
    return [
      `${summary.isFinal ? 'Final' : 'Live'} matchup`,
      `${summary.userTeam} ${summary.userScore.toFixed(2)}`,
      `${summary.opponentTeam} ${summary.opponentScore.toFixed(2)}`,
      result,
      'Projected final scores not displayed',
      'Players remaining not tracked on this page',
      `Game status ${summary.isFinal ? 'final' : summary.eventType}`
    ].join('. ');
  }
  const leader = summary.homeScore === summary.awayScore
    ? 'Game tied'
    : `${summary.homeScore > summary.awayScore ? summary.homeTeam : summary.awayTeam} leading by ${Math.abs(summary.homeScore - summary.awayScore).toFixed(2)}`;
  return `${summary.isFinal ? 'Final' : 'Live'} matchup. ${summary.homeTeam} ${summary.homeScore.toFixed(2)}. ${summary.awayTeam} ${summary.awayScore.toFixed(2)}. ${leader}. Projected final scores not displayed. Players remaining not tracked on this page.`;
}

export function matchupRowLabel(slot: string, homeName: string, homePoints: number, awayName: string, awayPoints: number) {
  return `${slot}. ${homeName}, ${homePoints.toFixed(2)} points. ${awayName}, ${awayPoints.toFixed(2)} points.`;
}
