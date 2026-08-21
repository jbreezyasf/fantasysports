import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { setLineup } from '../../../team/actions';

const slots = [['QB',1,'QB'],['RB',1,'RB1'],['RB',2,'RB2'],['WR',1,'WR1'],['WR',2,'WR2'],['TE',1,'TE'],['FLEX',1,'FLEX'],['K',1,'K'],['DST',1,'D/ST']] as const;

export default async function TeamPage({ params, searchParams }: { params: Promise<{ franchiseId: string }>; searchParams: Promise<{ week?: string; error?: string }> }) {
  const { franchiseId } = await params;
  const query = await searchParams;
  const week = Math.max(1, Math.min(18, Number(query.week ?? 1)));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: franchise } = await supabase.from('franchises').select('id,name,abbreviation,league_id,primary_color,secondary_color').eq('id', franchiseId).maybeSingle();
  if (!franchise) notFound();
  const { data: seasonFranchise } = await supabase.from('season_franchises').select('id,league_season_id').eq('franchise_id', franchiseId).maybeSingle();
  if (!seasonFranchise) notFound();
  const { data: ownership } = await supabase.from('franchise_owners').select('user_id').eq('franchise_id', franchiseId).eq('user_id', user.id).is('ends_on', null).maybeSingle();
  if (!ownership) redirect(`/leagues/${franchise.league_id}`);
  const [{ data: roster }, { data: lineup }, { data: stadium }] = await Promise.all([
    supabase.from('roster_entries').select('id,athlete_id,real_team_id,athletes(display_name,position,real_teams(abbreviation)),real_teams(display_name,abbreviation)').eq('season_franchise_id', seasonFranchise.id).is('dropped_at', null).order('added_at'),
    supabase.from('lineups').select('slot,slot_index,athlete_id,real_team_id').eq('season_franchise_id', seasonFranchise.id).eq('week', week),
    supabase.from('stadiums').select('id,environment_key').eq('franchise_id', franchiseId).maybeSingle()
  ]);
  const lineupMap = new Map((lineup ?? []).map(item => [`${item.slot}:${item.slot_index}`, item]));
  const starterAssetIds = new Set((lineup ?? []).flatMap(item => [item.athlete_id, item.real_team_id]).filter(Boolean));
  const primary = franchise.primary_color ?? '#d9b43b';
  const secondary = franchise.secondary_color ?? '#f5f1e8';

  function labelForAsset(asset: NonNullable<typeof roster>[number]) {
    if (asset.athlete_id && asset.athletes) {
      const athlete = Array.isArray(asset.athletes) ? asset.athletes[0] : asset.athletes as {display_name?: string;position?: string;real_teams?: {abbreviation?:string}|{abbreviation?:string}[]|null};
      const team = Array.isArray(athlete?.real_teams) ? athlete?.real_teams[0] : athlete?.real_teams;
      return `${athlete?.display_name ?? 'Athlete'} • ${athlete?.position ?? ''} • ${team?.abbreviation ?? 'FA'}`;
    }
    const team = Array.isArray(asset.real_teams) ? asset.real_teams[0] : asset.real_teams as {display_name?:string;abbreviation?:string}|null;
    return `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`;
  }

  return <main>
    <nav aria-label="Franchise navigation" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'4px 0 18px'}}>
      <a className="secondary" href="/dashboard">Home</a><a className="secondary" href={`/leagues/${franchise.league_id}`}>League HQ</a><a className="primary" href={`/franchises/${franchiseId}/team?week=${week}`}>Team</a><a className="secondary" href={`/franchises/${franchiseId}/stadium`}>My Stadium</a>
    </nav>
    <section className="leagueHero" style={{'--stadium-primary':primary,'--stadium-secondary':secondary} as React.CSSProperties}>
      <div className="leagueHeroGlow" />
      <div aria-hidden="true" style={{position:'absolute',inset:'42% 5% -12%',border:`1px solid ${primary}66`,borderRadius:'50% 50% 0 0 / 18% 18% 0 0',background:`linear-gradient(180deg,transparent,${primary}12),repeating-linear-gradient(90deg,transparent 0 8%,${primary}12 8% 8.4%)`,opacity:.75}} />
      <div aria-hidden="true" style={{position:'absolute',left:'14%',right:'14%',bottom:24,height:90,border:`2px solid ${primary}88`,background:'linear-gradient(180deg,#18351f,#102617)',boxShadow:`0 0 44px ${primary}22 inset`}} />
      <div className="leagueTopline"><span className="backLink">WEEK {week} • TEAM HQ</span><span className="leagueRole">{stadium?.environment_key?.replaceAll('_',' ').toUpperCase() ?? 'HOME STADIUM'}</span></div>
      <div className="leagueHeroContent" style={{position:'relative',zIndex:2}}><p className="eyebrow">BIG EXEC • FRONT OFFICE</p><h1>{franchise.name}</h1><p className="leagueTagline">Set the starting nine inside your franchise home.</p><div className="leagueMetaRow"><span>{franchise.abbreviation ?? 'BEX'}</span><span>WEEK {week}</span><span>9 STARTERS</span><span>TEAM D/ST</span></div></div>
    </section>
    <section className="panel"><p className="eyebrow">LINEUP CONTROL</p><h2>Set your starters.</h2><p className="lede">Click a player option under a slot to promote them directly into the starting lineup. Each real player locks when their game begins once the current-season live schedule is connected.</p>{query.error && <p className="errorNotice" role="alert">{query.error}</p>}<div className="actions">{week > 1 && <a className="secondary" href={`/franchises/${franchiseId}/team?week=${week-1}`}>← Week {week-1}</a>}{week < 18 && <a className="secondary" href={`/franchises/${franchiseId}/team?week=${week+1}`}>Week {week+1} →</a>}<a className="secondary" href={`/franchises/${franchiseId}/stadium`}>View My Stadium</a></div></section>
    <section className="panel"><p className="eyebrow">STARTERS</p><div className="lineupGrid">{slots.map(([slot,slotIndex,label]) => { const current = lineupMap.get(`${slot}:${slotIndex}`); const currentRoster = roster?.find(r => (current?.athlete_id && r.athlete_id===current.athlete_id) || (current?.real_team_id && r.real_team_id===current.real_team_id)); const eligible = (roster ?? []).filter(r => { if (r.real_team_id) return slot==='DST'; const athlete = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes as {position?:string}|null; const pos = athlete?.position; if (slot==='FLEX') return ['RB','WR','TE'].includes(pos ?? ''); return pos===slot; }); return <article className="lineupSlot" key={`${slot}-${slotIndex}`}><span>{label}</span><strong>{currentRoster ? labelForAsset(currentRoster) : 'EMPTY'}</strong>{!!eligible.length && <div className="slotChoices">{eligible.slice(0,12).map(asset => <form action={setLineup} key={asset.id}><input type="hidden" name="season_franchise_id" value={seasonFranchise.id}/><input type="hidden" name="franchise_id" value={franchiseId}/><input type="hidden" name="week" value={week}/><input type="hidden" name="slot" value={slot}/><input type="hidden" name="slot_index" value={slotIndex}/>{asset.athlete_id && <input type="hidden" name="athlete_id" value={asset.athlete_id}/>} {asset.real_team_id && <input type="hidden" name="real_team_id" value={asset.real_team_id}/>}<button className="miniAction" type="submit">{labelForAsset(asset)}</button></form>)}</div>}</article>; })}</div></section>
    <section className="panel"><p className="eyebrow">BENCH / ROSTER</p><div className="playerList">{(roster ?? []).filter(asset => !starterAssetIds.has(asset.athlete_id ?? asset.real_team_id)).map(asset => <div className="playerRow" key={asset.id}><div><span>AVAILABLE TO START</span><strong>{labelForAsset(asset)}</strong></div></div>)}{!roster?.length && <p className="errorNotice">No roster yet. Players appear here as soon as the draft is completed.</p>}</div></section>
  </main>;
}
