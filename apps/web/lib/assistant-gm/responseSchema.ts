export type AssistantGmResponseCategory =
  | 'authoritative_fact'
  | 'projection'
  | 'recommendation'
  | 'explanation'
  | 'unsupported';

export type AssistantGmEvidenceSource =
  | 'supabase_authoritative_state'
  | 'fantasy_core'
  | 'assistant_gm_policy'
  | 'model_projection'
  | 'static_knowledge_base'
  | 'unavailable';

export type AssistantGmStructuredResult<T = unknown> = {
  category: AssistantGmResponseCategory;
  source: AssistantGmEvidenceSource;
  data: T;
  spokenPrefix: string;
  uiLabel: string;
};

export const assistantGmCategoryLabels: Record<AssistantGmResponseCategory, { spokenPrefix: string; uiLabel: string }> = {
  authoritative_fact: { spokenPrefix: 'Official Big Exec state:', uiLabel: 'Fact' },
  projection: { spokenPrefix: 'Projection:', uiLabel: 'Projection' },
  recommendation: { spokenPrefix: 'Recommendation:', uiLabel: 'Recommendation' },
  explanation: { spokenPrefix: 'Explanation:', uiLabel: 'Explanation' },
  unsupported: { spokenPrefix: 'Unavailable:', uiLabel: 'Unavailable' }
};

export function createAssistantGmStructuredResult<T>(input: {
  category: AssistantGmResponseCategory;
  source: AssistantGmEvidenceSource;
  data: T;
}): AssistantGmStructuredResult<T> {
  const labels = assistantGmCategoryLabels[input.category];
  return {
    category: input.category,
    source: input.source,
    data: input.data,
    spokenPrefix: labels.spokenPrefix,
    uiLabel: labels.uiLabel
  };
}

export function categoryForToolOnlyAnswer(hasProjection = false, hasRecommendation = false): AssistantGmResponseCategory {
  if (hasRecommendation) return 'recommendation';
  if (hasProjection) return 'projection';
  return 'authoritative_fact';
}

