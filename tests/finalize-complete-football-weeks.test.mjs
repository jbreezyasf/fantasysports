import test from 'node:test';
import assert from 'node:assert/strict';
import {isWeekComplete} from '../scripts/finalize-complete-football-weeks.mjs';

test('a week completes only after every scheduled game is terminal',()=>{
  const now=new Date('2026-09-16T12:00:00Z');
  assert.equal(isWeekComplete([{state:'final',starts_at:'2026-09-10T00:00:00Z'},{state:'in_progress',starts_at:'2026-09-15T00:00:00Z'}],now),false);
  assert.equal(isWeekComplete([{state:'final',starts_at:'2026-09-10T00:00:00Z'},{state:'final',starts_at:'2026-09-15T00:00:00Z'}],now),true);
});

test('future games prevent finalization even if provider state is wrong',()=>{
  assert.equal(isWeekComplete([{state:'final',starts_at:'2026-09-18T00:00:00Z'}],new Date('2026-09-17T00:00:00Z')),false);
});

import {lineupRowsToCarry,finalizeCompleteFootballWeeks} from '../scripts/finalize-complete-football-weeks.mjs';

test('carry-forward skips a player already placed in a different slot next week',()=>{
  // Production case: WR1 in week 1, already WR2 in week 2, week-2 WR1 empty.
  const prior=[{season_franchise_id:'f',slot:'WR',slot_index:1,athlete_id:'golden',real_team_id:null},{season_franchise_id:'f',slot:'QB',slot_index:1,athlete_id:'qb',real_team_id:null}];
  const next=[{season_franchise_id:'f',slot:'WR',slot_index:2,athlete_id:'golden',real_team_id:null}];
  assert.deepEqual(lineupRowsToCarry(prior,next,2),[{season_franchise_id:'f',slot:'QB',slot_index:1,athlete_id:'qb',real_team_id:null,week:2}]);
});

test('carry-forward keeps filled slots, copies defenses, and fills an empty week',()=>{
  const prior=[{season_franchise_id:'f',slot:'DST',slot_index:1,athlete_id:null,real_team_id:'bal'},{season_franchise_id:'f',slot:'K',slot_index:1,athlete_id:'k1',real_team_id:null}];
  assert.equal(lineupRowsToCarry(prior,[],5).length,2);
  assert.deepEqual(lineupRowsToCarry(prior,[{season_franchise_id:'f',slot:'K',slot_index:1,athlete_id:'k2',real_team_id:null}],5).map(r=>r.slot),['DST']);
  assert.deepEqual(lineupRowsToCarry(prior,[{season_franchise_id:'g',slot:'K',slot_index:1,athlete_id:'k1',real_team_id:null}],5).length,2,'another franchise does not block');
});

// Minimal stand-in for the Supabase query builder used by the job.
function fakeDb({games,matchups,lineups,franchises,overrides=[],failRecomputeFor=new Set()}){
  const calls={recompute:[],publish:[],inserted:[]};
  const query=(table)=>{
    const filters=[];
    const run=()=>{
      const source={real_games:games,matchups,lineups,season_franchises:franchises,fantasy_week_close_overrides:overrides}[table]??[];
      if(table==='fantasy_week_close_overrides'&&overrides===null)return {data:null,error:{message:'relation "public.fantasy_week_close_overrides" does not exist'}};
      return {data:source.filter(row=>filters.every(f=>f(row))),error:null};
    };
    const api={
      select:()=>api,
      eq:(col,val)=>{filters.push(row=>row[col]===val);return api;},
      in:(col,vals)=>{filters.push(row=>vals.includes(row[col]));return api;},
      insert:async rows=>{calls.inserted.push(...rows);lineups.push(...rows);return {error:null};},
      then:(resolve,reject)=>Promise.resolve(run()).then(resolve,reject),
    };
    return api;
  };
  return {calls,from:query,rpc:async(name,args)=>{
    if(name==='recompute_matchup'){
      if(failRecomputeFor.has(args.p_matchup_id))return {error:{message:'boom'}};
      calls.recompute.push(args.p_matchup_id);matchups.find(m=>m.id===args.p_matchup_id).is_final=true;return {data:{},error:null};
    }
    calls.publish.push(`${args.p_league_season_id}:${args.p_week}`);return {data:null,error:null};
  }};
}

