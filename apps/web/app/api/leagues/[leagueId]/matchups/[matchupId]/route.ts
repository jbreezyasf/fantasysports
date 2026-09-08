import {
  isUuid,
  invalidMachineRequest,
  runMachineReadTools
} from '../../../../../../lib/machine/assistantGmApi';

type MatchupRouteParams = { params: Promise<{ leagueId: string; matchupId: string }> };

export async function GET(_request: Request, context: MatchupRouteParams) {
  const { leagueId, matchupId } = await context.params;
  if (!isUuid(matchupId)) return invalidMachineRequest('matchupId must be a UUID.');
  return runMachineReadTools({
    leagueId,
    capabilityId: 'matchup.read',
    toolRequests: [{ tool: 'getMatchup', leagueId, matchupId }]
  });
}
