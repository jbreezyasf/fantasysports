import { NextResponse } from 'next/server';
import { assistantGmStructuredAnswerJsonSchema } from '../../../lib/assistant-gm/prompts';

export async function GET() {
  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: 'Big Exec Pro Football Machine API',
      version: '2026-09-08',
      description: 'Authenticated read-only machine surfaces over existing Big Exec beta operations.'
    },
    servers: [{ url: 'https://www.bigexecfs.com' }],
    paths: {
      '/api/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Read application health.',
          responses: { '200': { description: 'Health status.' } }
        }
      },
      '/api/capabilities': {
        get: {
          operationId: 'listCapabilities',
          summary: 'List Big Exec capabilities and Front Office Advisor tool contracts.',
          responses: { '200': { description: 'Capability inventory.' } }
        }
      },
      '/api/assistant-gm/tools': {
        post: {
          operationId: 'runAssistantGmReadTools',
          summary: 'Run declared read-only Front Office Advisor tools for the signed-in user.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssistantGmToolRunRequest' }
              }
            }
          },
          responses: {
            '200': { description: 'Tool responses.' },
            '400': { description: 'Invalid request.' },
            '401': { description: 'Not signed in.' },
            '403': { description: 'Policy denial.' }
          }
        }
      },
      '/api/assistant-gm/run': {
        post: {
          operationId: 'runAssistantGmAgentLoop',
          summary: 'Run a bounded, policy-gated Front Office Advisor read-tool loop for the signed-in user.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssistantGmAgentRunRequest' }
              }
            }
          },
          responses: {
            '200': { description: 'Completed bounded run.' },
            '400': { description: 'Invalid request.' },
            '401': { description: 'Not signed in.' },
            '403': { description: 'Policy denial.' }
          }
        }
      },
      '/api/leagues/{leagueId}/state': {
        get: {
          operationId: 'getLeagueState',
          summary: 'Read league metadata and standings for the signed-in member.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'League state.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/roster': {
        get: {
          operationId: 'getOwnedRoster',
          summary: 'Read the signed-in manager-owned roster.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Owned roster.' }, '401': { description: 'Not signed in.' }, '403': { description: 'No owned franchise.' } }
        }
      },
      '/api/leagues/{leagueId}/lineup': {
        get: {
          operationId: 'getOwnedLineup',
          summary: 'Read the signed-in manager-owned lineup for a week.',
          parameters: [
            { name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'week', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 18, default: 1 } }
          ],
          responses: { '200': { description: 'Owned lineup.' }, '401': { description: 'Not signed in.' }, '403': { description: 'No owned franchise.' } }
        }
      },
      '/api/leagues/{leagueId}/draft': {
        get: {
          operationId: 'getDraftState',
          summary: 'Read current draft status and picks.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Draft state.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/draft/available': {
        get: {
          operationId: 'getDraftAvailablePlayers',
          summary: 'Read current draft-available rankings.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Available draft rankings.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' }, '404': { description: 'Current draft not found.' } }
        }
      },
      '/api/leagues/{leagueId}/waivers': {
        get: {
          operationId: 'getWaiverDesk',
          summary: 'Read waiver rules, open holds, and requester claims.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Waiver state.' }, '401': { description: 'Not signed in.' }, '403': { description: 'No owned franchise.' } }
        }
      },
      '/api/leagues/{leagueId}/players': {
        get: {
          operationId: 'searchLeaguePlayers',
          summary: 'Search eligible players with roster availability state.',
          parameters: [
            { name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'position', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'available', in: 'query', required: false, schema: { type: 'boolean', default: false } }
          ],
          responses: { '200': { description: 'Player search results.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/players/{athleteId}': {
        get: {
          operationId: 'getPlayerDetails',
          summary: 'Read one fantasy-eligible player profile and availability state.',
          parameters: [
            { name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'athleteId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: { '200': { description: 'Player detail.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' }, '404': { description: 'Player not found.' } }
        }
      },
      '/api/leagues/{leagueId}/matchups/{matchupId}': {
        get: {
          operationId: 'getMatchupState',
          summary: 'Read a league matchup and lineup state.',
          parameters: [
            { name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'matchupId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: { '200': { description: 'Matchup state.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member or participant.' }, '404': { description: 'Matchup not found.' } }
        }
      },
      '/api/leagues/{leagueId}/trades': {
        get: {
          operationId: 'getTradeContext',
          summary: 'Read current league trade context.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Trade context.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/history': {
        get: {
          operationId: 'getLeagueHistory',
          summary: 'Read current league history, awards, championships, and story events.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'League history.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/schedule': {
        get: {
          operationId: 'getLeagueSchedule',
          summary: 'Read fantasy matchups and real games for a league week.',
          parameters: [
            { name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'week', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 18, default: 1 } }
          ],
          responses: { '200': { description: 'League schedule.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/entitlement': {
        get: {
          operationId: 'getLeagueEntitlement',
          summary: 'Read current league-season entitlement mode.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Entitlement state.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/knowledge': {
        get: {
          operationId: 'searchBigExecKnowledge',
          summary: 'Search sourced Big Exec Front Office Advisor knowledge-base documents.',
          parameters: [
            { name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 3, maxLength: 120 } }
          ],
          responses: { '200': { description: 'Sourced knowledge-base results.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Not a league member.' } }
        }
      },
      '/api/leagues/{leagueId}/invitations': {
        get: {
          operationId: 'getInvitationState',
          summary: 'Read commissioner-only invitation state.',
          parameters: [{ name: 'leagueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Invitation state.' }, '401': { description: 'Not signed in.' }, '403': { description: 'Commissioner access required.' } }
        }
      }
    },
    components: {
      schemas: {
        AssistantGmStructuredAnswer: assistantGmStructuredAnswerJsonSchema,
        AssistantGmToolRunRequest: {
          type: 'object',
          required: ['leagueId', 'capabilityId', 'audience', 'toolRequests'],
          additionalProperties: false,
          properties: {
            leagueId: { type: 'string', format: 'uuid' },
            capabilityId: { type: 'string' },
            audience: { enum: ['league_member', 'manager', 'commissioner', 'ops_staff'] },
            toolRequests: {
              type: 'array',
              minItems: 1,
              maxItems: 8,
              items: {
                type: 'object',
                required: ['tool', 'leagueId'],
                additionalProperties: true,
                properties: {
                  tool: { type: 'string' },
                  leagueId: { type: 'string', format: 'uuid' },
                  franchiseId: { type: 'string', format: 'uuid' },
                  draftId: { type: 'string', format: 'uuid' },
                  matchupId: { type: 'string', format: 'uuid' },
                  athleteId: { type: 'string', format: 'uuid' },
                  athleteIds: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 8 },
                  tradeId: { type: 'string', format: 'uuid' },
                  position: { type: 'string' },
                  query: { type: 'string' },
                  week: { type: 'integer', minimum: 1, maximum: 18 }
                }
              }
            }
          }
        },
        AssistantGmAgentRunRequest: {
          type: 'object',
          required: ['leagueId', 'capabilityId', 'audience', 'steps'],
          additionalProperties: false,
          properties: {
            leagueId: { type: 'string', format: 'uuid' },
            capabilityId: { type: 'string' },
            audience: { enum: ['league_member', 'manager', 'commissioner', 'ops_staff'] },
            maxSteps: { type: 'integer', minimum: 1, maximum: 8, default: 4 },
            steps: {
              type: 'array',
              minItems: 1,
              maxItems: 8,
              items: {
                type: 'object',
                required: ['toolRequests'],
                additionalProperties: false,
                properties: {
                  reason: { type: 'string', maxLength: 160 },
                  toolRequests: { $ref: '#/components/schemas/AssistantGmToolRunRequest/properties/toolRequests' }
                }
              }
            }
          }
        }
      }
    }
  });
}
