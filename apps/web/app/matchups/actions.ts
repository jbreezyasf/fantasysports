'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export async function refreshMatchup(formData: FormData) {
  const supabase = await createClient();
  const matchupId = String(formData.get('matchup_id') ?? '');
  const { error } = await supabase.rpc('recompute_matchup', { p_matchup_id: matchupId, p_finalize: false });
  if (error) redirect(`/matchups/${matchupId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/matchups/${matchupId}`);
  redirect(`/matchups/${matchupId}`);
}

export async function finalizeMatchup(formData: FormData) {
  const supabase = await createClient();
  const matchupId = String(formData.get('matchup_id') ?? '');
  const { error } = await supabase.rpc('recompute_matchup', { p_matchup_id: matchupId, p_finalize: true });
  if (error) redirect(`/matchups/${matchupId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/matchups/${matchupId}`);
  redirect(`/matchups/${matchupId}?finalized=1`);
}
