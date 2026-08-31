import { notFound, redirect } from 'next/navigation';
import { loadFantasyEligibleAthletes } from '../../../../lib/fantasy/athletePool';
import { createClient } from '../../../../lib/supabase/server';
import { claimFreeAgent } from './actions';

const POSITIONS=['ALL','QB','RB','WR','TE','K','D/ST'] as const;
type AthleteTeam={abbreviation?:string};
type Franchise={name?:string;abbreviation?:string};
type Athlete={display_name?:string;position?:string};
type Team={display_name?:string;abbreviation?:string};
function first<T>(value:T|T[]|null|undefined):T|null{return !value?null:Array.isArray(value)?value[0]??null:value;}

export default async function PlayersPage({params,searchParams}:{params:Promise<{leagueId:string}>;searchParams:Promise<{position?:string;q?:string;transaction_status?:string;transaction_error?:string}>}){
  const {leagueId}=await params;const query=await searchParams;const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
  const [{data:league},{data:member},{data:season},{data:ownerships}]=await Promise.all([
    supabase.from('fantasy_leagues').select('name').eq('id',leagueId).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle(),
    supabase.from('league_seasons').select('id,competition_season_id,roster_config').eq('league_id',leagueId).eq('is_current',true).maybeSingle(),
    supabase.from('franchise_owners').select('franchise_id').eq('user_id',user.id).is('ends_on',null)
  ]);
  if(!league||!member||!season)notFound();
  const [{data:competitionSeason},{data:sfs}]=await Promise.all([
    supabase.from('competition_seasons').select('competition_id').eq('id',season.competition_season_id).maybeSingle(),
    supabase.from('season_franchises').select('id,franchise_id,franchises(name,abbreviation)').eq('league_season_id',season.id)
  ]);
  const sfIds=(sfs??[]).map(sf=>sf.id);
  const rosterPromise=sfIds.length?supabase.from('roster_entries').select('id,season_franchise_id,athlete_id,real_team_id,athletes(display_name,position),real_teams(display_name,abbreviation)').in('season_franchise_id',sfIds).is('dropped_at',null):Promise.resolve({data:[] as Array<{id:string;season_franchise_id:string;athlete_id:string|null;real_team_id:string|null;athletes:Athlete|null;real_teams:Team|null}>,error:null});
  const [{data:rosters,error:rosterError},{data:athletes,error:athleteError},{data:teams,error:teamError}]=await Promise.all([
    rosterPromise,
    loadFantasyEligibleAthletes(supabase),
    competitionSeason?.competition_id?supabase.from('real_teams').select('id,display_name,abbreviation').eq('competition_id',competitionSeason.competition_id).order('abbreviation'):Promise.resolve({data:[],error:null})
  ]);
  const loadError=rosterError?.message||athleteError?.message||teamError?.message;
  const franchiseBySf=new Map((sfs??[]).map(sf=>[sf.id,first(sf.franchises as Franchise|Franchise[]|null)]));
  const athleteOwner=new Map<string,string>();const teamOwner=new Map<string,string>();
  for(const row of rosters??[]){const owner=franchiseBySf.get(row.season_franchise_id)?.abbreviation??franchiseBySf.get(row.season_franchise_id)?.name??'ROSTERED';if(row.athlete_id)athleteOwner.set(row.athlete_id,owner);if(row.real_team_id)teamOwner.set(row.real_team_id,owner);}
  const requested=(query.position??'ALL').toUpperCase();const active=POSITIONS.includes(requested as typeof POSITIONS[number])?requested:'ALL';const q=(query.q??'').trim().toLowerCase();
  const filtered=(athletes??[]).filter(a=>(active==='ALL'||a.position===active)&&active!=='D/ST').filter(a=>!q||a.display_name.toLowerCase().includes(q));
  const filteredTeams=(teams??[]).filter(t=>(active==='ALL'||active==='D/ST')&&(!q||`${t.abbreviation??''} ${t.display_name??''}`.toLowerCase().includes(q)));
  const ownedFranchiseIds=new Set((ownerships??[]).map(row=>row.franchise_id));
  const mySf=(sfs??[]).find(sf=>ownedFranchiseIds.has(sf.franchise_id));
  const myRoster=(rosters??[]).filter(row=>row.season_franchise_id===mySf?.id);
  const starterCount=Object.values((season.roster_config as {starters?:Record<string,number>}|null)?.starters??{}).reduce((sum,value)=>sum+Number(value),0);
  const rosterLimit=starterCount+Number((season.roster_config as {bench?:number}|null)?.bench??0);
  const rosterFull=myRoster.length>=rosterLimit;
  const dropLabel=(row:typeof myRoster[number])=>{if(row.athlete_id){const athlete=first(row.athletes as Athlete|Athlete[]|null);return `${athlete?.position??''} • ${athlete?.display_name??'Player'}`;}const team=first(row.real_teams as Team|Team[]|null);return `D/ST • ${team?.abbreviation??team?.display_name??'Defense'}`;};
  const claimForm=(asset:{athleteId?:string;realTeamId?:string})=>!mySf?<span className="freeAgentUnavailable">NO FRANCHISE</span>:<details className="freeAgentClaim"><summary>ADD</summary><form action={claimFreeAgent}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="season_franchise_id" value={mySf.id}/><input type="hidden" name="position" value={active}/>{asset.athleteId&&<input type="hidden" name="athlete_id" value={asset.athleteId}/>} {asset.realTeamId&&<input type="hidden" name="real_team_id" value={asset.realTeamId}/>}<label>{rosterFull?'Choose a player to drop':'Optional: drop a player'}<select name="drop_roster_entry_id" required={rosterFull}><option value="">{rosterFull?'Select from your roster':'No drop needed'}</option>{myRoster.map(row=><option key={row.id} value={row.id}>{dropLabel(row)}</option>)}</select></label><button className="primary" type="submit">Confirm Add</button></form></details>;
  return <main>
    <section className="leagueHero" style={{minHeight:320}}><div className="leagueHeroGlow"/><div className="leagueTopline"><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><span className="leagueRole">PLAYER INDEX</span></div><div className="leagueHeroContent"><p className="eyebrow">BIG EXEC • {league.name}</p><h1>Players.</h1><p className="leagueTagline">Know the pool. Know who is rostered. Build the next move.</p><div className="leagueMetaRow"><span>QB / RB / WR / TE / K</span><span>D/ST</span></div></div></section>
    {loadError&&<p className="errorNotice" role="alert">Player status could not be fully loaded: {loadError}</p>}
    {query.transaction_status==='added'&&<p className="successNotice" role="status">Free agent added to your roster.</p>}
    {query.transaction_error&&<p className="errorNotice" role="alert">{query.transaction_error}</p>}
    <section className="panel"><form className="inlineForm" method="get"><input name="q" defaultValue={query.q??''} placeholder="Search player or team" aria-label="Search players"/><input type="hidden" name="position" value={active}/><button className="secondary">Search</button></form><div className="actions" aria-label="Position filters">{POSITIONS.map(pos=><a key={pos} className={active===pos?'primary':'secondary'} href={`?position=${encodeURIComponent(pos)}${query.q?`&q=${encodeURIComponent(query.q)}`:''}`}>{pos}</a>)}</div></section>
    {active!=='D/ST'&&<section className="panel"><p className="eyebrow">INDIVIDUAL PLAYERS</p><div className="playerList">{filtered.map(a=>{const team=first(a.real_teams as AthleteTeam|AthleteTeam[]|null);const owner=athleteOwner.get(a.id);return <article className="playerRow" key={a.id}><div><span>{a.position} • {team?.abbreviation??'FA'} • {owner?`ROSTERED: ${owner}`:'AVAILABLE'}</span><strong>{a.display_name}</strong></div>{owner?<b className="rosteredStatus">ROSTERED</b>:claimForm({athleteId:a.id})}</article>})}{!filtered.length&&<p className="lede">No players match this filter.</p>}</div></section>}
    {(active==='ALL'||active==='D/ST')&&<section className="panel"><p className="eyebrow">D/ST</p><h2>Available defenses.</h2><div className="playerList">{filteredTeams.map(t=>{const owner=teamOwner.get(t.id);return <article className="playerRow" key={t.id}><div><span>D/ST • {owner?`ROSTERED: ${owner}`:'AVAILABLE'}</span><strong>{t.abbreviation??t.display_name} D/ST</strong></div>{owner?<b className="rosteredStatus">ROSTERED</b>:claimForm({realTeamId:t.id})}</article>})}</div></section>}
  </main>;
}
