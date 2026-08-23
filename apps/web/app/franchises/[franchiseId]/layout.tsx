import { notFound } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import BigExecMobileNav from '../../components/BigExecMobileNav';
import BigExecAppHeader from '../../components/BigExecAppHeader';

export default async function FranchiseLayout({children,params}:{children:React.ReactNode;params:Promise<{franchiseId:string}>}){
  const {franchiseId}=await params;
  const supabase=await createClient();
  const {data:franchise}=await supabase.from('franchises').select('league_id').eq('id',franchiseId).maybeSingle();
  if(!franchise)notFound();
  return <><BigExecAppHeader leagueId={franchise.league_id}/>{children}<BigExecMobileNav leagueId={franchise.league_id}/></>;
}
