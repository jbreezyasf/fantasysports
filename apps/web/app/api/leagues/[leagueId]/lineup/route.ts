import {
  type MachineRouteParams,
  runMachineReadTools,
  weekFromRequest
} from '../../../../../lib/machine/assistantGmApi';

export async function GET(request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  return runMachineReadTools({
    leagueId,
    capabilityId: 'lineup.read',
    toolRequests: [{ tool: 'getLineup', leagueId, week: weekFromRequest(request) }]
  });
}
