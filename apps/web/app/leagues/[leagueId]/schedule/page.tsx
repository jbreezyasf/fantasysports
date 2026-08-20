import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { advancePostseason, generateSpecialWeek } from '../../actions';

type Franchise = { name?:string; abbreviation?:string };
function first<T>(value:T|T[]|null|undefined):T|null { return !value ? null : Array.isArray(value) ? value[0] ?? null : value; }

export default async function SchedulePage({ params, searchParams }:{params:Promise<{leagueId:string}>;searchParams:Promise<{error?:string;generated?:string}>}) {
  const { leagueId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data:league } = await supabase.from('fantasy_leagues').select('name').eq('id',leagueId).maybeSingle();
  if (!league) notFound();
  const { data:member } = await supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle();
  if (!member) notFound();
  const { data:season } = await supabase.from('league_seasons').select('id,status').eq('league_id',leagueId).maybeSingle();
  if (!season) notFound();
  const { data:seasonFranchises } = await supabase.from('season_franchises').select('id,franchises(name,abbreviation)').eq('league_season_id',season.id);
  const franchiseMap = new Map((seasonFranchises ?? []).map(sf=>[sf.id,first(sf.franchises as Franchise|Franchise[]|null)]));
  const [{ data:matchups },{ data:standings },{ data:seeds },{ data:titles }] = await Promise.all([
    supabase.from('matchups').select('id,week,event_type,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final').eq('league_season_id',season.id).order('week').order('id'),
    supabase.from('standings').select('season_franchise_id,wins,losses,ties,points_for,points_against,streak').eq('league_season_id',season.id).order('wins',{ascending:false}).order('points_for',{ascending:false}),
    supabase.from('postseason_seeds').select('season_franchise_id,seed,bracket').eq('league_season_id',season.id).order('seed'),
    supabase.from('championships').select('bracket,winner_season_franchise_id').eq('league_season_id',season.id)
  ]);
  const weeks = Array.from({length:17},(_,i)=>i+1);
  const eventName = (week:number) => week<=9 ? 'THE CIRCUIT' : ({10:'RIVALRY WEEK',11:'REVENGE WEEK',12:'POSITION WEEK',13:'CHAOS WEEK',14:'JUDGMENT WEEK',15:'POSTSEASON OPENING',16:'CHAMPIONSHIP SEMIFINALS',17:'FINALS'} as Record<number,string>)[week];
  const isCommissioner = member.role==='commissioner';
  const week14Final = (matchups??[]).filter(m=>m.week===14).length>0 && (matchups??[]).filter(m=>m.week===14).every(m=>m.is_final);
  const qfFinal = (matchups??[]).filter(m=>m.week===15&&m.event_type==='playoff_qf').length===2 && (matchups??[]).filter(m=>m.week===15&&m.event_type==='playoff_qf').every(m=>m.is_final);
  const sfFinal = (matchups??[]).filter(m=>m.week===16&&m.event_type==='playoff_sf').length===2 && (matchups??[]).filter(m=>m.week===16&&m.event_type==='playoff_sf').every(m=>m.is_final);
  const redSfFinal = (matchups??[]).filter(m=>m.week===15&&m.event_type==='redemption_sf').length===2 && (matchups??[]).filter(m=>m.week===15&&m.event_type==='redemption_sf').every(m=>m.is_final);
  const finalsFinal = (matchups??[]).filter(m=>m.week===17&&['championship','redemption_final'].includes(m.event_type)).length===2 && (matchups??[]).filter(m=>m.week===17&&['championship','redemption_final'].includes(m.event_type)).every(m=>m.is_final);
  const champion = titles?.find(t=>t.bracket==='championship');
  const redemption = titles?.find(t=>t.bracket==='redemption');

  return <main>
    <section className="panel"><p className="eyebrow">LEAGUE / SEASON</p><h1>{league.name}</h1><p className="lede">Weeks 1–9 establish the field. Weeks 10–14 turn standings and history into events. Weeks 15–17 decide the title and Redemption champion.</p>{query.error&&<p className="errorNotice" role="alert">{query.error}</p>}{query.generated&&<p className="successNotice">Season phase updated: {query.generated.toUpperCase()}.</p>}</section>

    <section className="panel"><p className="eyebrow">STANDINGS</p><div className="standingsList">{(standings??[]).map((s,index)=>{const f=franchiseMap.get(s.season_franchise_id);return <div className="standingRow" key={s.season_franchise_id}><b>{index+1}</b><strong>{f?.name??'Franchise'}</strong><span>{s.wins}-{s.losses}{s.ties?`-${s.ties}`:''}</span><small>{Number(s.points_for).toFixed(1)} PF</small></div>})}</div></section>

    {!!seeds?.length&&<section className="panel"><p className="eyebrow">POSTSEASON FIELD</p><h2>Seeds are locked.</h2><div className="standingsList">{seeds.map(s=>{const f=franchiseMap.get(s.season_franchise_id);return <div className="standingRow" key={s.season_franchise_id}><b>#{s.seed}</b><strong>{f?.name??'Franchise'}</strong><span>{s.bracket==='championship'?'TITLE FIELD':'REDEMPTION'}</span></div>})}</div>{champion&&<p className="successNotice">League Champion: {franchiseMap.get(champion.winner_season_franchise_id)?.name??'Champion'}</p>}{redemption&&<p className="successNotice">Redemption Champion: {franchiseMap.get(redemption.winner_season_franchise_id)?.name??'Champion'}</p>}</section>}

    <section className="panel"><p className="eyebrow">SCHEDULE</p><div className="weekStack">{weeks.map(week=>{const games=(matchups??[]).filter(m=>m.week===week);const special=({10:'rivalry',11:'revenge',12:'position',13:'chaos',14:'judgment'} as Record<number,string>)[week];return <article className="weekCard" key={week}><div className="weekHeader"><div><span>WEEK {week}</span><strong>{eventName(week)}</strong></div>{isCommissioner&&games.length===0&&special&&<form action={generateSpecialWeek}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="event_type" value={special}/><button className="miniAction">Generate</button></form>}{isCommissioner&&week===15&&games.length===0&&week14Final&&<form action={advancePostseason}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="phase" value="seed"/><button className="miniAction">Lock Seeds + Build Week 15</button></form>}{isCommissioner&&week===16&&games.length===0&&qfFinal&&<form action={advancePostseason}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="phase" value="week16"/><button className="miniAction">Build Semifinals</button></form>}{isCommissioner&&week===17&&games.length===0&&sfFinal&&redSfFinal&&<form action={advancePostseason}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="phase" value="week17"/><button className="miniAction">Build Finals</button></form>}</div>{games.length?games.map(game=>{const h=franchiseMap.get(game.home_season_franchise_id);const a=franchiseMap.get(game.away_season_franchise_id);return <a className="scheduleGame" key={game.id} href={`/matchups/${game.id}`}><div><strong>{h?.abbreviation??h?.name??'HOME'}</strong><span>{Number(game.home_points).toFixed(2)}</span></div><em>{game.is_final?'FINAL':'VS'}</em><div><strong>{a?.abbreviation??a?.name??'AWAY'}</strong><span>{Number(game.away_points).toFixed(2)}</span></div></a>}):<p className="lede">{week===13?'Standings inversion: #1 vs #10 through #5 vs #6. Upsets earn Giant Killer status; scoring stays normal.':week===14?'Playoff-consequence pairings: #1 vs #4, #2 vs #3, #5 vs #6, #7 vs #8, #9 vs #10.':week===16&&seeds?.length?'Championship semifinalists are generated after Week 15 finals. Redemption winners rest this week.':week>=15?'Postseason phase unlocks after the prior required games are final.':'Not generated yet.'}</p>}</article>})}</div></section>

    {isCommissioner&&finalsFinal&&season.status!=='complete'&&<section className="panel"><p className="eyebrow">SEASON CLOSE</p><h2>Make it official.</h2><p className="lede">Persist the League Champion and Redemption Champion, award permanent achievements, and close the season.</p><form action={advancePostseason}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="phase" value="close"/><button className="primary">Close Season</button></form></section>}
  </main>;
}
