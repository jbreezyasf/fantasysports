import { createClient } from '@supabase/supabase-js';
import { QA_ACTORS } from '../qa-actors.mjs';

const STRESS_LEAGUE_ID = 'e72ef311-1de9-4af4-a3b5-9fb1326a9c5f';
const EXECUTION_PHRASE = 'BIG_EXEC_INTERNAL_STRESS_TEST_2026';
const QA_MANAGERS = QA_ACTORS.filter(actor => /^Manager0[1-8]$/.test(actor.label));
const SLOT_PLAN = [['QB',1,'QB'],['RB',1,'RB'],['RB',2,'RB'],['WR',1,'WR'],['WR',2,'WR'],['TE',1,'TE'],['FLEX',1,'FLEX'],['K',1,'K'],['DST',1,'DST']];
const BANTER = {
  Manager01: week => `Week ${week}: waiver work is done and the lineup is locked. If opportunity knocks, Waiver Wire Kings already answered.`,
  Manager02: week => `Week ${week}: film watched, matchups checked, lineup submitted. Film Room Grinders are ready for Thursday.`,
  Manager03: week => `Week ${week}: Deal Desk Sharks have the starters set. My phone is still open if anybody wants to improve their roster.`,
  Manager04: week => `Week ${week}: the young talent is ready. Rookie Futures are set, confident, and thinking bigger than one Sunday.`,
  Manager05: week => `Week ${week}: lineup handled early, the way grown folks do it. Old Head Ball Club will see everybody on the field.`,
  Manager06: week => `Week ${week}: Chaos Department submitted a legal lineup. What happens after kickoff is between the football gods and your blood pressure.`,
  Manager07: week => `Week ${week}: projections reviewed, lineup optimized, unnecessary speeches avoided. Quiet Capital is ready.`,
  Manager08: week => `Week ${week}: Sunday Scramblers checked in before Thursday for once. Lineup set. No excuses.`
};