const season=()=>({
  games:[
    {competition_season_id:'cs',week:1,state:'final',starts_at:'2026-09-10T00:00:00Z'},
    {competition_season_id:'cs',week:2,state:'final',starts_at:'2026-09-17T00:00:00Z'},
    {competition_season_id:'cs',week:3,state:'scheduled',starts_at:'2026-09-24T00:00:00Z'},
  ],
  franchises:[{id:'a1',league_season_id:'A'},{id:'b1',league_season_id:'B'}],
  matchups:[
    {id:'mA2',league_season_id:'A',week:2,is_final:false},
    {id:'mB2',league_season_id:'B',week:2,is_final:false},
  ],
  lineups:[
    {season_franchise_id:'a1',week:1,slot:'WR',slot_index:1,athlete_id:'golden',real_team_id:null},
    {season_franchise_id:'a1',week:2,slot:'WR',slot_index:2,athlete_id:'golden',real_team_id:null},
    {season_franchise_id:'b1',week:2,slot:'QB',slot_index:1,athlete_id:'qb',real_team_id:null},
  ],
});

test('a week-1 row that cannot be copied no longer blocks closing later weeks',async()=>{
  const db=fakeDb(season());
  const results=await finalizeCompleteFootballWeeks({db,competitionSeasonId:'cs',leagueSeasons:[{id:'A'},{id:'B'}],throughWeek:3,now:new Date('2026-09-22T12:00:00Z')});
  assert.deepEqual(db.calls.recompute.sort(),['mA2','mB2']);
  assert.deepEqual(results.map(r=>r.status),['final','final','open']);
});

test('completed weeks are never written to; only the open week receives carried lineups',async()=>{
  const db=fakeDb(season());
  await finalizeCompleteFootballWeeks({db,competitionSeasonId:'cs',leagueSeasons:[{id:'A'},{id:'B'}],throughWeek:3,now:new Date('2026-09-22T12:00:00Z')});
  assert.ok(db.calls.inserted.length>0);
  assert.ok(db.calls.inserted.every(row=>row.week===3),'week 1 -> 2 carry must not run once week 2 is complete');
  assert.deepEqual(db.calls.inserted.map(r=>`${r.season_franchise_id}:${r.slot}${r.slot_index}`).sort(),['a1:WR2','b1:QB1']);
});

test('one league failing does not stop the others, and the run still reports failure',async()=>{
  const db=fakeDb({...season(),failRecomputeFor:new Set(['mA2'])});
  await assert.rejects(
    finalizeCompleteFootballWeeks({db,competitionSeasonId:'cs',leagueSeasons:[{id:'A'},{id:'B'}],throughWeek:3,now:new Date('2026-09-22T12:00:00Z')}),
    error=>{assert.match(error.message,/week 2 league season A: boom/);assert.equal(error.failures.length,1);return true;}
  );
  assert.deepEqual(db.calls.recompute,['mB2'],'league B still closed');
});

import {weekCloseStatus} from '../scripts/finalize-complete-football-weeks.mjs';

// The same truth table is asserted against the SQL rule in
// supabase/tests/week_close_terminal_game_rule.sql.
const past='2026-09-20T17:00:00Z', at=new Date('2026-09-23T12:00:00Z');
const week=(...states)=>states.map(state=>({state,starts_at:past}));

