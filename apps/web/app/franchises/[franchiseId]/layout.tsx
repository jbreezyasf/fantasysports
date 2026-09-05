import { notFound } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import BigExecMobileNav from '../../components/BigExecMobileNav';
import BigExecAppHeader from '../../components/BigExecAppHeader';
import { MainContent, SkipLink } from '../../components/accessibility';
import { isVoiceFeatureEnabled } from '../../../lib/feature-flags/voiceFlags';
import { isExecutiveFeatureEnabled } from '../../../lib/executive/featureFlags';

export default async function FranchiseLayout({children,params}:{children:React.ReactNode;params:Promise<{franchiseId:string}>}){
  const {franchiseId}=await params;
  const supabase=await createClient();
  const {data:franchise}=await supabase.from('franchises').select('league_id').eq('id',franchiseId).maybeSingle();
  if(!franchise)notFound();
  const voiceInputEnabled=isVoiceFeatureEnabled('voice_gm')||isExecutiveFeatureEnabled('assistant_gm_voice_input');
  return <><SkipLink/><BigExecAppHeader leagueId={franchise.league_id} voiceGmEnabled={voiceInputEnabled} voiceInputEnabled={voiceInputEnabled}/><MainContent>{children}</MainContent><BigExecMobileNav leagueId={franchise.league_id}/></>;
}
