'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';

function playersBack(leagueId:string,position:string){
  return `/leagues/${leagueId}/players?position=${encodeURIComponent(position||'ALL')}`;
}

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

  const back = playersBack(leagueId,returnPosition);
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

export async function submitWaiverClaim(formData:FormData){
  const leagueId=String(formData.get('league_id')??'');
  const seasonFranchiseId=String(formData.get('season_franchise_id')??'');
  const holdId=String(formData.get('waiver_hold_id')??'');
  const dropRosterEntryId=String(formData.get('drop_roster_entry_id')??'')||null;
  const returnPosition=String(formData.get('position')??'ALL');
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  const back=playersBack(leagueId,returnPosition);
  if(!leagueId||!seasonFranchiseId||!holdId)redirect(`${back}&waiver_error=${encodeURIComponent('Choose a valid waiver player.')}`);
  const {error}=await supabase.rpc('submit_waiver_claim',{p_waiver_hold_id:holdId,p_season_franchise_id:seasonFranchiseId,p_drop_roster_entry_id:dropRosterEntryId});
  if(error)redirect(`${back}&waiver_error=${encodeURIComponent(error.message)}`);
  redirect(`${back}&waiver_status=claimed`);
}

export async function withdrawWaiverClaim(formData:FormData){
  const leagueId=String(formData.get('league_id')??'');
  const claimId=String(formData.get('waiver_claim_id')??'');
  const returnPosition=String(formData.get('position')??'ALL');
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  const back=playersBack(leagueId,returnPosition);
  if(!leagueId||!claimId)redirect(`${back}&waiver_error=${encodeURIComponent('Waiver claim not found.')}`);
  const {error}=await supabase.rpc('withdraw_waiver_claim',{p_waiver_claim_id:claimId});
  if(error)redirect(`${back}&waiver_error=${encodeURIComponent(error.message)}`);
  redirect(`${back}&waiver_status=withdrawn`);
}
