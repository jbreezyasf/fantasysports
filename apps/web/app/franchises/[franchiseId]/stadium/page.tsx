import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';

export default async function StadiumPage({params}:{params:Promise<{franchiseId:string}>}) {
  const {franchiseId}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');
  const {data:franchise}=await supabase.from('franchises').select('id,name,abbreviation,league_id,primary_color,secondary_color,established_year').eq('id',franchiseId).maybeSingle();
  if(!franchise) notFound();
  const {data:stadium}=await supabase.from('stadiums').select('id,environment_key').eq('franchise_id',franchiseId).maybeSingle();
  if(!stadium) notFound();
  const {data:earned}=await supabase.from('franchise_achievements').select('id,earned_at,week,achievements(code,display_name,description)').eq('franchise_id',franchiseId).order('earned_at',{ascending:false});
  const {data:unlocked}=await supabase.from('franchise_stadium_features').select('unlocked_at,stadium_features(code,display_name,zone,asset_key,achievement_code)').eq('stadium_id',stadium.id).order('unlocked_at');
  const {data:allFeatures}=await supabase.from('stadium_features').select('code,display_name,zone,achievement_code').eq('active',true).order('zone').order('display_name');
  const unlockedCodes=new Set((unlocked??[]).map(x=>{const f=Array.isArray(x.stadium_features)?x.stadium_features[0]:x.stadium_features;return f?.code;}));
  const next=(allFeatures??[]).find(f=>!unlockedCodes.has(f.code));
  const titleCount=(earned??[]).filter(x=>{const a=Array.isArray(x.achievements)?x.achievements[0]:x.achievements;return a?.code==='LEAGUE_CHAMPION';}).length;
  const rivalryCount=(earned??[]).filter(x=>{const a=Array.isArray(x.achievements)?x.achievements[0]:x.achievements;return a?.code==='RIVALRY_WIN';}).length;
  const primary=franchise.primary_color??'#d9b43b';
  const secondary=franchise.secondary_color??'#f5f1e8';
  return <main>
    <section className="leagueHero" style={{'--stadium-primary':primary,'--stadium-secondary':secondary} as React.CSSProperties}>
      <div className="leagueHeroGlow"/>
      <div className="leagueTopline"><a className="backLink" href={`/franchises/${franchiseId}/team`}>← TEAM HQ</a><span className="leagueRole">MY STADIUM</span></div>
      <div className="leagueHeroContent"><p className="eyebrow">BIG EXEC • FRANCHISE LEGACY</p><h1>{franchise.name}</h1><p className="leagueTagline">{titleCount} Title{titleCount===1?'':'s'} • {rivalryCount} Rivalry Win{rivalryCount===1?'':'s'} • Est. {franchise.established_year}</p><div className="leagueMetaRow"><span>{stadium.environment_key.replaceAll('_',' ').toUpperCase()}</span><span>{unlocked?.length??0} FEATURES UNLOCKED</span><span>NO XP • ACCOMPLISHMENTS ONLY</span></div></div>
    </section>
    <section className="panel"><p className="eyebrow">STADIUM VIEW</p><h2>{franchise.abbreviation??'BEX'} Neon Dome</h2><div style={{minHeight:300,border:'1px solid #4a3d24',background:`radial-gradient(circle at 50% 20%, ${primary}55, transparent 30%),linear-gradient(180deg,#15100a,#09090a 60%,#111)`,display:'grid',placeItems:'center',position:'relative',overflow:'hidden'}}><div style={{textAlign:'center'}}><div style={{fontSize:'clamp(5rem,24vw,12rem)',fontWeight:900,letterSpacing:'-.08em',color:primary,textShadow:`0 0 40px ${primary}`}}>{franchise.abbreviation??franchise.name.slice(0,3).toUpperCase()}</div><strong style={{fontSize:'1.2rem',letterSpacing:'.18em',color:secondary}}>HOME OF {franchise.name.toUpperCase()}</strong></div></div></section>
    <section className="panel"><p className="eyebrow">EARNED FEATURES</p><h2>Your history is visible.</h2><div className="franchiseGrid">{(unlocked??[]).map((x,i)=>{const f=Array.isArray(x.stadium_features)?x.stadium_features[0]:x.stadium_features;return <article className="franchiseCard" key={`${f?.code}-${i}`}><div className="franchiseCardTop"><span>{f?.zone?.toUpperCase()}</span><b>UNLOCKED</b></div><div className="franchiseMonogram">◆</div><strong>{f?.display_name??'Stadium Feature'}</strong><p>Earned from a real franchise accomplishment.</p></article>})}{!(unlocked??[]).length&&<p className="lede">Your starter stadium is active. Win games and league events to change it permanently.</p>}</div></section>
    {next&&<section className="panel"><p className="eyebrow">NEXT MEANINGFUL UNLOCK</p><h2>{next.display_name}</h2><p className="lede">Earn the <strong>{next.achievement_code?.replaceAll('_',' ')}</strong> accomplishment to add this feature to the {next.zone}.</p></section>}
  </main>;
}
