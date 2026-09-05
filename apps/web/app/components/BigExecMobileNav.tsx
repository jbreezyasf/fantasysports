import { createClient } from '../../lib/supabase/server';
import BigExecMobileNavClient, { type BigExecMobileNavItem } from './BigExecMobileNavClient';

export default async function BigExecMobileNav({leagueId}:{leagueId:string}){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return null;
  const [{data:season},{data:ownerships}]=await Promise.all([
    supabase.from('league_seasons').select('id').eq('league_id',leagueId).eq('is_current',true).maybeSingle(),
    supabase.from('franchise_owners').select('franchise_id').eq('user_id',user.id).is('ends_on',null)
  ]);
  const ownedIds=(ownerships??[]).map(x=>x.franchise_id);
  let franchiseId:string|undefined;
  let seasonFranchiseId:string|undefined;
  let matchupId:string|undefined;
  if(season&&ownedIds.length){
    const {data:sf}=await supabase.from('season_franchises').select('id,franchise_id').eq('league_season_id',season.id).in('franchise_id',ownedIds).limit(1).maybeSingle();
    franchiseId=sf?.franchise_id; seasonFranchiseId=sf?.id;
    if(seasonFranchiseId){
      const {data:matchups}=await supabase.from('matchups').select('id,week').eq('league_season_id',season.id).or(`home_season_franchise_id.eq.${seasonFranchiseId},away_season_franchise_id.eq.${seasonFranchiseId}`).order('week',{ascending:false}).limit(1);
      matchupId=matchups?.[0]?.id;
    }
  }
  const items: BigExecMobileNavItem[] = [
    { label: 'Home', icon: '⌂', href: '/dashboard', match: 'exact' },
    { label: 'Team', icon: 'J', href: franchiseId ? `/franchises/${franchiseId}/team` : undefined, match: 'prefix', unavailableLabel: 'Team unavailable until you own a franchise' },
    { label: 'Matchup', icon: 'VS', href: matchupId ? `/matchups/${matchupId}` : undefined, match: 'prefix', unavailableLabel: 'Matchup unavailable until your franchise has a scheduled matchup' },
    { label: 'League', icon: '▦', href: `/leagues/${leagueId}`, match: 'exact' },
    { label: 'Players', icon: '⌕', href: `/leagues/${leagueId}/players`, match: 'prefix' }
  ];
  return <BigExecMobileNavClient items={items} />;
}
