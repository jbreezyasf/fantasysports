'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { SportradarNflClient } from '../../../lib/sports-data/sportradar';

const ACTIVE_ROSTER_STATUSES = new Set(['ACT','EXE','IR','IRD','NON','PUP','SUS']);
const DRAFT_POSITIONS = new Set(['QB','RB','WR','TE','K']);
const normalizeNflAlias = (alias?: string) => alias?.trim().toUpperCase() === 'JAC' ? 'JAX' : alias?.trim().toUpperCase();

async function commissionerUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { count } = await supabase.from('league_members').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('role','commissioner');
  if (!count) throw new Error('Commissioner access required.');
  return { user, supabase };
}

export async function syncSportradarDraftPool() {
  await commissionerUser();
  const admin = createAdminClient();
  const radar = new SportradarNflClient();
  const snapshot = await radar.getDraftSnapshot(2026);
  const { data: competition, error: competitionError } = await admin.from('competitions').select('id').eq('code','pro_football').single();
  if (competitionError || !competition) throw new Error(competitionError?.message ?? 'Pro Football competition missing.');
  const { data: dbTeams, error: teamsError } = await admin.from('real_teams').select('id,abbreviation').eq('competition_id',competition.id);
  if (teamsError) throw new Error(teamsError.message);
  const teamIds = new Map((dbTeams ?? []).map(team => [team.abbreviation?.toUpperCase(), team.id]));
  const missingTeams = snapshot.teams.filter(team => !teamIds.has(normalizeNflAlias(team.alias))).map(team => team.alias ?? team.name ?? team.id);
  if (missingTeams.length) throw new Error(`Unmapped NFL teams: ${missingTeams.join(', ')}`);

  const { error: seasonError } = await admin.from('competition_seasons').upsert({
    competition_id: competition.id,
    season_year: snapshot.season.year,
    starts_on: snapshot.season.startsOn ?? null,
    ends_on: snapshot.season.endsOn ?? null,
  },{onConflict:'competition_id,season_year'});
  if (seasonError) throw new Error(seasonError.message);

  const existingAthletes: Array<{id:string;display_name:string;position:string;real_team_id:string|null}> = [];
  const providerRows: Array<{athlete_id:string;provider_athlete_id:string}> = [];
  for (let from=0;;from+=1000) {
    const {data,error}=await admin.from('athletes').select('id,display_name,position,real_team_id').eq('competition_id',competition.id).range(from,from+999);
    if(error) throw new Error(error.message);
    existingAthletes.push(...(data??[]));
    if((data?.length??0)<1000) break;
  }
  for (let from=0;;from+=1000) {
    const {data,error}=await admin.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider','sportradar').range(from,from+999);
    if(error) throw new Error(error.message);
    providerRows.push(...(data??[]));
    if((data?.length??0)<1000) break;
  }
  const byIdentity = new Map(existingAthletes.map(a => [`${a.display_name.toLowerCase()}|${a.position}|${a.real_team_id ?? ''}`,a.id]));
  const byProvider = new Map(providerRows.map(row => [row.provider_athlete_id,row.athlete_id]));
  let inserted = 0, updated = 0, eligible = 0;
  const seenAthleteIds = new Set<string>();
  const athleteRows: Array<{id:string;competition_id:string;display_name:string;position:string;real_team_id:string;active:boolean;injury_status:string|null;updated_at:string}> = [];
  const newRows: Array<{radarId:string;competition_id:string;display_name:string;position:string;real_team_id:string;active:boolean;injury_status:string|null}> = [];
  const providerLinks: Array<{athlete_id:string;provider:string;provider_athlete_id:string}> = [];
  const seenSnapshotIdentities = new Set<string>();

  for (const team of snapshot.teams) {
    const realTeamId = teamIds.get(normalizeNflAlias(team.alias));
    if (!realTeamId) continue;
    for (const player of team.players) {
      const displayName = (player.name ?? player.full_name ?? '').trim();
      const position = (player.position ?? '').trim().toUpperCase();
      if (!displayName || !position || !player.id) continue;
      const identity = `${displayName.toLowerCase()}|${position}|${realTeamId}`;
      if (seenSnapshotIdentities.has(identity)) continue;
      seenSnapshotIdentities.add(identity);
      const active = ACTIVE_ROSTER_STATUSES.has((player.status ?? 'ACT').toUpperCase());
      const knownId = byProvider.get(player.id) ?? byIdentity.get(identity);
      if (knownId) {
        athleteRows.push({id:knownId,competition_id:competition.id,display_name:displayName,position,real_team_id:realTeamId,active,injury_status:player.status ?? null,updated_at:new Date().toISOString()});
        providerLinks.push({athlete_id:knownId,provider:'sportradar',provider_athlete_id:player.id});
        seenAthleteIds.add(knownId);
        updated += 1;
      } else {
        newRows.push({radarId:player.id,competition_id:competition.id,display_name:displayName,position,real_team_id:realTeamId,active,injury_status:player.status ?? null});
      }
      if (active && DRAFT_POSITIONS.has(position)) eligible += 1;
    }
  }
  if (eligible < 250) throw new Error(`Sportradar returned only ${eligible} active fantasy-eligible players; existing pool was left active.`);
  for (let index=0; index<athleteRows.length; index+=200) {
    const {error}=await admin.from('athletes').upsert(athleteRows.slice(index,index+200));
    if(error) throw new Error(error.message);
  }
  for (let index=0; index<newRows.length; index+=200) {
    const batch=newRows.slice(index,index+200);
    const {data,error}=await admin.from('athletes').insert(batch.map(({radarId:_,...row})=>row)).select('id,display_name,position,real_team_id');
    if(error||!data) throw new Error(error?.message??'Could not insert Sportradar athletes.');
    const insertedByIdentity=new Map(data.map(row=>[`${row.display_name.toLowerCase()}|${row.position}|${row.real_team_id??''}`,row.id]));
    for(const row of batch){const id=insertedByIdentity.get(`${row.display_name.toLowerCase()}|${row.position}|${row.real_team_id}`);if(id){seenAthleteIds.add(id);providerLinks.push({athlete_id:id,provider:'sportradar',provider_athlete_id:row.radarId});inserted+=1;}}
  }
  for (let index=0; index<providerLinks.length; index+=200) {
    const {error}=await admin.from('athlete_provider_ids').upsert(providerLinks.slice(index,index+200),{onConflict:'provider,provider_athlete_id'});
    if(error) throw new Error(error.message);
  }
  const staleIds=existingAthletes.map(a=>a.id).filter(id=>!seenAthleteIds.has(id));
  for(let index=0;index<staleIds.length;index+=200){
    const {error}=await admin.from('athletes').update({active:false,updated_at:new Date().toISOString()}).in('id',staleIds.slice(index,index+200));
    if(error) throw new Error(error.message);
  }
  redirect(`/admin/data?synced=1&inserted=${inserted}&updated=${updated}&eligible=${eligible}&requests=${snapshot.requests}`);
}

