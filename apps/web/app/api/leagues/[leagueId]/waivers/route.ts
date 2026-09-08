import {
  type MachineRouteParams,
  runMachineReadTools
} from '../../../../../lib/machine/assistantGmApi';

export async function GET(_request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  return runMachineReadTools({
    leagueId,
    capabilityId: 'waivers.read',
    toolRequests: [
      { tool: 'getWaiverRules', leagueId },
      { tool: 'getWaiverState', leagueId }
    ]
  });
}
