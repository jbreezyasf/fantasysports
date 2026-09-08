import { describe, expect, it } from 'vitest';
import { searchAssistantGmKnowledgeBase } from './knowledgeRetrieval';

describe('Assistant GM knowledge retrieval', () => {
  it('retrieves sourced Big Exec rules from the local knowledge base', () => {
    const results = searchAssistantGmKnowledgeBase('late start league current scoring period kickoff', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      source: expect.stringContaining('docs/assistant-gm/knowledge-base'),
      score: expect.any(Number)
    });
    expect(results[0].excerpt.length).toBeGreaterThan(20);
  });
});
