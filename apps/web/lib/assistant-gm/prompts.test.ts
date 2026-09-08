import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_GM_SYSTEM_PROMPT_ID,
  assistantGmStructuredAnswerJsonSchema,
  assistantGmSystemPrompt
} from './prompts';

describe('Assistant GM prompt contract', () => {
  it('keeps fantasy truth authoritative and write actions confirmed', () => {
    expect(ASSISTANT_GM_SYSTEM_PROMPT_ID).toContain('readonly');
    expect(assistantGmSystemPrompt).toContain('Fantasy Core and Supabase state are authoritative');
    expect(assistantGmSystemPrompt).toContain('must not invent official outcomes');
    expect(assistantGmSystemPrompt).toContain('require explicit UI confirmation');
  });

  it('publishes a structured output schema for model-backed answers', () => {
    expect(assistantGmStructuredAnswerJsonSchema.properties.category.enum).toContain('authoritative_fact');
    expect(assistantGmStructuredAnswerJsonSchema.required).toEqual([
      'schemaVersion',
      'category',
      'evidenceSource',
      'answer'
    ]);
    expect(assistantGmStructuredAnswerJsonSchema.additionalProperties).toBe(false);
  });
});
