'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { SportradarNflClient, type RadarScheduleGame } from '../../../lib/sports-data/sportradar';

const YEARS=[2021,2022,2023,2024,2025] as const;
const normalizeAlias=(alias?:string)=>alias?.trim().toUpperCase()==='JAC'?'JAX':alias?.trim().toUpperCase();
function stateFor(status?:string){
  const s=(status??'').toLowerCase().replaceAll('_','').replaceAll('-','');
  if(['closed','complete','completed','final'].includes(s))return 'final';
  if(['inprogress','halftime'].includes(s))return 'in_progress';
  if(s==='postponed')return 'postponed'; if(['cancelled','canceled'].includes(s))return 'canceled'; if(s==='delayed')return 'delayed'; if(s==='suspended')return 'suspended'; if(['scheduled','created'].includes(s))return 'scheduled'; return 'unknown';
}
function score(game:RadarScheduleGame,side:'home'|'away'){const direct=side==='home'?game.home_points:game.away_points;const nested=side==='home'?game.scoring?.home_points:game.scoring?.away_points;const value=direct??nested;return Number.isFinite(Number(value))?Number(value):null;}

export async function syncSportradarHistoricalSchedules(){
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
  const {count}=await supabase.from('league_members').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('role','commissioner'); if(!count) redirect('/dashboard');
  const admin=createAdminClient(); const radar=new SportradarNflClient();
  const {data:competition,error:competitionError}=await admin.from('competitions').select('id').eq('code','pro_football').single(); if(competitionError||!competition)throw new Error(competitionError?.message??'Pro Football competition missing.');
  const {data:teams,error:teamError}=await admin.from('real_teams').select('id,abbreviation').eq('competition_id',competition.id); if(teamError)throw new Error(teamError.message);
  const teamIds=new Map((teams??[]).map(team=>[normalizeAlias(team.abbreviation),team.id]));
  let importedGames=0,requests=0;
  for(const year of YEARS){
    const schedule=await radar.getSeasonSchedule(year); requests=schedule.requests;
    const starts=schedule.weeks.flatMap(w=>w.games.map(g=>g.scheduled).filter((x):x is string=>!!x)).sort();
    const {data:season,error:seasonError}=await admin.from('competition_seasons').upsert({competition_id:competition.id,season_year:year,starts_on:starts[0]?.slice(0,10)??null,ends_on:starts.at(-1)?.slice(0,10)??null},{onConflict:'competition_id,season_year'}).select('id').single();
    if(seasonError||!season)throw new Error(seasonError?.message??`Could not resolve ${year} season.`);
    const rows=[] as Array<Record<string,unknown>>;
    const missing=new Set<string>();
    for(const week of schedule.weeks){
      for(const game of week.games){
        const home=teamIds.get(normalizeAlias(game.home?.alias)),away=teamIds.get(normalizeAlias(game.away?.alias));
        if(!home){missing.add(game.home?.alias??game.home?.name??game.home?.id??'HOME');continue;} if(!away){missing.add(game.away?.alias??game.away?.name??game.away?.id??'AWAY');continue;}
        rows.push({competition_season_id:season.id,provider_game_id:game.id,week:week.sequence,home_team_id:home,away_team_id:away,starts_at:game.scheduled??null,state:stateFor(game.status),home_score:score(game,'home'),away_score:score(game,'away'),updated_at:new Date().toISOString()});
      }
    }
    if(missing.size)throw new Error(`${year} has unmapped NFL teams: ${[...missing].join(', ')}`);
    if(rows.length<250)throw new Error(`${year} schedule returned only ${rows.length} regular-season games; no rows were written for that year.`);
    for(let index=0;index<rows.length;index+=200){const {error}=await admin.from('real_games').upsert(rows.slice(index,index+200),{onConflict:'provider_game_id'});if(error)throw new Error(error.message);}
    importedGames+=rows.length;
  }
  redirect(`/admin/data?history_synced=1&history_games=${importedGames}&history_years=${YEARS.length}&history_requests=${requests}`);
}
