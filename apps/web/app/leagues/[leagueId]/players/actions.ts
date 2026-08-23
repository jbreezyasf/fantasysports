'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';

export async function claimFreeAgent(formData: FormData) {
  const leagueId = String(formData.get('league_id') ?? '');
  const seasonFranchiseId = String(formData.get('season_franchise_id') ?? '');
  const athleteId = String(formData.get('athlete_id') ?? '') || null;
  const realTeamId = String(formData.get('real_team_id') ?? '') || null;
  const dropRosterEntryId = String(formData.get('drop_roster_entry_id') ?? '') || null;
  const returnPosition = String(formData.get('position') ?? 'ALL');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const back = `/leagues/${leagueId}/players?position=${encodeURIComponent(returnPosition)}`;
  if (!leagueId || !seasonFranchiseId || (!athleteId && !realTeamId)) {
    redirect(`${back}&transaction_error=${encodeURIComponent('Choose a valid free agent.')}`);
  }

  const { error } = await supabase.rpc('claim_free_agent', {
    p_season_franchise_id: seasonFranchiseId,
    p_athlete_id: athleteId,
    p_real_team_id: realTeamId,
    p_drop_roster_entry_id: dropRosterEntryId,
  });
  if (error) redirect(`${back}&transaction_error=${encodeURIComponent(error.message)}`);
  redirect(`${back}&transaction_status=added`);
}
