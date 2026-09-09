export type FeedbackCategory =
  | 'bug'
  | 'ux_confusion'
  | 'accessibility'
  | 'performance'
  | 'missing_feature'
  | 'feature_request'
  | 'data_scoring'
  | 'assistant_gm'
  | 'positive'
  | 'other';

export type RawFeedback = {
  task_area: string;
  outcome: 'easy_success' | 'confusing_success' | 'partial' | 'failed';
  ease_rating: number;
  happened: string;
  expected: string;
  frustration?: string | null;
  liked?: string | null;
  improvement?: string | null;
  missing_capability?: string | null;
  churn_risk: 'definitely' | 'maybe' | 'probably_not' | 'no';
  disappointment: 'very' | 'somewhat' | 'not';
  nps_score: number;
};

export type FeedbackAnalysis = {
  category: FeedbackCategory;
  problem_statement: string;
  user_requested_solution: string | null;
  proposed_action: string;
  severity: number;
  churn_risk_score: number;
  confidence: number;
  feature_candidate: boolean;
  cluster_key: string;
  implementation_proposal: Record<string, unknown> | null;
  support_recommended: boolean;
  support_reason: string | null;
  support_summary: string | null;
  support_response_draft: string | null;
  support_disposition: 'none' | 'recommended';
  analysis_version: 'heuristic-v1';
};

const normalize = (value?: string | null) => (value ?? '').toLowerCase();
const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

export function analyzeBetaFeedback(input: RawFeedback): FeedbackAnalysis {
  const text = [
    input.happened,
    input.expected,
    input.frustration,
    input.improvement,
    input.missing_capability,
  ].map(normalize).join(' ');

  let category: FeedbackCategory = 'other';
  let confidence = 0.62;

  if (input.task_area === 'accessibility' || hasAny(text, ['screen reader','voiceover','talkback','low vision','blind','keyboard','focus','contrast','accessible','accessibility'])) {
    category = 'accessibility'; confidence = 0.92;
  } else if (input.task_area === 'assistant_gm' || hasAny(text, ['assistant gm','ask gm','coach','voice assistant','gm'])) {
    category = 'assistant_gm'; confidence = 0.88;
  } else if (hasAny(text, ['score wrong','scoring wrong','points wrong','stat wrong','standings wrong','record wrong','data wrong'])) {
    category = 'data_scoring'; confidence = 0.9;
  } else if (hasAny(text, ['slow','lag','loading','froze','freeze','timeout','took forever'])) {
    category = 'performance'; confidence = 0.86;
  } else if (input.missing_capability?.trim()) {
    category = 'missing_feature'; confidence = 0.86;
  } else if (input.outcome === 'failed' || hasAny(text, ['error','broken','did not work','didn\'t work','cannot','can\'t','failed'])) {
    category = 'bug'; confidence = 0.82;
  } else if (input.outcome === 'confusing_success' || input.outcome === 'partial' || input.ease_rating <= 2 || hasAny(text, ['confusing','couldn\'t find','hard to find','unclear','didn\'t know where'])) {
    category = 'ux_confusion'; confidence = 0.84;
  } else if (input.improvement?.trim()) {
    category = 'feature_request'; confidence = 0.72;
  } else if (input.outcome === 'easy_success' && input.ease_rating >= 4 && input.liked?.trim()) {
    category = 'positive'; confidence = 0.8;
  }

  const churnMap = { definitely: 5, maybe: 4, probably_not: 2, no: 1 } as const;
  const churnRisk = churnMap[input.churn_risk];
  let severity = 1;
  if (input.outcome === 'failed') severity += 2;
  else if (input.outcome === 'partial') severity += 1;
  if (input.ease_rating <= 2) severity += 1;
  if (churnRisk >= 4) severity += 1;
  if (category === 'accessibility' || category === 'data_scoring') severity = Math.max(severity, 4);
  severity = Math.min(5, severity);

  const problem = input.frustration?.trim() || input.happened.trim();
  const requested = input.improvement?.trim() || input.missing_capability?.trim() || null;
  const taskLabel = input.task_area.replaceAll('_', ' ');
  const clusterKey = `${category}:${input.task_area}`;
  const featureCandidate = category === 'missing_feature' || category === 'feature_request';

  let proposedAction = `Review the ${taskLabel} flow against the user's expected result and reproduce the reported behavior before changing product code.`;
  if (category === 'ux_confusion') proposedAction = `Review discoverability and instructions in the ${taskLabel} flow; solve the underlying navigation or clarity problem rather than automatically implementing the user's suggested UI.`;
  if (category === 'bug') proposedAction = `Reproduce the reported ${taskLabel} failure, identify the root cause, and prepare a bounded fix only after the defect is proven.`;
  if (category === 'accessibility') proposedAction = `Run the affected ${taskLabel} path against Big Exec accessibility acceptance criteria and prioritize any proven barrier to completing core fantasy play.`;
  if (category === 'performance') proposedAction = `Measure the affected ${taskLabel} path before optimization and compare latency/error evidence with the report.`;
  if (category === 'data_scoring') proposedAction = `Validate the report against Fantasy Core authoritative data and deterministic scoring rules before proposing any scoring change.`;
  if (category === 'assistant_gm') proposedAction = `Check Assistant GM transcript/tool behavior against authoritative league state and the knowledge base; do not let model output alter fantasy truth.`;
  if (featureCandidate) proposedAction = `Validate how many managers share this unmet need, confirm it fits the canonical product, and prepare a feature proposal for owner approval rather than creating an implementation task automatically.`;
  if (category === 'positive') proposedAction = `Preserve the successful ${taskLabel} behavior and use this feedback as evidence against unnecessary redesign.`;

  const implementationProposal = featureCandidate ? {
    state: 'proposal_only',
    problem,
    user_requested_solution: requested,
    validation_required: true,
    product_owner_approval_required: true,
    auto_deploy: false,
  } : null;

  const supportRecommended = input.outcome === 'failed' || category === 'accessibility' || category === 'data_scoring' || category === 'assistant_gm' || churnRisk >= 4;
  const supportReason = supportRecommended
    ? `This report may need a direct customer response because it is ${category.replaceAll('_',' ')}, has outcome ${input.outcome.replaceAll('_',' ')}, or carries elevated churn risk.`
    : null;
  const supportSummary = supportRecommended
    ? `Player reported a ${taskLabel} problem. Reported result: ${input.outcome.replaceAll('_',' ')}. Core issue: ${problem}`.slice(0, 1200)
    : null;
  const supportResponseDraft = supportRecommended
    ? `Thanks for reporting this. We have your feedback about the ${taskLabel} experience. We are reviewing what happened and comparing it with the result you expected. We will not assume the cause until we verify it. If this affects your ability to keep playing, our support team should treat it as a priority.`
    : null;

  return {
    category,
    problem_statement: problem.slice(0, 1200),
    user_requested_solution: requested?.slice(0, 1200) ?? null,
    proposed_action: proposedAction,
    severity,
    churn_risk_score: churnRisk,
    confidence,
    feature_candidate: featureCandidate,
    cluster_key: clusterKey,
    implementation_proposal: implementationProposal,
    support_recommended: supportRecommended,
    support_reason: supportReason,
    support_summary: supportSummary,
    support_response_draft: supportResponseDraft,
    support_disposition: supportRecommended ? 'recommended' : 'none',
    analysis_version: 'heuristic-v1',
  };
}
