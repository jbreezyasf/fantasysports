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
function fakeDb({games,matchups,lineups,franchises,failRecomputeFor=new Set()}){
  const calls={recompute:[],publish:[],inserted:[]};
  const query=(table)=>{
    const filters=[];
    const run=()=>{
      const source={real_games:games,matchups,lineups,season_franchises:franchises}[table]??[];
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
