'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export async function createLeague(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase.rpc('create_pro_football_league', {
    p_name: String(formData.get('league_name') ?? ''),
    p_franchise_name: String(formData.get('franchise_name') ?? ''),
    p_abbreviation: String(formData.get('abbreviation') ?? ''),
    p_primary_color: String(formData.get('primary_color') ?? '#E9FF70'),
    p_secondary_color: String(formData.get('secondary_color') ?? '#0B0C0F')
  });

  if (error) redirect('/leagues/new?error=' + encodeURIComponent(error.message));
  const result = data as { league_id: string };
  redirect(`/leagues/${result.league_id}`);
}

export async function createLeagueInvite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const leagueId = String(formData.get('league_id') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const { data, error } = await supabase.rpc('create_league_invite', {
    p_league_id: leagueId,
    p_email: email
  });

  if (error) redirect(`/leagues/${leagueId}?invite_error=` + encodeURIComponent(error.message));
  const invite = data as { invite_token: string };
  revalidatePath(`/leagues/${leagueId}`);
  redirect(`/leagues/${leagueId}?invite_created=1&invite_token=${invite.invite_token}&invite_email=${encodeURIComponent(email)}`);
}

export async function acceptLeagueInvite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = String(formData.get('invite_token') ?? '');
  if (!user) redirect(`/login?message=${encodeURIComponent('Sign in or create an account to claim your league invite.')}&next=${encodeURIComponent(`/invite/${token}`)}`);

  const { data, error } = await supabase.rpc('accept_league_invite', {
    p_invite_token: token,
    p_franchise_name: String(formData.get('franchise_name') ?? ''),
    p_abbreviation: String(formData.get('abbreviation') ?? ''),
    p_primary_color: String(formData.get('primary_color') ?? '#E9FF70'),
    p_secondary_color: String(formData.get('secondary_color') ?? '#0B0C0F')
  });

  if (error) redirect(`/invite/${token}?error=` + encodeURIComponent(error.message));
  const result = data as { league_id: string };
  redirect(`/leagues/${result.league_id}?joined=1`);
}
