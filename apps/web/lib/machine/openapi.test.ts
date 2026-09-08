import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('machine OpenAPI contract', () => {
  it('publishes the beta machine API as a static OpenAPI file', () => {
    const spec = JSON.parse(readFileSync(join(process.cwd(), 'public/openapi.json'), 'utf8'));
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining([
      '/api/assistant-gm/tools',
      '/api/assistant-gm/run',
      '/api/leagues/{leagueId}/draft',
      '/api/leagues/{leagueId}/lineup',
      '/api/leagues/{leagueId}/knowledge',
      '/api/leagues/{leagueId}/schedule',
      '/api/leagues/{leagueId}/waivers'
    ]));
    expect(spec.paths['/api/assistant-gm/tools'].post.operationId).toBe('runAssistantGmReadTools');
  });
});
