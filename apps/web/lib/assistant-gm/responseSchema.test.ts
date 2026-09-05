import { describe, expect, it } from 'vitest';
import {
  assistantGmCategoryLabels,
  categoryForToolOnlyAnswer,
  createAssistantGmStructuredResult
} from './responseSchema';

describe('Assistant GM response schema', () => {
  it('defines visible and spoken labels for every response category', () => {
    expect(Object.keys(assistantGmCategoryLabels)).toEqual([
      'authoritative_fact',
      'projection',
      'recommendation',
      'explanation',
      'unsupported'
    ]);
    expect(Object.values(assistantGmCategoryLabels).every(label => label.spokenPrefix && label.uiLabel)).toBe(true);
  });

  it('creates structured results that keep category and source explicit', () => {
    expect(createAssistantGmStructuredResult({
      category: 'projection',
      source: 'model_projection',
      data: { points: 18.4 }
    })).toEqual({
      category: 'projection',
      source: 'model_projection',
      data: { points: 18.4 },
      spokenPrefix: 'Projection:',
      uiLabel: 'Projection'
    });
  });

  it('classifies deterministic tool-only responses without overclaiming recommendations', () => {
    expect(categoryForToolOnlyAnswer()).toBe('authoritative_fact');
    expect(categoryForToolOnlyAnswer(true)).toBe('projection');
    expect(categoryForToolOnlyAnswer(true, true)).toBe('recommendation');
  });
});

