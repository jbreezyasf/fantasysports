import {
  type MachineRouteParams,
  runMachineReadTools
} from '../../../../../lib/machine/assistantGmApi';

export async function GET(_request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  return runMachineReadTools({
    leagueId,
    capabilityId: 'standings.read',
    toolRequests: [
      { tool: 'getLeague', leagueId },
      { tool: 'getStandings', leagueId }
    ]
  });
}
