import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import Image from 'next/image';
import { FranchiseCrest } from '../../../components/FranchiseCrest';

export default async function StadiumPage({params}:{params:Promise<{franchiseId:string}>}) {
  const {franchiseId}=await params; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
  const {data:franchise,error:franchiseError}=await supabase.from('franchises').select('id,name,abbreviation,league_id,primary_color,secondary_color,established_year').eq('id',franchiseId).maybeSingle();
  if(franchiseError) return <main><p className="errorNotice" role="alert">We could not load this franchise: {franchiseError.message}</p><a className="secondary" href="/dashboard">Return Home</a></main>;
  if(!franchise) notFound();
  const {data:stadium,error:stadiumError}=await supabase.from('stadiums').select('id,environment_key').eq('franchise_id',franchiseId).maybeSingle();
  if(stadiumError) return <main><p className="errorNotice" role="alert">We could not load your stadium: {stadiumError.message}</p><a className="secondary" href={`/franchises/${franchiseId}/team`}>Return to Team</a></main>;
  if(!stadium) return <main><p className="errorNotice" role="alert">Your franchise exists, but its starter stadium has not been provisioned yet.</p><a className="secondary" href={`/franchises/${franchiseId}/team`}>Return to Team</a></main>;

  const [{data:earned},{data:unlocked},{data:allFeatures}]=await Promise.all([
    supabase.from('franchise_achievements').select('id,earned_at,week,achievements(code,display_name,description)').eq('franchise_id',franchiseId).order('earned_at',{ascending:false}),
    supabase.from('franchise_stadium_features').select('unlocked_at,stadium_features(code,display_name,zone,asset_key,achievement_code)').eq('stadium_id',stadium.id).order('unlocked_at'),
    supabase.from('stadium_features').select('code,display_name,zone,achievement_code').eq('active',true).order('zone').order('display_name')
  ]);
  const unlockedCodes=new Set((unlocked??[]).map(x=>{const f=Array.isArray(x.stadium_features)?x.stadium_features[0]:x.stadium_features;return f?.code;}));
  const next=(allFeatures??[]).find(f=>!unlockedCodes.has(f.code));
  const titleCount=(earned??[]).filter(x=>{const a=Array.isArray(x.achievements)?x.achievements[0]:x.achievements;return a?.code==='LEAGUE_CHAMPION';}).length;
  const rivalryCount=(earned??[]).filter(x=>{const a=Array.isArray(x.achievements)?x.achievements[0]:x.achievements;return a?.code==='RIVALRY_WIN';}).length;
  const primary=franchise.primary_color??'#d9b43b'; const secondary=franchise.secondary_color??'#f5f1e8'; const abbr=(franchise.abbreviation??franchise.name.slice(0,3)).toUpperCase();
  const unlockedFeatures=(unlocked??[]).map(x=>Array.isArray(x.stadium_features)?x.stadium_features[0]:x.stadium_features).filter(Boolean);
  const lockedFeatures=(allFeatures??[]).filter(f=>!unlockedCodes.has(f.code));

  return <main className="stadiumPage">
    <nav className="franchiseNav" aria-label="Franchise navigation"><a href="/dashboard">Home</a><a href={`/leagues/${franchise.league_id}`}>League HQ</a><a href={`/franchises/${franchiseId}/team`}>Team</a><a aria-current="page" href={`/franchises/${franchiseId}/stadium`}>My Stadium</a></nav>
    <section className="leagueHero" style={{'--stadium-primary':primary,'--stadium-secondary':secondary} as React.CSSProperties}><div className="leagueHeroGlow"/><div className="leagueTopline"><a className="backLink" href={`/franchises/${franchiseId}/team`}>← TEAM HQ</a><span className="leagueRole">MY STADIUM</span></div><div className="leagueHeroContent"><p className="eyebrow">BIG EXEC • FRANCHISE LEGACY</p><h1>{franchise.name}</h1><p className="leagueTagline">{titleCount} Title{titleCount===1?'':'s'} • {rivalryCount} Rivalry Win{rivalryCount===1?'':'s'} • Est. {franchise.established_year}</p><div className="leagueMetaRow"><span>{stadium.environment_key.replaceAll('_',' ').toUpperCase()}</span><span>{unlockedFeatures.length} FEATURES UNLOCKED</span><span>ACCOMPLISHMENTS BUILD THE HOUSE</span></div></div></section>

    <section className="panel stadiumViewPanel"><p className="eyebrow">STADIUM VIEW</p><h2>{abbr} Neon Dome</h2><p className="lede">Your franchise history lives here. Wins, rivalries and championships permanently change the environment.</p>
      <div className="stadiumScene stadiumSceneImage" style={{'--team-primary':primary,'--team-secondary':secondary} as React.CSSProperties}>
        <Image className="starterStadiumImage" src="/environments/big-exec-starter-stadium-v1.jpg" alt={`${franchise.name} starter stadium illuminated at night`} fill priority sizes="(max-width: 720px) 100vw, 1180px"/>
        <div className="stadiumColorWash" aria-hidden="true"/>
        <div className="stadiumScoreboard"><span>HOME OF</span><FranchiseCrest className="stadiumScoreboardCrest" name={franchise.name} abbreviation={abbr} primary={primary} secondary={secondary}/><strong>{abbr}</strong><small>{franchise.name.toUpperCase()}</small></div>
        <div className="stadiumField" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
        <div className="stadiumBannerRail" aria-label="Unlocked stadium features">{unlockedFeatures.slice(0,6).map((f,i)=><span key={`${f?.code}-${i}`}>{f?.display_name?.toUpperCase()}</span>)}{!unlockedFeatures.length&&<span>STARTER STADIUM</span>}</div>
        {titleCount>0&&<div className="stadiumBanner championshipBanner">CHAMPION × {titleCount}</div>}
        {rivalryCount>0&&<div className="stadiumBanner rivalryBanner">RIVALRY × {rivalryCount}</div>}
      </div>
    </section>

    <section className="panel stadiumMapPanel"><div className="sectionTitleRow"><div><p className="eyebrow">STADIUM MAP</p><h2>What your history changes.</h2></div><span className="sectionCounter">{unlockedFeatures.length}/{allFeatures?.length??0}</span></div><div className="franchiseGrid">
      {unlockedFeatures.map((f,i)=><article className="franchiseCard myFranchise" key={`${f?.code}-${i}`} style={{'--team-primary':primary} as React.CSSProperties}><div className="franchiseCardTop"><span>{f?.zone?.toUpperCase()}</span><b>UNLOCKED</b></div><div className="franchiseMonogram">◆</div><strong>{f?.display_name??'Stadium Feature'}</strong><p>Visible because your franchise earned it.</p><em>PERMANENT LEGACY</em></article>)}
      {lockedFeatures.slice(0,Math.max(3,6-unlockedFeatures.length)).map(f=><article className="franchiseCard openFranchise" key={f.code}><div className="franchiseCardTop"><span>{f.zone?.toUpperCase()}</span><b>LOCKED</b></div><div className="franchiseMonogram">◇</div><strong>{f.display_name}</strong><p>Earn {f.achievement_code?.replaceAll('_',' ')} to build this part of the stadium.</p></article>)}
    </div></section>
    {next&&<section className="leagueCommandPanel"><div className="commandHeader"><div><p className="eyebrow">NEXT MEANINGFUL UNLOCK</p><h2>{next.display_name}</h2></div><span className="commandBadge">{next.zone?.toUpperCase()}</span></div><p className="lede">Earn <strong>{next.achievement_code?.replaceAll('_',' ')}</strong> and this upgrade becomes part of {franchise.name} permanently.</p></section>}
  </main>;
}
