import { createClient } from '../../lib/supabase/server';

export default async function BigExecMobileNav({leagueId}:{leagueId:string}){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return null;
  const [{data:season},{data:ownerships}]=await Promise.all([
    supabase.from('league_seasons').select('id').eq('league_id',leagueId).eq('is_current',true).maybeSingle(),
    supabase.from('franchise_owners').select('franchise_id').eq('user_id',user.id).is('ends_on',null)
  ]);
  const ownedIds=(ownerships??[]).map(x=>x.franchise_id);
  let franchiseId:string|undefined; let seasonFranchiseId:string|undefined; let matchupId:string|undefined;
  if(season&&ownedIds.length){
    const {data:sf}=await supabase.from('season_franchises').select('id,franchise_id').eq('league_season_id',season.id).in('franchise_id',ownedIds).limit(1).maybeSingle();
    franchiseId=sf?.franchise_id; seasonFranchiseId=sf?.id;
    if(seasonFranchiseId){
      const {data:matchups}=await supabase.from('matchups').select('id,week').eq('league_season_id',season.id).or(`home_season_franchise_id.eq.${seasonFranchiseId},away_season_franchise_id.eq.${seasonFranchiseId}`).order('week',{ascending:false}).limit(1);
      matchupId=matchups?.[0]?.id;
    }
  }
  const item=(label:string,icon:string,href?:string)=>href?<a href={href}><b aria-hidden="true">{icon}</b><small>{label}</small></a>:<span aria-disabled="true"><b aria-hidden="true">{icon}</b><small>{label}</small></span>;
  return <nav className="mobileGameNav" aria-label="Big Exec primary navigation">{item('Home','⌂','/dashboard')}{item('Team','J',franchiseId?`/franchises/${franchiseId}/team`:undefined)}{item('Matchup','VS',matchupId?`/matchups/${matchupId}`:undefined)}{item('League','▦',`/leagues/${leagueId}`)}{item('Players','⌕',`/leagues/${leagueId}/players`)}</nav>;
}
