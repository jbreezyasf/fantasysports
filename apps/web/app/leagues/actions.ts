'use server';

import { redirect } from 'next/navigation';
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
