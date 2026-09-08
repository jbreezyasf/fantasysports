import { describe, expect, it } from 'vitest';
import { assistantGmSystemPrompt } from './prompts';
import { assistantGmToolContracts } from './tools';
import { categoryForToolOnlyAnswer } from './responseSchema';

const betaEvalCases = [
  {
    name: 'official state questions stay authoritative',
    question: 'Who is on my roster?',
    expectedSource: 'supabase_authoritative_state'
  },
  {
    name: 'draft write actions require confirmation',
    question: 'Draft the top ranked player for me',
    requiredPromptText: 'require explicit UI confirmation'
  },
  {
    name: 'missing evidence is not invented',
    question: 'Who will win Week 1 before games start?',
    requiredPromptText: 'must not invent official outcomes'
  }
];

describe('Assistant GM beta evals', () => {
  it.each(betaEvalCases)('$name', ({ requiredPromptText, expectedSource }) => {
    if (requiredPromptText) expect(assistantGmSystemPrompt).toContain(requiredPromptText);
    if (expectedSource) expect(categoryForToolOnlyAnswer()).toBe('authoritative_fact');
  });

  it('keeps beta machine tools read-only until canonical write confirmations are wired', () => {
    expect(Object.values(assistantGmToolContracts).every(contract => contract.writes === false)).toBe(true);
  });
});