test('a canceled game does not block the week; every non-terminal state does',()=>{
  assert.equal(isWeekComplete(week('final','canceled'),at),true);
  assert.equal(isWeekComplete(week('canceled'),at),true);
  for(const state of ['scheduled','in_progress','delayed','suspended','unknown'])assert.equal(isWeekComplete(week('final',state),at),false,state);
  assert.equal(isWeekComplete([],at),false,'a week with no games is never complete');
});

test('a postponed game blocks the week until an operator override exists',()=>{
  assert.equal(isWeekComplete(week('final','postponed'),at),false);
  assert.deepEqual(weekCloseStatus(week('final','postponed'),at,{postponedOverride:true}),{games:2,notStarted:0,unfinished:0,postponed:1,override:true,overrideApplied:true,complete:true});
  // A postponed game is often re-dated into the future; that must not matter once overridden.
  assert.equal(isWeekComplete([{state:'final',starts_at:past},{state:'postponed',starts_at:'2026-12-01T00:00:00Z'}],at,{postponedOverride:true}),true);
});

test('the override only waives postponed games',()=>{
  assert.equal(isWeekComplete(week('final','postponed','in_progress'),at,{postponedOverride:true}),false);
  assert.equal(isWeekComplete(week('postponed'),at,{postponedOverride:true}),false,'a week of only postponed games never closes');
  assert.equal(weekCloseStatus(week('final','final'),at,{postponedOverride:true}).overrideApplied,false);
});

const postponedSeason=overrides=>({
  games:[{competition_season_id:'cs',week:1,state:'final',starts_at:'2026-09-10T00:00:00Z'},{competition_season_id:'cs',week:1,state:'postponed',starts_at:'2026-09-13T00:00:00Z'},{competition_season_id:'cs',week:2,state:'scheduled',starts_at:'2026-09-17T00:00:00Z'}],
  franchises:[{id:'a1',league_season_id:'A'}],matchups:[{id:'mA1',league_season_id:'A',week:1,is_final:false}],lineups:[],overrides,
});
const run=db=>finalizeCompleteFootballWeeks({db,competitionSeasonId:'cs',leagueSeasons:[{id:'A'}],throughWeek:1,now:new Date('2026-09-16T12:00:00Z')});
const captureWarnings=async fn=>{const seen=[];const original=console.warn;console.warn=line=>seen.push(JSON.parse(line));try{return [await fn(),seen];}finally{console.warn=original;}};

test('job: a postponed game leaves the week open and says why',async()=>{
  const db=fakeDb(postponedSeason([]));
  const [results,warnings]=await captureWarnings(()=>run(db));
  assert.deepEqual(results,[{week:1,status:'open',blockedByPostponedGames:1}]);
  assert.deepEqual(db.calls.recompute,[]);
  assert.equal(warnings[0].warning,'postponed-game-blocks-week-close');
});

test('job: the operator override closes the week and is logged and reported',async()=>{
  const db=fakeDb(postponedSeason([{competition_season_id:'cs',week:1,reason:'game moved to week 9',created_by:'juanita'}]));
  const [results,warnings]=await captureWarnings(()=>run(db));
  assert.deepEqual(db.calls.recompute,['mA1']);
  assert.deepEqual(results[0].postponedGameOverride,{postponed:1,reason:'game moved to week 9',createdBy:'juanita'});
  assert.ok(warnings.some(w=>w.warning==='postponed-game-override-applied'&&w.reason==='game moved to week 9'));
});

test('job: an override for another week, or an unreadable override table, changes nothing',async()=>{
  const other=fakeDb(postponedSeason([{competition_season_id:'cs',week:2,reason:'x',created_by:'y'}]));
  assert.equal((await captureWarnings(()=>run(other)))[0][0].status,'open');
  const missing=fakeDb(postponedSeason(null));
  const [results,warnings]=await captureWarnings(()=>run(missing));
  assert.equal(results[0].status,'open');
  assert.equal(warnings[0].warning,'postponed-override-unavailable');
  assert.deepEqual(missing.calls.recompute,[]);
});
