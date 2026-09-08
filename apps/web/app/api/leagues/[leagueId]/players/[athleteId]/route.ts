import {
  isUuid,
  invalidMachineRequest,
  runMachineReadTools
} from '../../../../../../lib/machine/assistantGmApi';

type PlayerRouteParams = { params: Promise<{ leagueId: string; athleteId: string }> };

export async function GET(_request: Request, context: PlayerRouteParams) {
  const { leagueId, athleteId } = await context.params;
  if (!isUuid(athleteId)) return invalidMachineRequest('athleteId must be a UUID.');
  return runMachineReadTools({
    leagueId,
    capabilityId: 'players.search.read',
    toolRequests: [{ tool: 'getPlayerDetails', leagueId, athleteId }]
  });
}
