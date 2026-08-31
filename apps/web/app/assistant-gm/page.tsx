import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export default async function AssistantGMEntryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('league_members')
    .select('league_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membership?.league_id) redirect(`/leagues/${membership.league_id}/assistant-gm`);
  redirect('/dashboard');
}
