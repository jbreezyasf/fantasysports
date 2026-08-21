import { notFound } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import BigExecMobileNav from '../../components/BigExecMobileNav';

export default async function MatchupLayout({children,params}:{children:React.ReactNode;params:Promise<{matchupId:string}>}){
  const {matchupId}=await params;
  const supabase=await createClient();
  const {data:matchup}=await supabase.from('matchups').select('league_season_id').eq('id',matchupId).maybeSingle();
  if(!matchup)notFound();
  const {data:season}=await supabase.from('league_seasons').select('league_id').eq('id',matchup.league_season_id).maybeSingle();
  if(!season)notFound();
  return <>{children}<BigExecMobileNav leagueId={season.league_id}/></>;
}