export async function createSportradarDraftLab() {
  const { user, supabase } = await commissionerUser();
  const admin = createAdminClient();
  const { data: competition } = await admin.from('competitions').select('id').eq('code','pro_football').single();
  const { data: season } = await admin.from('competition_seasons').select('id').eq('competition_id',competition!.id).eq('season_year',2026).maybeSingle();
  if (!season) redirect('/admin/data?error=Sync+Sportradar+before+creating+the+draft+lab.');
  const { data: scoring } = await admin.from('scoring_profiles').select('id').eq('sport','football').eq('is_system_default',true).limit(1).single();
  const { data: existing } = await admin.from('fantasy_leagues').select('id').eq('created_by',user.id).eq('name','Sportradar 2026 Draft Lab').maybeSingle();
  let leagueId = existing?.id;
  if (!leagueId) {
    const { data: league, error } = await admin.from('fantasy_leagues').insert({name:'Sportradar 2026 Draft Lab',created_by:user.id,draft_min_franchises:2,max_franchises:2}).select('id').single();
    if (error || !league) throw new Error(error?.message ?? 'Could not create draft lab.');
    leagueId = league.id;
    await admin.from('league_members').insert({league_id:leagueId,user_id:user.id,role:'commissioner'});
    const { data: leagueSeason } = await admin.from('league_seasons').insert({league_id:leagueId,competition_season_id:season.id,status:'setup',roster_config:{starters:{QB:1,RB:2,WR:2,TE:1,FLEX:1,K:1,DST:1},bench:6,ir:1},scoring_profile_id:scoring?.id}).select('id').single();
    const { data: franchises, error: franchiseError } = await admin.from('franchises').insert([
      {league_id:leagueId,name:'Sportradar Gold',abbreviation:'SRG',primary_color:'#d9b43b',secondary_color:'#08090a',established_year:2026},
      {league_id:leagueId,name:'Sportradar Night',abbreviation:'SRN',primary_color:'#7447ff',secondary_color:'#f5f1e8',established_year:2026},
    ]).select('id');
    if (franchiseError || !leagueSeason || !franchises?.length) throw new Error(franchiseError?.message ?? 'Could not create draft franchises.');
    await admin.from('franchise_owners').insert(franchises.map(f => ({franchise_id:f.id,user_id:user.id})));
    const { data: seasonFranchises } = await admin.from('season_franchises').insert(franchises.map((f,index) => ({league_season_id:leagueSeason.id,franchise_id:f.id,draft_position:index+1}))).select('id');
    if (seasonFranchises?.length) await admin.from('standings').insert(seasonFranchises.map(sf => ({league_season_id:leagueSeason.id,season_franchise_id:sf.id})));
  }
  const { data, error } = await supabase.rpc('initialize_snake_draft',{p_league_id:leagueId,p_pick_seconds:90,p_starts_at:null});
  if (error) redirect(`/admin/data?error=${encodeURIComponent(error.message)}`);
  redirect(`/drafts/${(data as {draft_id:string}).draft_id}`);
}
