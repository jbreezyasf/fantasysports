import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';

export default async function StadiumPage({params}:{params:Promise<{franchiseId:string}>}) {
  const {franchiseId}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');
  const {data:franchise,error:franchiseError}=await supabase.from('franchises').select('id,name,abbreviation,league_id,primary_color,secondary_color,established_year').eq('id',franchiseId).maybeSingle();
  if(franchiseError) return <main><p className="errorNotice" role="alert">We could not load this franchise: {franchiseError.message}</p><a className="secondary" href="/dashboard">Return Home</a></main>;
  if(!franchise) notFound();
  const {data:stadium,error:stadiumError}=await supabase.from('stadiums').select('id,environment_key').eq('franchise_id',franchiseId).maybeSingle();
  if(stadiumError) return <main><nav style={{display:'flex',gap:8,flexWrap:'wrap',padding:'4px 0 18px'}}><a className="secondary" href="/dashboard">Home</a><a className="secondary" href={`/leagues/${franchise.league_id}`}>League HQ</a><a className="secondary" href={`/franchises/${franchiseId}/team`}>Team</a></nav><p className="errorNotice" role="alert">We could not load your stadium: {stadiumError.message}</p></main>;
  if(!stadium) return <main><nav style={{display:'flex',gap:8,flexWrap:'wrap',padding:'4px 0 18px'}}><a className="secondary" href="/dashboard">Home</a><a className="secondary" href={`/leagues/${franchise.league_id}`}>League HQ</a><a className="secondary" href={`/franchises/${franchiseId}/team`}>Team</a></nav><p className="errorNotice" role="alert">Your franchise exists, but its starter stadium has not been provisioned yet.</p></main>;

  const [{data:earned},{data:unlocked},{data:allFeatures}]=await Promise.all([
    supabase.from('franchise_achievements').select('id,earned_at,week,achievements(code,display_name,description)').eq('franchise_id',franchiseId).order('earned_at',{ascending:false}),
    supabase.from('franchise_stadium_features').select('unlocked_at,stadium_features(code,display_name,zone,asset_key,achievement_code)').eq('stadium_id',stadium.id).order('unlocked_at'),
    supabase.from('stadium_features').select('code,display_name,zone,achievement_code').eq('active',true).order('zone').order('display_name')
  ]);
  const unlockedCodes=new Set((unlocked??[]).map(x=>{const f=Array.isArray(x.stadium_features)?x.stadium_features[0]:x.stadium_features;return f?.code;}));
  const next=(allFeatures??[]).find(f=>!unlockedCodes.has(f.code));
  const titleCount=(earned??[]).filter(x=>{const a=Array.isArray(x.achievements)?x.achievements[0]:x.achievements;return a?.code==='LEAGUE_CHAMPION';}).length;
  const rivalryCount=(earned??[]).filter(x=>{const a=Array.isArray(x.achievements)?x.achievements[0]:x.achievements;return a?.code==='RIVALRY_WIN';}).length;
  const primary=franchise.primary_color??'#d9b43b';
  const secondary=franchise.secondary_color??'#f5f1e8';
  const abbr=(franchise.abbreviation??franchise.name.slice(0,3)).toUpperCase();

  return <main>
    <nav aria-label="Franchise navigation" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'4px 0 18px'}}><a className="secondary" href="/dashboard">Home</a><a className="secondary" href={`/leagues/${franchise.league_id}`}>League HQ</a><a className="secondary" href={`/franchises/${franchiseId}/team`}>Team</a><a className="primary" href={`/franchises/${franchiseId}/stadium`}>My Stadium</a></nav>

    <section className="leagueHero" style={{'--stadium-primary':primary,'--stadium-secondary':secondary} as React.CSSProperties}>
      <div className="leagueHeroGlow"/>
      <div className="leagueTopline"><a className="backLink" href={`/franchises/${franchiseId}/team`}>← TEAM HQ</a><span className="leagueRole">MY STADIUM</span></div>
      <div className="leagueHeroContent"><p className="eyebrow">BIG EXEC • FRANCHISE LEGACY</p><h1>{franchise.name}</h1><p className="leagueTagline">{titleCount} Title{titleCount===1?'':'s'} • {rivalryCount} Rivalry Win{rivalryCount===1?'':'s'} • Est. {franchise.established_year}</p><div className="leagueMetaRow"><span>{stadium.environment_key.replaceAll('_',' ').toUpperCase()}</span><span>{unlocked?.length??0} FEATURES UNLOCKED</span><span>NO XP • ACCOMPLISHMENTS ONLY</span></div></div>
    </section>

    <section className="panel"><p className="eyebrow">STADIUM VIEW</p><h2>{abbr} Neon Dome</h2><p className="lede">This is the live beta stadium environment. It will become more detailed as your franchise earns permanent features; the expensive cinematic/3D renderer is intentionally separate.</p>
      <div style={{minHeight:'clamp(420px,62vw,660px)',border:`1px solid ${primary}66`,background:'linear-gradient(180deg,#090b13 0%,#111728 43%,#07100a 44%,#06140b 100%)',position:'relative',overflow:'hidden',boxShadow:`0 0 70px ${primary}16 inset`}}>
        <div aria-hidden="true" style={{position:'absolute',left:'6%',right:'6%',top:'10%',height:'44%',borderRadius:'50% 50% 4% 4% / 38% 38% 4% 4%',border:`3px solid ${primary}66`,background:`repeating-linear-gradient(90deg,${primary}12 0 1.8%,transparent 1.8% 5%),linear-gradient(180deg,#191c28,#090b12)`,boxShadow:`0 0 60px ${primary}22 inset`}}/>
        <div aria-hidden="true" style={{position:'absolute',left:'14%',right:'14%',bottom:'9%',height:'39%',border:'3px solid rgba(255,255,255,.68)',background:'repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 1px,transparent 1px 10%),repeating-linear-gradient(0deg,#123d20 0 9%,#174a27 9% 18%)',boxShadow:'0 18px 34px rgba(0,0,0,.55)'}}>
          <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:2,background:'rgba(255,255,255,.75)'}}/><div style={{position:'absolute',top:'47%',left:0,right:0,height:2,background:'rgba(255,255,255,.35)'}}/>
        </div>
        <div style={{position:'absolute',left:'50%',top:'19%',transform:'translateX(-50%)',width:'min(520px,72%)',padding:'18px 16px',background:'#050506',border:`2px solid ${primary}`,textAlign:'center',boxShadow:`0 0 36px ${primary}44`}}><span style={{display:'block',fontSize:'.65rem',fontWeight:900,letterSpacing:'.18em',color:primary}}>HOME OF</span><strong style={{display:'block',fontSize:'clamp(2.3rem,9vw,6.2rem)',lineHeight:.88,color:secondary,textShadow:`0 0 28px ${primary}`}}>{abbr}</strong><span style={{display:'block',marginTop:8,fontSize:'clamp(.75rem,2vw,1rem)',fontWeight:900,letterSpacing:'.16em'}}>{franchise.name.toUpperCase()}</span></div>
        <div aria-hidden="true" style={{position:'absolute',left:'4%',top:'6%',width:14,height:'40%',background:primary,boxShadow:`0 0 28px ${primary}`}}/><div aria-hidden="true" style={{position:'absolute',right:'4%',top:'6%',width:14,height:'40%',background:primary,boxShadow:`0 0 28px ${primary}`}}/>
        <div style={{position:'absolute',left:18,right:18,bottom:14,display:'flex',gap:8,flexWrap:'wrap'}}>{(unlocked??[]).slice(0,5).map((x,i)=>{const f=Array.isArray(x.stadium_features)?x.stadium_features[0]:x.stadium_features;return <span key={`${f?.code}-${i}`} style={{padding:'8px 10px',background:'rgba(0,0,0,.76)',border:`1px solid ${primary}88`,color:secondary,fontSize:'.62rem',fontWeight:900,letterSpacing:'.08em'}}>{f?.display_name?.toUpperCase()}</span>})}</div>
      </div>
    </section>

    <section className="panel"><p className="eyebrow">EARNED FEATURES</p><h2>Your history is visible.</h2><div className="franchiseGrid">{(unlocked??[]).map((x,i)=>{const f=Array.isArray(x.stadium_features)?x.stadium_features[0]:x.stadium_features;return <article className="franchiseCard" key={`${f?.code}-${i}`}><div className="franchiseCardTop"><span>{f?.zone?.toUpperCase()}</span><b>UNLOCKED</b></div><div className="franchiseMonogram">◆</div><strong>{f?.display_name??'Stadium Feature'}</strong><p>Earned from a real franchise accomplishment.</p></article>})}{!(unlocked??[]).length&&<p className="lede">Your starter stadium is active. Win games and league events to change it permanently.</p>}</div></section>
    {next&&<section className="panel"><p className="eyebrow">NEXT MEANINGFUL UNLOCK</p><h2>{next.display_name}</h2><p className="lede">Earn the <strong>{next.achievement_code?.replaceAll('_',' ')}</strong> accomplishment to add this feature to the {next.zone}.</p></section>}
  </main>;
}
