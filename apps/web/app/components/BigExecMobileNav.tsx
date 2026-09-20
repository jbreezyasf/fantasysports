import { createClient } from '../../lib/supabase/server';
import BigExecMobileNavClient, { type BigExecMobileNavItem } from './BigExecMobileNavClient';
import { currentCompetitionWeek, selectFrontOfficeMatchup } from '../leagues/[leagueId]/frontOfficeMatchup';

export default async function BigExecMobileNav({leagueId}:{leagueId:string}){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return null;
  const [{data:season},{data:ownerships}]=await Promise.all([
    supabase.from('league_seasons').select('id,competition_season_id').eq('league_id',leagueId).eq('is_current',true).maybeSingle(),
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
      const [{data:matchups},{data:games}]=await Promise.all([
        supabase.from('matchups').select('id,week,is_final,home_season_franchise_id,away_season_franchise_id').eq('league_season_id',season.id).or(`home_season_franchise_id.eq.${seasonFranchiseId},away_season_franchise_id.eq.${seasonFranchiseId}`).order('week',{ascending:true}),
        supabase.from('real_games').select('week,starts_at').eq('competition_season_id',season.competition_season_id).order('starts_at',{ascending:true})
      ]);
      matchupId=selectFrontOfficeMatchup(matchups??[],seasonFranchiseId,currentCompetitionWeek(games??[]))?.id;
    }
  }
  const items: BigExecMobileNavItem[] = [
    { label: 'Front Office', icon: 'office', href: `/leagues/${leagueId}`, match: 'exact', activePrefixes: ['/drafts/', ...(franchiseId ? [`/franchises/${franchiseId}/team`] : [])] },
    { label: 'Matchup', icon: 'matchup', href: matchupId ? `/matchups/${matchupId}` : `/leagues/${leagueId}/schedule`, match: matchupId ? 'prefix' : 'manual', activePrefixes: ['/matchups/'] },
    { label: 'Lineup', icon: 'league', href: franchiseId ? `/franchises/${franchiseId}/team` : undefined, match: 'prefix', unavailableLabel: 'Lineup unavailable until you own a franchise' },
    { label: 'Locker Room', icon: 'locker', href: `/leagues/${leagueId}/locker-room`, match: 'prefix' },
    { label: 'More', icon: 'more', href: `/leagues/${leagueId}/schedule`, match: 'manual', menu: true }
  ];
  return <BigExecMobileNavClient items={items} />;
}
