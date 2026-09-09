'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { isBetaFeedbackAdmin } from '../../../lib/beta-feedback/adminAuth';

const REVIEW_STATUSES = new Set(['approved','denied','deferred','investigate']);

async function requireOwnerAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/beta-feedback');
  if (!isBetaFeedbackAdmin(user.email)) redirect('/dashboard');
  return user;
}

export async function reviewBetaFeedback(formData: FormData) {
  const user = await requireOwnerAdmin();
  const analysisId = String(formData.get('analysis_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000) || null;
  if (!analysisId || !REVIEW_STATUSES.has(status)) throw new Error('Invalid feedback review action.');

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from('beta_feedback_analysis')
    .select('review_status')
    .eq('id', analysisId)
    .single();
  if (currentError || !current) throw new Error('Feedback analysis was not found.');

  const { error: updateError } = await admin
    .from('beta_feedback_analysis')
    .update({ review_status: status, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', analysisId);
  if (updateError) throw new Error('Feedback review could not be saved.');

  const { error: eventError } = await admin.from('beta_feedback_review_events').insert({
    analysis_id: analysisId,
    actor_user_id: user.id,
    previous_status: current.review_status,
    new_status: status,
    note,
  });
  if (eventError) throw new Error('Feedback review history could not be saved.');

  revalidatePath('/admin/beta-feedback');
}

export async function routeFeedbackToSupport(formData: FormData) {
  await requireOwnerAdmin();
  const analysisId = String(formData.get('analysis_id') ?? '').trim();
  const disposition = String(formData.get('support_disposition') ?? '').trim();
  if (!analysisId || !['none','send_to_support','resolved'].includes(disposition)) throw new Error('Invalid support routing action.');

  const admin = createAdminClient();
  const { error } = await admin
    .from('beta_feedback_analysis')
    .update({ support_disposition: disposition })
    .eq('id', analysisId);
  if (error) throw new Error('Support routing could not be saved.');
  revalidatePath('/admin/beta-feedback');
}
