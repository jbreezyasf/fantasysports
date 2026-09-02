import { notFound } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import BigExecMobileNav from '../../components/BigExecMobileNav';
import BigExecAppHeader from '../../components/BigExecAppHeader';
import { MainContent, SkipLink } from '../../components/accessibility';
import { isVoiceFeatureEnabled } from '../../../lib/feature-flags/voiceFlags';

export default async function RecapLayout({children,params}:{children:React.ReactNode;params:Promise<{recapId:string}>}){
  const {recapId}=await params;const supabase=await createClient();
  const {data:recap}=await supabase.from('recap_scripts').select('league_season_id').eq('id',recapId).maybeSingle();if(!recap)notFound();
  const {data:season}=await supabase.from('league_seasons').select('league_id').eq('id',recap.league_season_id).maybeSingle();if(!season)notFound();
  return <><SkipLink/><BigExecAppHeader leagueId={season.league_id} voiceGmEnabled={isVoiceFeatureEnabled('voice_gm')}/><MainContent>{children}</MainContent><BigExecMobileNav leagueId={season.league_id}/></>;
}
