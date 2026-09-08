import {
  type MachineRouteParams,
  runMachineReadTools
} from '../../../../../lib/machine/assistantGmApi';

export async function GET(request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  const params = new URL(request.url).searchParams;
  const query = params.get('q') ?? undefined;
  const position = params.get('position') ?? undefined;
  const availableOnly = params.get('available') === 'true';
  return runMachineReadTools({
    leagueId,
    capabilityId: 'players.search.read',
    toolRequests: [{ tool: availableOnly ? 'getAvailablePlayers' : 'searchPlayers', leagueId, query, position }]
  });
}
