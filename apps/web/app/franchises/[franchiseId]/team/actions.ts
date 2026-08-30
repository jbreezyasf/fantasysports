'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';

export async function requestRosterIntegrityReview(formData:FormData){
  const franchiseId=String(formData.get('franchise_id')??'');
  const rosterEntryId=String(formData.get('roster_entry_id')??'');
  const week=String(formData.get('week')??'1');
  const note=String(formData.get('manager_note')??'');
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  if(!franchiseId||!rosterEntryId)redirect('/dashboard');
  const {error}=await supabase.rpc('request_roster_integrity_review',{
    p_roster_entry_id:rosterEntryId,
    p_manager_note:note||null,
  });
  const base=`/franchises/${franchiseId}/team?week=${encodeURIComponent(week)}`;
  if(error)redirect(`${base}&integrity_error=${encodeURIComponent(error.message)}`);
  redirect(`${base}&integrity_status=requested`);
}
