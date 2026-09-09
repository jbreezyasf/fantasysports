'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import { analyzeBetaFeedback } from '../../lib/beta-feedback/analyze';

const clean = (formData: FormData, name: string, max = 4000) => String(formData.get(name) ?? '').trim().slice(0, max);
const required = (formData: FormData, name: string, max = 4000) => {
  const value = clean(formData, name, max);
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

export async function submitBetaFeedback(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/beta-feedback');

  const { count: membershipCount, error: membershipError } = await supabase
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (membershipError || !membershipCount) redirect('/dashboard');

  const taskArea = required(formData, 'task_area', 50);
  const outcome = required(formData, 'outcome', 30) as 'easy_success' | 'confusing_success' | 'partial' | 'failed';
  const easeRating = Number(required(formData, 'ease_rating', 1));
  const npsScore = Number(required(formData, 'nps_score', 2));
  if (!Number.isInteger(easeRating) || easeRating < 1 || easeRating > 5) throw new Error('Invalid ease rating.');
  if (!Number.isInteger(npsScore) || npsScore < 0 || npsScore > 10) throw new Error('Invalid recommendation score.');

  const raw = {
    task_area: taskArea,
    outcome,
    ease_rating: easeRating,
    happened: required(formData, 'happened'),
    expected: required(formData, 'expected'),
    frustration: clean(formData, 'frustration') || null,
    liked: clean(formData, 'liked') || null,
    improvement: clean(formData, 'improvement') || null,
    missing_capability: clean(formData, 'missing_capability') || null,
    churn_risk: required(formData, 'churn_risk', 30) as 'definitely' | 'maybe' | 'probably_not' | 'no',
    disappointment: required(formData, 'disappointment', 30) as 'very' | 'somewhat' | 'not',
    nps_score: npsScore,
    page_path: clean(formData, 'page_path', 500) || null,
    client_context: { source: 'beta_feedback_lander', version: 1 },
  };

  const admin = createAdminClient();
  const { data: submission, error: insertError } = await admin
    .from('beta_feedback_submissions')
    .insert({ user_id: user.id, ...raw })
    .select('id')
    .single();
  if (insertError || !submission) throw new Error('Feedback could not be saved.');

  const analysis = analyzeBetaFeedback(raw);
  const { count: existingClusterCount } = await admin
    .from('beta_feedback_analysis')
    .select('id', { count: 'exact', head: true })
    .eq('cluster_key', analysis.cluster_key);

  const { error: analysisError } = await admin
    .from('beta_feedback_analysis')
    .insert({
      submission_id: submission.id,
      ...analysis,
      cluster_count: (existingClusterCount ?? 0) + 1,
    });
  if (analysisError) {
    // Raw feedback remains safely stored even if analysis fails; never delete user evidence.
    console.error('beta feedback analysis insert failed', { submissionId: submission.id, message: analysisError.message });
  }

  redirect('/beta-feedback?submitted=1');
}
