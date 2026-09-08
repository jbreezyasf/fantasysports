import { describe, expect, it } from 'vitest';
import { assistantGmModelTools, getAssistantGmModelTool } from './modelTools';
import { assistantGmToolContracts } from './tools';

describe('Assistant GM model tool definitions', () => {
  it('publishes one function tool schema for every declared Assistant GM tool', () => {
    expect(assistantGmModelTools).toHaveLength(Object.keys(assistantGmToolContracts).length);
    expect(assistantGmModelTools.length).toBeGreaterThanOrEqual(8);
    expect(assistantGmModelTools.every(tool => tool.type === 'function')).toBe(true);
    expect(assistantGmModelTools.every(tool => tool.safety.writes === false)).toBe(true);
  });

  it('marks identifier requirements for tools that need them', () => {
    expect(getAssistantGmModelTool('getMatchup')?.input_schema.required).toEqual(['leagueId', 'matchupId']);
    expect(getAssistantGmModelTool('comparePlayers')?.input_schema.required).toEqual(['leagueId', 'athleteIds']);
  });
});