function client(url,key){return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
function relation(value){return Array.isArray(value)?value[0]:value;}
function positionOf(row){return row.real_team_id?'DST':relation(row.athletes)?.position??'';}

export function buildLineup(roster, marketValues, label, recentScores=[]){
  const values=new Map(marketValues.map(value=>[value.athlete_id,value]));
  const recent=new Map(recentScores.map(value=>[`${value.athlete_id??''}:${value.real_team_id??''}`,Number(value.points??0)]));
  const scored=roster.map((row,index)=>{const market=values.get(row.athlete_id);const verifiedRecent=recent.get(`${row.athlete_id??''}:${row.real_team_id??''}`)??0;return {...row,_score:Number(market?.projected_points??0)*1000+verifiedRecent*100-Number(market?.overall_rank??9999)-index/1000};}).sort((a,b)=>b._score-a._score);
  const used=new Set();
  const take=position=>{let candidates=scored.filter(row=>!used.has(row.id)&&(position==='FLEX'?['RB','WR','TE'].includes(positionOf(row)):positionOf(row)===position));if(label==='Manager06'&&position==='FLEX'&&candidates.length>1)candidates=[candidates[1],candidates[0],...candidates.slice(2)];const selected=candidates[0];if(!selected)throw new Error(`${label} has no eligible ${position} roster asset`);used.add(selected.id);return selected;};
  return SLOT_PLAN.map(([slot,slotIndex,position])=>({slot,slotIndex,asset:take(position)}));
}

export function stressExecutionEnabled(env=process.env){
  return env.BIG_EXEC_STRESS_EXECUTE===EXECUTION_PHRASE || env.VERCEL_ENV==='production';
}

async function runManager({actor,password,url,key,leagueId,season,week}){
  const supabase=client(url,key);
  const {data:auth,error:authError}=await supabase.auth.signInWithPassword({email:actor.email,password});
  if(authError||!auth.user)throw new Error(`${actor.label} sign-in failed: ${authError?.message??'missing user'}`);
  const {data:ownerships,error:ownerError}=await supabase.from('franchise_owners').select('franchise_id').eq('user_id',auth.user.id).is('ends_on',null);
  if(ownerError)throw ownerError;
  const franchiseIds=(ownerships??[]).map(row=>row.franchise_id);
  const {data:franchise,error:franchiseError}=await supabase.from('franchises').select('id').eq('league_id',leagueId).in('id',franchiseIds).maybeSingle();
  if(franchiseError||!franchise)throw new Error(`${actor.label} stress franchise missing`);
  const {data:seasonFranchise,error:sfError}=await supabase.from('season_franchises').select('id').eq('league_season_id',season.id).eq('franchise_id',franchise.id).maybeSingle();
  if(sfError||!seasonFranchise)throw new Error(`${actor.label} season franchise missing`);
  const {data:roster,error:rosterError}=await supabase.from('roster_entries').select('id,athlete_id,real_team_id,athletes(position)').eq('season_franchise_id',seasonFranchise.id).is('dropped_at',null);
  if(rosterError||!roster?.length)throw new Error(`${actor.label} roster missing`);
  const athleteIds=roster.map(row=>row.athlete_id).filter(Boolean);
  const {data:marketValues,error:marketError}=athleteIds.length?await supabase.from('fantasy_player_market_values').select('athlete_id,overall_rank,projected_points').in('athlete_id',athleteIds).eq('season_year',season.competition_seasons.season_year).eq('scoring_format','half_ppr'):{data:[],error:null};
  if(marketError)throw marketError;
  const [{data:recentPlayers,error:recentPlayerError},{data:recentTeams,error:recentTeamError}]=await Promise.all([
    athleteIds.length?supabase.from('fantasy_player_scores').select('athlete_id,points').eq('league_season_id',season.id).eq('week',Math.max(1,week-1)).in('athlete_id',athleteIds):Promise.resolve({data:[],error:null}),
    supabase.from('fantasy_team_scores').select('real_team_id,points').eq('league_season_id',season.id).eq('week',Math.max(1,week-1)).in('real_team_id',roster.map(row=>row.real_team_id).filter(Boolean))
  ]);
  if(recentPlayerError||recentTeamError)throw recentPlayerError??recentTeamError;
  const recentScores=[...(recentPlayers??[]).map(row=>({...row,real_team_id:null})),...(recentTeams??[]).map(row=>({...row,athlete_id:null}))];
  const lineup=buildLineup(roster,marketValues??[],actor.label,recentScores);
  for(const item of lineup){const {error}=await supabase.rpc('set_lineup_slot',{p_season_franchise_id:seasonFranchise.id,p_week:week,p_slot:item.slot,p_slot_index:item.slotIndex,p_athlete_id:item.asset.athlete_id,p_real_team_id:item.asset.real_team_id});if(error)throw new Error(`${actor.label} ${item.slot}${item.slotIndex}: ${error.message}`);}
  const body=BANTER[actor.label](week);
  const {data:existing}=await supabase.from('league_feed_events').select('id').eq('league_id',leagueId).eq('actor_user_id',auth.user.id).eq('event_type','locker_room_message').eq('body',body).limit(1);
  if(!existing?.length){const {error}=await supabase.rpc('post_locker_room_message',{p_league_id:leagueId,p_body:body});if(error)throw new Error(`${actor.label} locker room: ${error.message}`);}
  return {actor:actor.label,week,lineupSlots:lineup.length,messagePosted:!existing?.length};
}

export async function runWeeklyQaParticipation(env=process.env,now=new Date()){
  if(!stressExecutionEnabled(env))throw new Error('Stress execution is disabled');
  const password=env.QA_AUTH_PASSWORD;if(!password)throw new Error('QA_AUTH_PASSWORD is missing');
  const leagueId=env.STRESS_TEST_LEAGUE_ID||STRESS_LEAGUE_ID;
  if(leagueId!==STRESS_LEAGUE_ID)throw new Error('Weekly QA participation is restricted to Stress Test 2026');
  const url=env.NEXT_PUBLIC_SUPABASE_URL||'https://njjiqdqhmcbxblwhfade.supabase.co';
  const key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_-ZgoAQmsSp2bNmrfhk11yw_BzLWKXBP';
  const reader=client(url,key);
  const {error:readerAuthError}=await reader.auth.signInWithPassword({email:QA_MANAGERS[0].email,password});
  if(readerAuthError)throw new Error(`Weekly QA reader sign-in failed: ${readerAuthError.message}`);
  const {data:season,error:seasonError}=await reader.from('league_seasons').select('id,competition_season_id,competition_seasons(season_year)').eq('league_id',leagueId).eq('is_current',true).maybeSingle();
  if(seasonError||!season)throw new Error('Stress Test 2026 current season missing');
  const competition=relation(season.competition_seasons);season.competition_seasons=competition;
  const {data:games,error:gamesError}=await reader.from('real_games').select('week,starts_at').eq('competition_season_id',season.competition_season_id).gte('starts_at',now.toISOString()).order('starts_at').limit(1);
  if(gamesError||!games?.length)throw new Error('No upcoming football week found');
  const week=games[0].week;
  const settled=await Promise.allSettled(QA_MANAGERS.map(actor=>runManager({actor,password,url,key,leagueId,season,week})));
  const results=settled.map((result,index)=>result.status==='fulfilled'?result.value:{actor:QA_MANAGERS[index].label,error:result.reason instanceof Error?result.reason.message:String(result.reason)});
  if(settled.some(result=>result.status==='rejected'))throw new Error(`One or more QA managers failed: ${JSON.stringify(results)}`);
  return {leagueId,week,managers:results};
}
