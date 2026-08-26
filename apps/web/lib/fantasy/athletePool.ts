import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadFantasyEligibleAthletesFrom, type AthletePoolClient } from './athletePoolCore';
export { FANTASY_ELIGIBLE_POSITIONS } from './athletePoolCore';
export type { FantasyEligibleAthlete } from './athletePoolCore';

export async function loadFantasyEligibleAthletes(supabase: SupabaseClient) {
  return loadFantasyEligibleAthletesFrom(supabase as unknown as AthletePoolClient);
}
