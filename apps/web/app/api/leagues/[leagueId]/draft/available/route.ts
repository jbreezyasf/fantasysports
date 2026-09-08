import {
  currentDraftId,
  invalidMachineRequest,
  type MachineRouteParams,
  runMachineReadTools
} from '../../../../../../lib/machine/assistantGmApi';

export async function GET(_request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  const draftId = await currentDraftId(leagueId);
  if (!draftId) return invalidMachineRequest('Current league draft not found.', 404);
  return runMachineReadTools({
    leagueId,
    capabilityId: 'draft.read',
    toolRequests: [{ tool: 'getDraftAvailablePlayers', leagueId, draftId }]
  });
}
