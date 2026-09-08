import { describe, expect, it } from 'vitest';
import {
  buildPostgameTalkPrompt,
  parsePostgameTalkOptions,
  postgameTalkPromptId,
  postgameTalkStructuredOutputSchema
} from './postgameTalk';

const facts = {
  week: 1,
  homeName: 'Home Office',
  awayName: 'Away Desk',
  homePoints: 121.5,
  awayPoints: 118,
  winnerName: 'Home Office',
  loserName: 'Away Desk',
  margin: 3.5,
  requesterWon: true
};

describe('postgame talk structured AI contract', () => {
  it('keeps a versioned prompt and strict structured output schema', () => {
    expect(postgameTalkPromptId).toContain('structured');
    expect(postgameTalkStructuredOutputSchema.additionalProperties).toBe(false);
    expect(postgameTalkStructuredOutputSchema.properties.options.minItems).toBe(3);
    expect(postgameTalkStructuredOutputSchema.properties.options.maxItems).toBe(3);
  });

  it('pins immutable facts and anti-invention rules in the prompt', () => {
    const prompt = buildPostgameTalkPrompt('playful', facts);
    expect(prompt).toContain('"home_points":121.5');
    expect(prompt).toContain('Never invent scores');
    expect(prompt).toContain('private trade information');
  });

  it('parses schema-shaped output and legacy array output for fallback compatibility', () => {
    expect(parsePostgameTalkOptions(JSON.stringify({ options: ['One', 'Two', 'Three'] }))).toEqual(['One', 'Two', 'Three']);
    expect(parsePostgameTalkOptions(JSON.stringify(['One', 'Two', 'Three']))).toEqual(['One', 'Two', 'Three']);
  });
});
