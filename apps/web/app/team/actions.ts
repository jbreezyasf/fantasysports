'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export type LineupActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export async function setLineup(_previousState: LineupActionState, formData: FormData): Promise<LineupActionState> {
  const supabase = await createClient();
  const seasonFranchiseId = String(formData.get('season_franchise_id') ?? '');
  const franchiseId = String(formData.get('franchise_id') ?? '');
  const week = Number(formData.get('week') ?? 1);
  const slot = String(formData.get('slot') ?? 'BENCH');
  const slotIndex = Number(formData.get('slot_index') ?? 1);
  const athleteId = String(formData.get('athlete_id') ?? '');
  const realTeamId = String(formData.get('real_team_id') ?? '');
  const slotLabel = String(formData.get('slot_label') ?? slot);
  const assetLabel = String(formData.get('asset_label') ?? 'Selected player');

  const { error } = await supabase.rpc('set_lineup_slot', {
    p_season_franchise_id: seasonFranchiseId,
    p_week: week,
    p_slot: slot,
    p_slot_index: slotIndex,
    p_athlete_id: athleteId || null,
    p_real_team_id: realTeamId || null
  });
  if (error) return { status: 'error', message: error.message };
  revalidatePath(`/franchises/${franchiseId}/team`);
  if (!athleteId && !realTeamId) {
    return { status: 'success', message: `${assetLabel} moved to the bench for week ${week}.` };
  }
  return { status: 'success', message: `${assetLabel} moved to ${slotLabel} for week ${week}.` };
}
