export const terminalGameStates = new Set(['final','canceled']);

export function isWeekComplete(games, now=new Date()) {
  return games.length>0 && games.every(game=>new Date(game.starts_at)<=now && terminalGameStates.has(String(game.state).toLowerCase()));
}

const assetKey=row=>row.athlete_id?`athlete:${row.athlete_id}`:`team:${row.real_team_id}`;

// Rows from the week just played that can be copied into the next week.
// A row is skipped when its slot is already filled OR its player/defense is
// already somewhere in the next week's lineup. The lineups table rejects the
// same asset twice in a franchise-week, and one rejected row used to abort the
// whole job (production, 2026-09-22 onward).
export function lineupRowsToCarry(prior, next, nextWeek) {
  const slots=new Set((next??[]).map(row=>`${row.season_franchise_id}:${row.slot}:${row.slot_index}`));
  const assets=new Set((next??[]).map(row=>`${row.season_franchise_id}:${assetKey(row)}`));
  const rows=[];
  for(const row of prior??[]){
    const slot=`${row.season_franchise_id}:${row.slot}:${row.slot_index}`;
    const asset=`${row.season_franchise_id}:${assetKey(row)}`;
    if(slots.has(slot)||assets.has(asset))continue;
    slots.add(slot);assets.add(asset);
    rows.push({season_franchise_id:row.season_franchise_id,slot:row.slot,slot_index:row.slot_index,athlete_id:row.athlete_id??null,real_team_id:row.real_team_id??null,week:nextWeek});
  }
  return rows;
}

async function carryLineupsForward(db, leagueSeasonId, week) {
  if(week>=18)return 0;
  const {data:franchises,error:franchiseError}=await db.from('season_franchises').select('id').eq('league_season_id',leagueSeasonId);
  if(franchiseError)throw new Error(franchiseError.message);
  const ids=(franchises??[]).map(row=>row.id);if(!ids.length)return 0;
  const [{data:prior,error:priorError},{data:next,error:nextError}]=await Promise.all([
    db.from('lineups').select('season_franchise_id,slot,slot_index,athlete_id,real_team_id').in('season_franchise_id',ids).eq('week',week),
    db.from('lineups').select('season_franchise_id,slot,slot_index,athlete_id,real_team_id').in('season_franchise_id',ids).eq('week',week+1)
  ]);
  if(priorError)throw new Error(priorError.message);if(nextError)throw new Error(nextError.message);
  const rows=lineupRowsToCarry(prior,next,week+1);
  if(!rows.length)return 0;const {error}=await db.from('lineups').insert(rows);if(error)throw new Error(error.message);return rows.length;
}

async function loadWeekGames(db, competitionSeasonId, week) {
  const {data,error}=await db.from('real_games').select('id,week,state,starts_at').eq('competition_season_id',competitionSeasonId).eq('week',week);
  if(error)throw new Error(error.message);
  return data??[];
}

// Closes every complete week for every league season.
//
// Each league season is isolated: a failure in one is recorded and the rest
// still close. After everything has been attempted the function throws if any
// league failed, so the cron run is still reported as failed.
//
// Lineups are carried only into a week that is still open. Completed weeks are
// history and are never written to.
export async function finalizeCompleteFootballWeeks({db,competitionSeasonId,leagueSeasons,throughWeek,now=new Date()}) {
  const results=[];const failures=[];
  for(let week=1;week<=throughWeek;week+=1){
    const games=await loadWeekGames(db,competitionSeasonId,week);
    if(!isWeekComplete(games,now)){results.push({week,status:'open'});continue;}
    const nextWeekOpen=week<18&&!isWeekComplete(await loadWeekGames(db,competitionSeasonId,week+1),now);
    let finalized=0,carried=0,recapsQueued=0;const errors=[];
    for(const leagueSeason of leagueSeasons??[]){
      try{
        const {data:matchups,error:matchupsError}=await db.from('matchups').select('id').eq('league_season_id',leagueSeason.id).eq('week',week).eq('is_final',false);
        if(matchupsError)throw new Error(matchupsError.message);
        for(const matchup of matchups??[]){const {error}=await db.rpc('recompute_matchup',{p_matchup_id:matchup.id,p_finalize:true});if(error)throw new Error(error.message);finalized+=1;}
        if(nextWeekOpen)carried+=await carryLineupsForward(db,leagueSeason.id,week);
        const {data:recapId,error:recapError}=await db.rpc('publish_finalized_league_week',{p_league_season_id:leagueSeason.id,p_week:week});
        if(recapError)throw new Error(recapError.message);
        if(recapId)recapsQueued+=1;
      }catch(error){
        const failure={week,leagueSeasonId:leagueSeason.id,message:error instanceof Error?error.message:String(error)};
        errors.push(failure);failures.push(failure);
      }
    }
    results.push({week,status:'final',finalized,carried,recapsQueued,...(errors.length?{errors}:{})});
  }
  if(failures.length){
    const error=new Error(`Week close failed for ${failures.length} league-week(s): ${failures.map(f=>`week ${f.week} league season ${f.leagueSeasonId}: ${f.message}`).join(' | ')}`);
    error.results=results;error.failures=failures;
    throw error;
  }
  return results;
}
