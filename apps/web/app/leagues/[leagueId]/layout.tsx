import BigExecMobileNav from '../../components/BigExecMobileNav';
import BigExecAppHeader from '../../components/BigExecAppHeader';
import { createClient } from '../../../lib/supabase/server';
import { MainContent, SkipLink } from '../../components/accessibility';
import { isVoiceFeatureEnabled } from '../../../lib/feature-flags/voiceFlags';
import { isExecutiveFeatureEnabled } from '../../../lib/executive/featureFlags';

export default async function LeagueLayout({children,params}:{children:React.ReactNode;params:Promise<{leagueId:string}>}) {
  const {leagueId}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const {data:member}=user
    ? await supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle()
    : {data:null};
  const voiceInputEnabled=isVoiceFeatureEnabled('voice_gm')||isExecutiveFeatureEnabled('assistant_gm_voice_input');
  return <>
    <SkipLink />
    <BigExecAppHeader leagueId={leagueId} isCommissioner={member?.role==='commissioner'} voiceGmEnabled={voiceInputEnabled} voiceInputEnabled={voiceInputEnabled}/>
    <MainContent>{children}</MainContent>
    <BigExecMobileNav leagueId={leagueId}/>
  </>;
}
