'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../../../../lib/supabase/server';

function settingsBack(leagueId:string,params:Record<string,string>={}){
  const query=new URLSearchParams(params);
  return `/leagues/${leagueId}/settings/roster-integrity${query.size?`?${query.toString()}`:''}`;
}

export async function updateRosterIntegritySettings(formData:FormData){
  const leagueId=String(formData.get('league_id')??'');
  const leagueSeasonId=String(formData.get('league_season_id')??'');
  const mode=String(formData.get('mode')??'automatic');
  const bulkDropLimit=Number(formData.get('bulk_drop_limit')??3);
  const bulkWindowHours=Number(formData.get('bulk_window_hours')??24);
  const protectCoreAssets=formData.get('protect_core_assets')==='on';
  const lockEliminated=formData.get('lock_eliminated')==='on';
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  if(!leagueId||!leagueSeasonId)redirect('/dashboard');
  const {error}=await supabase.rpc('update_roster_integrity_settings',{
    p_league_season_id:leagueSeasonId,
    p_mode:mode,
    p_bulk_drop_limit:bulkDropLimit,
    p_bulk_window_hours:bulkWindowHours,
    p_protect_core_assets:protectCoreAssets,
    p_lock_eliminated:lockEliminated,
  });
  if(error)redirect(settingsBack(leagueId,{error:error.message}));
  redirect(settingsBack(leagueId,{status:'saved'}));
}

export async function resolveRosterIntegrityReview(formData:FormData){
  const leagueId=String(formData.get('league_id')??'');
  const reviewId=String(formData.get('review_id')??'');
  const approve=String(formData.get('decision')??'')==='approve';
  const note=String(formData.get('note')??'');
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  if(!leagueId||!reviewId)redirect('/dashboard');
  const {error}=await supabase.rpc('resolve_roster_integrity_review',{
    p_review_id:reviewId,
    p_approve:approve,
    p_note:note||null,
  });
  if(error)redirect(settingsBack(leagueId,{error:error.message}));
  redirect(settingsBack(leagueId,{status:approve?'approved':'rejected'}));
}

export async function setFranchiseRosterLock(formData:FormData){
  const leagueId=String(formData.get('league_id')??'');
  const seasonFranchiseId=String(formData.get('season_franchise_id')??'');
  const locked=String(formData.get('locked')??'')==='true';
  const reason=String(formData.get('reason')??'Eliminated from Championship and Redemption competition');
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  if(!leagueId||!seasonFranchiseId)redirect('/dashboard');
  const {error}=await supabase.rpc('set_franchise_roster_lock',{
    p_season_franchise_id:seasonFranchiseId,
    p_locked:locked,
    p_reason:reason,
  });
  if(error)redirect(settingsBack(leagueId,{error:error.message}));
  redirect(settingsBack(leagueId,{status:locked?'locked':'unlocked'}));
}
