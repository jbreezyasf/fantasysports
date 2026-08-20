'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export async function setLineup(formData: FormData) {
  const supabase = await createClient();
  const seasonFranchiseId = String(formData.get('season_franchise_id') ?? '');
  const franchiseId = String(formData.get('franchise_id') ?? '');
  const week = Number(formData.get('week') ?? 1);
  const slot = String(formData.get('slot') ?? 'BENCH');
  const slotIndex = Number(formData.get('slot_index') ?? 1);
  const athleteId = String(formData.get('athlete_id') ?? '');
  const realTeamId = String(formData.get('real_team_id') ?? '');

  const { error } = await supabase.rpc('set_lineup_slot', {
    p_season_franchise_id: seasonFranchiseId,
    p_week: week,
    p_slot: slot,
    p_slot_index: slotIndex,
    p_athlete_id: athleteId || null,
    p_real_team_id: realTeamId || null
  });
  if (error) redirect(`/franchises/${franchiseId}/team?week=${week}&error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/franchises/${franchiseId}/team`);
  redirect(`/franchises/${franchiseId}/team?week=${week}`);
}
