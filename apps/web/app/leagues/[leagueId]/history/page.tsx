import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { FranchiseCrest } from '../../../components/FranchiseCrest';

type CompetitionSeason={season_year?:number};
type Achievement={code?:string;display_name?:string};
type Franchise={id:string;name:string;abbreviation:string|null;primary_color:string|null;secondary_color:string|null;established_year:number|null};
function first<T>(value:T|T[]|null|undefined):T|null{return !value?null:Array.isArray(value)?value[0]??null:value;}

export default async function LeagueHistoryPage({params}:{params:Promise<{leagueId:string}>}){
  const {leagueId}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');

  const [{data:league},{data:member},{data:franchises},{data:seasons},{data:rivalries}]=await Promise.all([
    supabase.from('fantasy_leagues').select('id,name').eq('id',leagueId).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle(),
    supabase.from('franchises').select('id,name,abbreviation,primary_color,secondary_color,established_year').eq('league_id',leagueId).order('created_at'),
    supabase.from('league_seasons').select('id,status,is_current,competition_seasons(season_year)').eq('league_id',leagueId),
    supabase.from('rivalries').select('id,franchise_a_id,franchise_b_id,designated,rivalry_score').eq('league_id',leagueId).eq('designated',true).order('rivalry_score',{ascending:false})
  ]);
  if(!league||!member) notFound();

  const seasonRows=(seasons??[]).map(row=>({
    ...row,
    year:first(row.competition_seasons as CompetitionSeason|CompetitionSeason[]|null)?.season_year??0
  })).sort((a,b)=>b.year-a.year);
  const historical=seasonRows.filter(s=>!s.is_current&&s.status==='complete');
  const current=seasonRows.find(s=>s.is_current);
  const seasonIds=seasonRows.map(s=>s.id);
  const historicalIds=historical.map(s=>s.id);

  const [{data:sfs},{data:standings},{data:championships},{data:achievements},{data:rivalryGames},{data:recaps},{data:stadiums}]=await Promise.all([
    seasonIds.length?supabase.from('season_franchises').select('id,league_season_id,franchise_id').in('league_season_id',seasonIds):Promise.resolve({data:[]}),
    historicalIds.length?supabase.from('standings').select('league_season_id,season_franchise_id,wins,losses,ties,points_for,points_against').in('league_season_id',historicalIds):Promise.resolve({data:[]}),
    historicalIds.length?supabase.from('championships').select('league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id,awarded_at').in('league_season_id',historicalIds):Promise.resolve({data:[]}),
    historicalIds.length?supabase.from('franchise_achievements').select('franchise_id,league_season_id,week,earned_at,achievements(code,display_name)').in('league_season_id',historicalIds):Promise.resolve({data:[]}),
    historicalIds.length?supabase.from('matchups').select('id,league_season_id,week,home_season_franchise_id,away_season_franchise_id,home_points,away_points,winner_season_franchise_id').in('league_season_id',historicalIds).eq('event_type','rivalry').eq('is_final',true):Promise.resolve({data:[]}),
    historicalIds.length?supabase.from('recap_scripts').select('id,league_season_id,matchup_id,title').in('league_season_id',historicalIds):Promise.resolve({data:[]}),
    (franchises?.length??0)?supabase.from('stadiums').select('id,franchise_id,franchise_stadium_features(stadium_feature_id)').in('franchise_id',(franchises??[]).map(f=>f.id)):Promise.resolve({data:[]})
  ]);

  const franchiseMap=new Map((franchises??[]).map(f=>[f.id,f as Franchise]));
  const sfToFranchise=new Map((sfs??[]).map(sf=>[sf.id,sf.franchise_id]));
  const sfBySeasonFranchise=new Map((sfs??[]).map(sf=>[`${sf.league_season_id}:${sf.franchise_id}`,sf.id]));
  const yearBySeason=new Map(seasonRows.map(s=>[s.id,s.year]));
  const stadiumByFranchise=new Map((stadiums??[]).map(s=>[s.franchise_id,s]));
  const recapByMatchup=new Map((recaps??[]).map(r=>[r.matchup_id,r]));
  const achievementCode=(row:NonNullable<typeof achievements>[number])=>first(row.achievements as Achievement|Achievement[]|null)?.code??'';

  const ledger=(franchises??[]).map(franchise=>{
    const seasonSfIds=(sfs??[]).filter(sf=>historicalIds.includes(sf.league_season_id)&&sf.franchise_id===franchise.id).map(sf=>sf.id);
    const rows=(standings??[]).filter(s=>seasonSfIds.includes(s.season_franchise_id));
    const ownAchievements=(achievements??[]).filter(a=>a.franchise_id===franchise.id);
    const featureRelation=stadiumByFranchise.get(franchise.id)?.franchise_stadium_features as Array<{stadium_feature_id?:string}>|null|undefined;
    return {
      franchise,
      wins:rows.reduce((sum,row)=>sum+Number(row.wins??0),0),
      losses:rows.reduce((sum,row)=>sum+Number(row.losses??0),0),
      ties:rows.reduce((sum,row)=>sum+Number(row.ties??0),0),
      points:rows.reduce((sum,row)=>sum+Number(row.points_for??0),0),
      titles:ownAchievements.filter(a=>achievementCode(a)==='LEAGUE_CHAMPION').length,
      redemption:ownAchievements.filter(a=>achievementCode(a)==='REDEMPTION_CHAMPION').length,
      rivalryWins:ownAchievements.filter(a=>achievementCode(a)==='RIVALRY_WIN').length,
      chaosWins:ownAchievements.filter(a=>achievementCode(a)==='CHAOS_GIANT_KILLER').length,
      unlocks:featureRelation?.length??0
    };
  }).sort((a,b)=>b.titles-a.titles||b.wins-a.wins||b.points-a.points);

  const seasonCards=historical.map(season=>{
    const seasonSfs=(sfs??[]).filter(sf=>sf.league_season_id===season.id);
    const seasonStandings=(standings??[]).filter(row=>row.league_season_id===season.id).sort((a,b)=>Number(b.wins)-Number(a.wins)||Number(b.points_for)-Number(a.points_for));
    const champ=(championships??[]).find(c=>c.league_season_id===season.id&&c.bracket==='championship');
    const redemption=(championships??[]).find(c=>c.league_season_id===season.id&&c.bracket==='redemption');
    const nameForSf=(id:string|null)=>{const sf=seasonSfs.find(x=>x.id===id);return sf?franchiseMap.get(sf.franchise_id)?.name:null;};
    const top=seasonStandings.slice(0,3).map(row=>({row,name:nameForSf(row.season_franchise_id)}));
    const recap=champ?.final_matchup_id?recapByMatchup.get(champ.final_matchup_id):null;
    return {season,champion:nameForSf(champ?.winner_season_franchise_id??null),runnerUp:nameForSf(champ?.runner_up_season_franchise_id??null),redemption:nameForSf(redemption?.winner_season_franchise_id??null),top,recap};
  });

  const rivalryLedger=(rivalries??[]).map(r=>{
    const a=franchiseMap.get(r.franchise_a_id),b=franchiseMap.get(r.franchise_b_id);
    const games=(rivalryGames??[]).filter(game=>{
      const home=sfToFranchise.get(game.home_season_franchise_id),away=sfToFranchise.get(game.away_season_franchise_id);
      return (home===r.franchise_a_id&&away===r.franchise_b_id)||(home===r.franchise_b_id&&away===r.franchise_a_id);
    }).sort((x,y)=>(yearBySeason.get(y.league_season_id)??0)-(yearBySeason.get(x.league_season_id)??0));
    const aWins=games.filter(g=>sfToFranchise.get(g.winner_season_franchise_id??'')===r.franchise_a_id).length;
    const bWins=games.filter(g=>sfToFranchise.get(g.winner_season_franchise_id??'')===r.franchise_b_id).length;
    return {r,a,b,games,aWins,bWins};
  });

  const totalUnlocks=ledger.reduce((sum,row)=>sum+row.unlocks,0);
  const titleLeader=ledger[0];
  const currentYear=current?.year||new Date().getFullYear();

  return <main className="leagueShell">
    <section className="leagueHero">
      <div className="leagueHeroGlow"/>
      <div className="leagueTopline"><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><span className="leagueRole">HISTORY / LEGACY</span></div>
      <div className="leagueHeroContent"><p className="eyebrow">BIG EXEC • {league.name}</p><h1>The receipts.</h1><p className="leagueTagline">Every title, rivalry, collapse, comeback and stadium unlock survives the season that created it.</p><div className="leagueMetaRow"><span>{historical.length} COMPLETED SEASONS</span><span>{currentYear} CURRENT</span><span>{rivalryLedger.length} DESIGNATED RIVALRIES</span></div></div>
    </section>

    <section className="leagueQuickGrid">
      <article className="leagueStatCard featured"><span>ALL-TIME TITLE LEADER</span><strong>{titleLeader?.franchise.name??'No champion yet'}</strong><p>{titleLeader?.titles??0} championship{titleLeader?.titles===1?'':'s'} across the archive.</p></article>
      <article className="leagueStatCard"><span>LEGACY BUILT</span><strong>{totalUnlocks}</strong><p>Persistent stadium feature unlocks across the league.</p></article>
      <article className="leagueStatCard"><span>RIVALRY GAMES</span><strong>{rivalryLedger.reduce((sum,row)=>sum+row.games.length,0)}</strong><p>Designated head-to-head rivalry results preserved.</p></article>
    </section>

    <section className="panel"><p className="eyebrow">SEASON ARCHIVE</p><h2>Five years in the books.</h2><div className="weekStack">{seasonCards.map(card=><article className="weekCard" key={card.season.id}><div className="weekHeader"><div><span>{card.season.year} • FINAL</span><strong>{card.champion??'Champion'} — League Champion</strong></div><small>{card.redemption?`${card.redemption} • Redemption`:''}</small></div><p className="lede">Runner-up: {card.runnerUp??'—'}</p><div className="standingsList">{card.top.map((entry,index)=><div className="standingRow" key={entry.row.season_franchise_id}><b>{index+1}</b><span>{entry.name??'Franchise'}</span><small>{entry.row.wins}-{entry.row.losses}{entry.row.ties?`-${entry.row.ties}`:''}</small><small>PF {Number(entry.row.points_for).toFixed(1)}</small></div>)}</div>{card.recap&&<div className="actions"><a className="secondary" href={`/recaps/${card.recap.id}`}>Open championship memory →</a></div>}</article>)}</div></section>

    <section className="panel"><p className="eyebrow">ALL-TIME FRANCHISE LEDGER</p><h2>What each franchise has built.</h2><div className="franchiseGrid">{ledger.map((row,index)=>{const f=row.franchise as Franchise;return <a href={`/franchises/${f.id}/stadium`} key={f.id}><article className={`franchiseCard ${index===0?'myFranchise':''}`} style={{'--team-primary':f.primary_color??'#d9b43b','--team-secondary':f.secondary_color??'#f5f1e8'} as React.CSSProperties}><div className="franchiseCardTop"><span>ALL-TIME #{index+1}</span><b>{f.abbreviation??'BEX'}</b></div><FranchiseCrest className="franchiseMonogram franchiseCardCrest" name={f.name} abbreviation={f.abbreviation} primary={f.primary_color} secondary={f.secondary_color} decorative/><strong>{f.name}</strong><p>{row.wins}-{row.losses}{row.ties?`-${row.ties}`:''} • {row.titles} TITLE{row.titles===1?'':'S'} • {row.redemption} REDEMPTION</p><p>{row.rivalryWins} rivalry wins • {row.chaosWins} Chaos upset{row.chaosWins===1?'':'s'} • {row.unlocks} stadium unlocks</p><em>ENTER LEGACY STADIUM →</em></article></a>})}</div></section>

    <section className="panel"><p className="eyebrow">RIVALRY LEDGER</p><h2>Head-to-head has a memory.</h2><div className="weekStack">{rivalryLedger.map(row=><article className="weekCard" key={row.r.id}><div className="weekHeader"><div><span>RIVALRY SCORE {row.r.rivalry_score}</span><strong>{row.a?.name??'Franchise'} {row.aWins} — {row.bWins} {row.b?.name??'Franchise'}</strong></div><small>{row.games.length} rivalry weeks</small></div><div className="playerList">{row.games.map(game=>{const year=yearBySeason.get(game.league_season_id);const winnerId=sfToFranchise.get(game.winner_season_franchise_id??'');const winner=winnerId?franchiseMap.get(winnerId)?.name:'Tie';return <div className="playerRow" key={game.id}><div><span>{year} • WEEK {game.week}</span><strong>{winner} won {Number(game.home_points).toFixed(1)}–{Number(game.away_points).toFixed(1)}</strong></div></div>})}</div></article>)}</div></section>
  </main>;
}
