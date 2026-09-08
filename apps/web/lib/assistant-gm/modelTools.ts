import { assistantGmToolContracts, type AssistantGmToolName } from './tools';

type JsonSchema = Record<string, unknown>;

const uuid = { type: 'string', format: 'uuid' };

export type AssistantGmModelToolDefinition = {
  type: 'function';
  name: AssistantGmToolName;
  description: string;
  input_schema: JsonSchema;
  safety: {
    writes: false;
    access: 'league_member' | 'owned_franchise' | 'league_member_or_participant';
    requiresGatewayPolicy: true;
  };
};

function schemaFor(tool: AssistantGmToolName): JsonSchema {
  const base: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['leagueId'],
    properties: { leagueId: uuid }
  };
  const properties = base.properties as Record<string, unknown>;
  if (['getRoster', 'getLineup', 'getWaiverState', 'getDraftQueue'].includes(tool)) properties.franchiseId = uuid;
  if (['getLineup'].includes(tool)) properties.week = { type: 'integer', minimum: 1, maximum: 18 };
  if (['getMatchup'].includes(tool)) {
    properties.matchupId = uuid;
    base.required = ['leagueId', 'matchupId'];
  }
  if (['getPlayerDetails', 'getInjuryStatus'].includes(tool)) {
    properties.athleteId = uuid;
    base.required = ['leagueId', 'athleteId'];
  }
  if (tool === 'comparePlayers') {
    properties.athleteIds = { type: 'array', minItems: 2, maxItems: 8, items: uuid };
    base.required = ['leagueId', 'athleteIds'];
  }
  if (['searchPlayers', 'getAvailablePlayers', 'searchKnowledgeBase'].includes(tool)) {
    properties.query = { type: 'string', maxLength: 120 };
    if (tool !== 'searchKnowledgeBase') properties.position = { type: 'string', maxLength: 16 };
  }
  if (['getDraftAvailablePlayers', 'getDraftQueue'].includes(tool)) {
    properties.draftId = uuid;
    base.required = ['leagueId', 'draftId'];
  }
  if (tool === 'getTradeContext') properties.tradeId = uuid;
  return base;
}

export const assistantGmModelTools: AssistantGmModelToolDefinition[] = Object.entries(assistantGmToolContracts).map(([name, contract]) => ({
  type: 'function',
  name: name as AssistantGmToolName,
  description: contract.description,
  input_schema: schemaFor(name as AssistantGmToolName),
  safety: {
    writes: false,
    access: contract.access,
    requiresGatewayPolicy: true
  }
}));

export function getAssistantGmModelTool(name: AssistantGmToolName) {
  return assistantGmModelTools.find(tool => tool.name === name) ?? null;
}
