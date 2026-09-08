import {
  type MachineRouteParams,
  runMachineReadTools
} from '../../../../../lib/machine/assistantGmApi';

export async function GET(request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return runMachineReadTools({
    leagueId,
    capabilityId: 'rules.education.read',
    toolRequests: [{ tool: 'searchKnowledgeBase', leagueId, query }]
  });
}
