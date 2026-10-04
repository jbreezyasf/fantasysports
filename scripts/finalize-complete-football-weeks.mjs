// One rule for "this fantasy week is complete". It is the same rule as
// public.fantasy_week_close_status in
// supabase/migrations/20261003040000_week_close_terminal_game_rule.sql, which
// recompute_matchup enforces when it finalizes. Keep the two in step.
//
//   - the week has at least one game that is not postponed;
//   - every game is final or canceled and has reached its kickoff time;
//   - a postponed game blocks the close unless an operator has recorded an
//     override for that week (table fantasy_week_close_overrides), in which
//     case the postponed game counts for nothing in that fantasy week;
//   - every other state blocks and cannot be overridden.
export const terminalGameStates = new Set(['final','canceled']);

export function weekCloseStatus(games, now=new Date(), {postponedOverride=false}={}) {
  const state=game=>String(game.state).toLowerCase();
  const all=games??[];
  const postponed=all.filter(game=>state(game)==='postponed').length;
  const notStarted=all.filter(game=>state(game)!=='postponed'&&new Date(game.starts_at)>now).length;
  const unfinished=all.filter(game=>state(game)!=='postponed'&&!terminalGameStates.has(state(game))).length;
  const settled=all.length>postponed&&unfinished===0&&notStarted===0;
  const override=Boolean(postponedOverride);
  return {games:all.length,notStarted,unfinished,postponed,override,overrideApplied:settled&&postponed>0&&override,complete:settled&&(postponed===0||override)};
}

export function isWeekComplete(games, now=new Date(), options={}) {
  return weekCloseStatus(games,now,options).complete;
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

// The operator override for a week with a postponed game. Only looked up when
// the week actually has a postponed game. If the table cannot be read (the
// migration is not applied yet) there is no override and the week stays open.
async function loadPostponedOverride(db, competitionSeasonId, week) {
  const {data,error}=await db.from('fantasy_week_close_overrides').select('week,reason,created_by,created_at').eq('competition_season_id',competitionSeasonId).eq('week',week);
  if(error){console.warn(JSON.stringify({job:'week-close',warning:'postponed-override-unavailable',week,message:error.message}));return null;}
  return data?.[0]??null;
}

async function loadWeekCloseStatus(db, competitionSeasonId, week, now) {
  const games=await loadWeekGames(db,competitionSeasonId,week);
  const plain=weekCloseStatus(games,now);
  if(plain.postponed===0)return plain;
  const override=await loadPostponedOverride(db,competitionSeasonId,week);
  if(!override){
    console.warn(JSON.stringify({job:'week-close',warning:'postponed-game-blocks-week-close',week,postponed:plain.postponed,action:'reschedule the game in real_games, or insert a fantasy_week_close_overrides row to close the week without it'}));
    return plain;
  }
  const status=weekCloseStatus(games,now,{postponedOverride:true});
  if(status.overrideApplied)console.warn(JSON.stringify({job:'week-close',warning:'postponed-game-override-applied',week,postponed:status.postponed,reason:override.reason,createdBy:override.created_by,createdAt:override.created_at??null}));
  return {...status,overrideDetail:override};
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
    const status=await loadWeekCloseStatus(db,competitionSeasonId,week,now);
    if(!status.complete){results.push({week,status:'open',...(status.postponed?{blockedByPostponedGames:status.postponed}:{})});continue;}
    const nextWeekOpen=week<18&&!(await loadWeekCloseStatus(db,competitionSeasonId,week+1,now)).complete;
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
    results.push({week,status:'final',finalized,carried,recapsQueued,...(status.overrideApplied?{postponedGameOverride:{postponed:status.postponed,reason:status.overrideDetail.reason,createdBy:status.overrideDetail.created_by}}:{}),...(errors.length?{errors}:{})});
  }
  if(failures.length){
    const error=new Error(`Week close failed for ${failures.length} league-week(s): ${failures.map(f=>`week ${f.week} league season ${f.leagueSeasonId}: ${f.message}`).join(' | ')}`);
    error.results=results;error.failures=failures;
    throw error;
  }
  return results;
}
