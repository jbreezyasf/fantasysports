export const terminalGameStates = new Set(['final','canceled']);

export function isWeekComplete(games, now=new Date()) {
  return games.length>0 && games.every(game=>new Date(game.starts_at)<=now && terminalGameStates.has(String(game.state).toLowerCase()));
}

async function carryLineupsForward(db, leagueSeasonId, week) {
  if(week>=18)return 0;
  const {data:franchises,error:franchiseError}=await db.from('season_franchises').select('id').eq('league_season_id',leagueSeasonId);
  if(franchiseError)throw new Error(franchiseError.message);
  const ids=(franchises??[]).map(row=>row.id);if(!ids.length)return 0;
  const [{data:prior,error:priorError},{data:next,error:nextError}]=await Promise.all([
    db.from('lineups').select('season_franchise_id,slot,slot_index,athlete_id,real_team_id').in('season_franchise_id',ids).eq('week',week),
    db.from('lineups').select('season_franchise_id,slot,slot_index').in('season_franchise_id',ids).eq('week',week+1)
  ]);
  if(priorError)throw new Error(priorError.message);if(nextError)throw new Error(nextError.message);
  const existing=new Set((next??[]).map(row=>`${row.season_franchise_id}:${row.slot}:${row.slot_index}`));
  const rows=(prior??[]).filter(row=>!existing.has(`${row.season_franchise_id}:${row.slot}:${row.slot_index}`)).map(row=>({...row,week:week+1}));
  if(!rows.length)return 0;const {error}=await db.from('lineups').insert(rows);if(error)throw new Error(error.message);return rows.length;
}

export async function finalizeCompleteFootballWeeks({db,competitionSeasonId,leagueSeasons,throughWeek,now=new Date()}) {
  const results=[];
  for(let week=1;week<=throughWeek;week+=1){
    const {data:games,error:gamesError}=await db.from('real_games').select('id,week,state,starts_at').eq('competition_season_id',competitionSeasonId).eq('week',week);
    if(gamesError)throw new Error(gamesError.message);
    if(!isWeekComplete(games??[],now)){results.push({week,status:'open'});continue;}
    let finalized=0,carried=0;
    for(const leagueSeason of leagueSeasons??[]){
      const {data:matchups,error:matchupsError}=await db.from('matchups').select('id').eq('league_season_id',leagueSeason.id).eq('week',week).eq('is_final',false);
      if(matchupsError)throw new Error(matchupsError.message);
      for(const matchup of matchups??[]){const {error}=await db.rpc('recompute_matchup',{p_matchup_id:matchup.id,p_finalize:true});if(error)throw new Error(error.message);finalized+=1;}
      carried+=await carryLineupsForward(db,leagueSeason.id,week);
    }
    results.push({week,status:'final',finalized,carried});
  }
  return results;
}
