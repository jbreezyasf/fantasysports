import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';

export default async function RecapPage({params}:{params:Promise<{recapId:string}>}) {
  const {recapId}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');
  const {data:script}=await supabase.from('recap_scripts').select('id,title,summary,matchup_id,league_season_id,winner_season_franchise_id,loser_season_franchise_id').eq('id',recapId).maybeSingle();
  if(!script) notFound();
  const {data:scenes}=await supabase.from('recap_scenes').select('scene_index,scene_kind,duration_ms,payload').eq('recap_script_id',recapId).order('scene_index');
  const {data:renders}=await supabase.from('recap_renders').select('aspect_ratio,status,storage_key').eq('recap_script_id',recapId).order('aspect_ratio');
  return <main>
    <section className="panel"><p className="eyebrow">BIG EXEC • ARCADE RECAP</p><h1>{script.title}</h1><p className="lede">{script.summary}</p><div className="actions"><a className="secondary" href={`/matchups/${script.matchup_id}`}>← Matchup</a></div></section>
    <section className="panel"><p className="eyebrow">DETERMINISTIC STORYBOARD</p><h2>What the game becomes.</h2><div style={{display:'grid',gap:12}}>{(scenes??[]).map(scene=>{const p=scene.payload as Record<string,unknown>;return <article key={scene.scene_index} style={{minHeight:220,border:'1px solid #3a3327',background:'radial-gradient(circle at 80% 20%,rgba(217,180,59,.18),transparent 28%),linear-gradient(145deg,#17130d,#0a0a0b 70%)',padding:24,display:'grid',alignContent:'space-between',overflow:'hidden'}}><div><span className="eyebrow">SCENE {scene.scene_index} • {scene.scene_kind.replaceAll('_',' ').toUpperCase()} • {(scene.duration_ms/1000).toFixed(1)}s</span></div><div>{scene.scene_kind==='stadium_open'&&<><h2 style={{marginBottom:8}}>{String(p.home)} VS {String(p.away)}</h2><p className="lede">Futuristic stadium opening • Week {String(p.week)} • {String(p.event_type).toUpperCase()}</p></>}{scene.scene_kind==='score_reveal'&&<><h2 style={{marginBottom:8}}>{String(p.home_points)} — {String(p.away_points)}</h2><p className="lede">The real fantasy result controls the scoreboard.</p></>}{scene.scene_kind==='arcade_star'&&<><h2 style={{marginBottom:8}}>{String(p.name)}</h2><p className="lede">{String(p.points)} fantasy points • {String(p.effect).replaceAll('_',' ')}</p></>}{scene.scene_kind==='winner_moment'&&<><h2 style={{marginBottom:8}}>{String(p.winner)}</h2><p className="lede">Winner sequence • margin {String(p.margin)} • {String(p.effect).replaceAll('_',' ')}</p></>}{scene.scene_kind==='final_card'&&<><h2 style={{marginBottom:8}}>{String(p.title)}</h2><p className="lede">Final card locks the actual matchup result.</p></>}</div></article>})}</div></section>
    <section className="panel"><p className="eyebrow">VIDEO OUTPUTS</p><h2>Render queue.</h2><div className="leagueQuickGrid">{(renders??[]).map(render=><article className="leagueStatCard" key={render.aspect_ratio}><span>{render.aspect_ratio}</span><strong>{render.status.toUpperCase()}</strong><p>{render.status==='ready'?'Stored media ready to watch/share.':'Storyboard is ready; MP4 renderer has not run yet.'}</p></article>)}</div></section>
  </main>;
}
