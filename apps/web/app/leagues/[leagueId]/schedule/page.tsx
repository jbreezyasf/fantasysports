import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { generateSpecialWeek } from '../../actions';

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
  const { data:season } = await supabase.from('league_seasons').select('id').eq('league_id',leagueId).maybeSingle();
  if (!season) notFound();
  const { data:seasonFranchises } = await supabase.from('season_franchises').select('id,franchises(name,abbreviation)').eq('league_season_id',season.id);
  const franchiseMap = new Map((seasonFranchises ?? []).map(sf=>[sf.id,first(sf.franchises as Franchise|Franchise[]|null)]));
  const { data:matchups } = await supabase.from('matchups').select('id,week,event_type,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final').eq('league_season_id',season.id).order('week').order('id');
  const { data:standings } = await supabase.from('standings').select('season_franchise_id,wins,losses,ties,points_for,points_against,streak').eq('league_season_id',season.id).order('wins',{ascending:false}).order('points_for',{ascending:false});
  const weeks = Array.from({length:14},(_,i)=>i+1);
  const eventName = (week:number) => week<=9 ? 'THE CIRCUIT' : ({10:'RIVALRY WEEK',11:'REVENGE WEEK',12:'POSITION WEEK',13:'CHAOS WEEK',14:'JUDGMENT WEEK'} as Record<number,string>)[week];

  return <main>
    <section className="panel"><p className="eyebrow">LEAGUE / SEASON</p><h1>{league.name}</h1><p className="lede">Weeks 1–9 establish the field. Weeks 10–14 turn the standings and history into events.</p>{query.error&&<p className="errorNotice">{query.error}</p>}{query.generated&&<p className="successNotice">{query.generated.toUpperCase()} Week generated.</p>}</section>
    <section className="panel"><p className="eyebrow">STANDINGS</p><div className="standingsList">{(standings??[]).map((s,index)=>{const f=franchiseMap.get(s.season_franchise_id);return <div className="standingRow" key={s.season_franchise_id}><b>{index+1}</b><strong>{f?.name??'Franchise'}</strong><span>{s.wins}-{s.losses}{s.ties?`-${s.ties}`:''}</span><small>{Number(s.points_for).toFixed(1)} PF</small></div>})}</div></section>
    <section className="panel"><p className="eyebrow">SCHEDULE</p><div className="weekStack">{weeks.map(week=>{const games=(matchups??[]).filter(m=>m.week===week);return <article className="weekCard" key={week}><div className="weekHeader"><div><span>WEEK {week}</span><strong>{eventName(week)}</strong></div>{member.role==='commissioner'&&games.length===0&&[10,11,12].includes(week)&&<form action={generateSpecialWeek}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="event_type" value={week===10?'rivalry':week===11?'revenge':'position'}/><button className="miniAction">Generate</button></form>}</div>{games.length?games.map(game=>{const h=franchiseMap.get(game.home_season_franchise_id);const a=franchiseMap.get(game.away_season_franchise_id);return <a className="scheduleGame" key={game.id} href={`/matchups/${game.id}`}><div><strong>{h?.abbreviation??h?.name??'HOME'}</strong><span>{Number(game.home_points).toFixed(2)}</span></div><em>{game.is_final?'FINAL':'VS'}</em><div><strong>{a?.abbreviation??a?.name??'AWAY'}</strong><span>{Number(game.away_points).toFixed(2)}</span></div></a>}):<p className="lede">{week===13?'Chaos Week rules are intentionally not locked yet.':week===14?'Judgment Week will be generated from playoff stakes after prior results.':'Not generated yet.'}</p>}</article>})}</div></section>
  </main>;
}
