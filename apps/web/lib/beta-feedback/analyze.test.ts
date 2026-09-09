import { describe, expect, it } from 'vitest';
import { analyzeBetaFeedback } from './analyze';

const base = {
  task_area: 'lineup',
  outcome: 'easy_success' as const,
  ease_rating: 5,
  happened: 'I changed my starter and it saved.',
  expected: 'I expected the starter to change.',
  frustration: null,
  liked: 'It was fast.',
  improvement: null,
  missing_capability: null,
  churn_risk: 'no' as const,
  disappointment: 'very' as const,
  nps_score: 9,
};

describe('analyzeBetaFeedback', () => {
  it('preserves successful behavior as positive evidence', () => {
    const result = analyzeBetaFeedback(base);
    expect(result.category).toBe('positive');
    expect(result.feature_candidate).toBe(false);
    expect(result.support_recommended).toBe(false);
    expect(result.implementation_proposal).toBeNull();
  });

  it('treats a failed flow as a bug candidate and recommends support', () => {
    const result = analyzeBetaFeedback({
      ...base,
      task_area: 'draft',
      outcome: 'failed',
      ease_rating: 1,
      happened: 'The draft button did not work and I could not make my pick.',
      expected: 'My player should have been drafted.',
      liked: null,
      churn_risk: 'definitely',
    });
    expect(result.category).toBe('bug');
    expect(result.severity).toBe(5);
    expect(result.support_recommended).toBe(true);
    expect(result.support_disposition).toBe('recommended');
  });

  it('does not turn a user suggested feature into an approved implementation', () => {
    const result = analyzeBetaFeedback({
      ...base,
      improvement: 'Add a giant button on the home page.',
      missing_capability: 'I could not find a faster lineup shortcut.',
    });
    expect(result.category).toBe('missing_feature');
    expect(result.feature_candidate).toBe(true);
    expect(result.implementation_proposal).toMatchObject({
      state: 'proposal_only',
      validation_required: true,
      product_owner_approval_required: true,
      auto_deploy: false,
    });
  });

  it('raises accessibility reports even if the user completed the task', () => {
    const result = analyzeBetaFeedback({
      ...base,
      task_area: 'accessibility',
      happened: 'I finished but keyboard focus was hard to follow.',
      frustration: 'Keyboard focus disappeared.',
    });
    expect(result.category).toBe('accessibility');
    expect(result.severity).toBeGreaterThanOrEqual(4);
    expect(result.support_recommended).toBe(true);
  });
});
