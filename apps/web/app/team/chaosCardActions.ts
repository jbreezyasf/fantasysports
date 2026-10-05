'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { chaosCardsEnabled } from '../../lib/matchups/chaosCards';

export type ChaosCardActionState = {
  status: 'idle' | 'success' | 'cleared' | 'error';
  /** Database error text when status is 'error'; otherwise empty. The client supplies the success wording. */
  message: string;
  assetLabel: string;
};

// The database decides: set_chaos_card_selection / clear_chaos_card_selection
// check the signed-in user, ownership, the card dealt, deadlines and kickoff locks.
export async function setChaosCardSelection(_previous: ChaosCardActionState, formData: FormData): Promise<ChaosCardActionState> {
  const assetLabel = String(formData.get('asset_label') ?? '');
  if (!chaosCardsEnabled()) return { status: 'error', message: 'Chaos Week rule cards are not enabled.', assetLabel };
  const intent = String(formData.get('intent') ?? 'set');
  const matchupId = String(formData.get('matchup_id') ?? '');
  const seasonFranchiseId = String(formData.get('season_franchise_id') ?? '');
  const franchiseId = String(formData.get('franchise_id') ?? '');
  const supabase = await createClient();

  if (intent === 'clear') {
    const { error } = await supabase.rpc('clear_chaos_card_selection', { p_matchup_id: matchupId, p_season_franchise_id: seasonFranchiseId });
    if (error) return { status: 'error', message: error.message, assetLabel };
    revalidatePath(`/franchises/${franchiseId}/team`);
    revalidatePath(`/matchups/${matchupId}`);
    return { status: 'cleared', message: '', assetLabel };
  }

  // One radio value carries the asset: "athlete:<uuid>" or "team:<uuid>".
  const [assetType, assetId] = String(formData.get('asset') ?? '').split(':');
  if (!assetId || (assetType !== 'athlete' && assetType !== 'team')) return { status: 'error', message: 'Choose a player first.', assetLabel };
  const chosenLabel = String(formData.get(`label:${assetType}:${assetId}`) ?? assetLabel);
  const { error } = await supabase.rpc('set_chaos_card_selection', {
    p_matchup_id: matchupId,
    p_season_franchise_id: seasonFranchiseId,
    p_card_code: String(formData.get('card_code') ?? ''),
    p_athlete_id: assetType === 'athlete' ? assetId : null,
    p_real_team_id: assetType === 'team' ? assetId : null,
  });
  if (error) return { status: 'error', message: error.message, assetLabel: chosenLabel };
  revalidatePath(`/franchises/${franchiseId}/team`);
  revalidatePath(`/matchups/${matchupId}`);
  return { status: 'success', message: '', assetLabel: chosenLabel };
}
