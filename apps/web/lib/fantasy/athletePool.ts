import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export const FANTASY_ELIGIBLE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'] as const;

export type FantasyEligibleAthlete = {
  id: string;
  display_name: string;
  position: string;
  real_team_id: string | null;
  real_teams:
    | { display_name?: string | null; abbreviation?: string | null }
    | Array<{ display_name?: string | null; abbreviation?: string | null }>
    | null;
};

/**
 * Supabase/PostgREST responses are intentionally paged so the UI never depends
 * on a single arbitrary global row limit. The loop stops only when the final
 * page is smaller than PAGE_SIZE.
 */
export async function loadFantasyEligibleAthletes(supabase: SupabaseClient) {
  const PAGE_SIZE = 1000;
  const athletes: FantasyEligibleAthlete[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('athletes')
      .select('id,display_name,position,real_team_id,real_teams(display_name,abbreviation)')
      .eq('active', true)
      .in('position', [...FANTASY_ELIGIBLE_POSITIONS])
      .order('position')
      .order('display_name')
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: athletes, error };

    const page = (data ?? []) as FantasyEligibleAthlete[];
    athletes.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: athletes, error: null };
}
