import {
  type MachineRouteParams,
  runMachineReadTools
} from '../../../../../lib/machine/assistantGmApi';

export async function GET(_request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  return runMachineReadTools({
    leagueId,
    capabilityId: 'draft.read',
    toolRequests: [{ tool: 'getDraftState', leagueId }]
  });
}
