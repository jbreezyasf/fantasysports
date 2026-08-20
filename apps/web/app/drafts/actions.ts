'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export async function initializeDraft(formData: FormData) {
  const supabase = await createClient();
  const leagueId = String(formData.get('league_id') ?? '');
  const pickSeconds = Number(formData.get('pick_seconds') ?? 90);
  const startsAtRaw = String(formData.get('starts_at') ?? '');
  const { data, error } = await supabase.rpc('initialize_snake_draft', {
    p_league_id: leagueId,
    p_pick_seconds: pickSeconds,
    p_starts_at: startsAtRaw ? new Date(startsAtRaw).toISOString() : null
  });
  if (error) redirect(`/leagues/${leagueId}?draft_error=${encodeURIComponent(error.message)}`);
  const result = data as { draft_id: string };
  redirect(`/drafts/${result.draft_id}`);
}

export async function startDraft(formData: FormData) {
  const supabase = await createClient();
  const draftId = String(formData.get('draft_id') ?? '');
  const { error } = await supabase.rpc('start_draft', { p_draft_id: draftId });
  if (error) redirect(`/drafts/${draftId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/drafts/${draftId}`);
  redirect(`/drafts/${draftId}`);
}

export async function makeDraftPick(formData: FormData) {
  const supabase = await createClient();
  const draftId = String(formData.get('draft_id') ?? '');
  const athleteId = String(formData.get('athlete_id') ?? '');
  const realTeamId = String(formData.get('real_team_id') ?? '');
  const { error } = await supabase.rpc('make_draft_pick', {
    p_draft_id: draftId,
    p_athlete_id: athleteId || null,
    p_real_team_id: realTeamId || null,
    p_auto: false
  });
  if (error) redirect(`/drafts/${draftId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/drafts/${draftId}`);
  redirect(`/drafts/${draftId}`);
}
