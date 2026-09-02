import { notFound } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import BigExecMobileNav from '../../components/BigExecMobileNav';
import BigExecAppHeader from '../../components/BigExecAppHeader';
import { MainContent, SkipLink } from '../../components/accessibility';
import { isVoiceFeatureEnabled } from '../../../lib/feature-flags/voiceFlags';

export default async function DraftLayout({children,params}:{children:React.ReactNode;params:Promise<{draftId:string}>}){
  const {draftId}=await params;
  const supabase=await createClient();
  const {data:draft}=await supabase.from('drafts').select('league_season_id').eq('id',draftId).maybeSingle();
  if(!draft)notFound();
  const {data:season}=await supabase.from('league_seasons').select('league_id').eq('id',draft.league_season_id).maybeSingle();
  if(!season)notFound();
  return <><SkipLink/><BigExecAppHeader leagueId={season.league_id} voiceGmEnabled={isVoiceFeatureEnabled('voice_gm')}/><MainContent>{children}</MainContent><BigExecMobileNav leagueId={season.league_id}/></>;
}
