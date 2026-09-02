import { groundedAssistantAnswer } from './grounding';
import type { AssistantGmToolResponse } from './tools';

type MatchupToolData = {
  matchup?: {
    home_points?: number | string;
    away_points?: number | string;
    is_final?: boolean;
    home_season_franchise_id?: string;
    away_season_franchise_id?: string;
  };
  requesterSeasonFranchiseId?: string | null;
  homeName?: string;
  awayName?: string;
  projection?: { requester?: number | null; opponent?: number | null } | null;
  lineups?: Array<{ season_franchise_id?: string; name?: string; game_status?: string | null }>;
};
type Standing = { rank?: number; wins?: number; losses?: number; ties?: number | null; points_for?: number | string; franchise?: { name?: string | null; abbreviation?: string | null } | null; season_franchise_id?: string };
type StandingsToolData = { standings?: Standing[]; requesterSeasonFranchiseId?: string | null };

export type MatchupStandingsIntent = 'score' | 'am_i_winning' | 'left_to_play' | 'projection' | 'my_standing' | 'first_place';

function successfulData<T>(responses: AssistantGmToolResponse[], tool: AssistantGmToolResponse['tool']) {
  const response = responses.find((item) => item.tool === tool);
  return response?.ok ? response.data as T : null;
}

function scoreContext(data: MatchupToolData) {
  const matchup = data.matchup;
  if (!matchup) return null;
  const homeScore = Number(matchup.home_points ?? 0);
  const awayScore = Number(matchup.away_points ?? 0);
  const requesterIsHome = data.requesterSeasonFranchiseId && data.requesterSeasonFranchiseId === matchup.home_season_franchise_id;
  const requesterIsAway = data.requesterSeasonFranchiseId && data.requesterSeasonFranchiseId === matchup.away_season_franchise_id;
  const requesterScore = requesterIsHome ? homeScore : requesterIsAway ? awayScore : null;
  const opponentScore = requesterIsHome ? awayScore : requesterIsAway ? homeScore : null;
  const requesterName = requesterIsHome ? data.homeName : requesterIsAway ? data.awayName : null;
  const opponentName = requesterIsHome ? data.awayName : requesterIsAway ? data.homeName : null;

  return { matchup, homeScore, awayScore, requesterScore, opponentScore, requesterName, opponentName };
}

function record(row: Standing) {
  return `${row.wins ?? 0}-${row.losses ?? 0}${row.ties ? `-${row.ties}` : ''}`;
}

export function answerMatchupStandingsIntent(intent: MatchupStandingsIntent, toolResponses: AssistantGmToolResponse[]) {
  const categories = intent === 'my_standing' || intent === 'first_place' ? ['standings' as const] : ['score' as const];

  return groundedAssistantAnswer({
    categories,
    toolResponses,
    render: () => {
      if (intent === 'my_standing' || intent === 'first_place') {
        const standingsData = successfulData<StandingsToolData>(toolResponses, 'getStandings');
        const standings = standingsData?.standings ?? [];
        if (!standings.length) return 'I found no verified standings rows for this league.';
        if (intent === 'first_place') {
          const leader = standings[0];
          return `${leader.franchise?.name ?? leader.franchise?.abbreviation ?? 'First place'} is in first at ${record(leader)} with ${Number(leader.points_for ?? 0).toFixed(2)} points for.`;
        }
        const mine = standings.find((row) => row.season_franchise_id === standingsData?.requesterSeasonFranchiseId);
        if (!mine) return 'I cannot identify your verified standings row right now.';
        return `You are in ${mine.rank ?? standings.indexOf(mine) + 1}${ordinalSuffix(mine.rank ?? standings.indexOf(mine) + 1)} place at ${record(mine)} with ${Number(mine.points_for ?? 0).toFixed(2)} points for.`;
      }

      const matchupData = successfulData<MatchupToolData>(toolResponses, 'getMatchup');
      const context = matchupData ? scoreContext(matchupData) : null;
      if (!context) return 'I cannot retrieve the verified matchup score right now.';

      if (intent === 'score') {
        const state = context.matchup.is_final ? 'Final' : 'Current score';
        return `${state}: ${matchupData?.homeName ?? 'Home'} ${context.homeScore.toFixed(2)}, ${matchupData?.awayName ?? 'Away'} ${context.awayScore.toFixed(2)}.`;
      }

      if (intent === 'am_i_winning') {
        if (context.requesterScore === null || context.opponentScore === null) return 'I can read the matchup score, but I cannot identify your team in this matchup.';
        if (context.requesterScore === context.opponentScore) return `You are tied with ${context.opponentName ?? 'your opponent'}, ${context.requesterScore.toFixed(2)} to ${context.opponentScore.toFixed(2)}.`;
        return context.requesterScore > context.opponentScore
          ? `You are winning against ${context.opponentName ?? 'your opponent'}, ${context.requesterScore.toFixed(2)} to ${context.opponentScore.toFixed(2)}.`
          : `You are trailing ${context.opponentName ?? 'your opponent'}, ${context.requesterScore.toFixed(2)} to ${context.opponentScore.toFixed(2)}.`;
      }

      if (intent === 'projection') {
        const projection = matchupData?.projection;
        if (!projection || projection.requester == null || projection.opponent == null) return 'The verified current score is available, but I cannot retrieve a verified projection right now.';
        return `Projection, not current score: you ${projection.requester.toFixed(2)}, opponent ${projection.opponent.toFixed(2)}. Current score: ${context.homeScore.toFixed(2)} to ${context.awayScore.toFixed(2)}.`;
      }

      const remaining = (matchupData?.lineups ?? []).filter((row) => row.game_status && !['final', 'complete'].includes(row.game_status.toLowerCase()));
      if (!remaining.length) return 'I cannot retrieve verified remaining-player game status right now.';
      return `Verified players left with non-final status: ${remaining.map((row) => row.name ?? 'Player').join(', ')}.`;
    }
  });
}

function ordinalSuffix(value: number) {
  if (value % 100 >= 11 && value % 100 <= 13) return 'th';
  if (value % 10 === 1) return 'st';
  if (value % 10 === 2) return 'nd';
  if (value % 10 === 3) return 'rd';
  return 'th';
}
