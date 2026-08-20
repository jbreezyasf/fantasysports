import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { finalizeMatchup, generatePostgameTalk, postGeneratedTalk, refreshMatchup } from '../actions';

type FranchiseCard = { name?: string; abbreviation?: string; primary_color?: string };
type TeamRef = { abbreviation?: string };
type AthleteRef = { display_name?: string; position?: string; real_teams?: TeamRef | TeamRef[] | null };

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function MatchupPage({ params, searchParams }: { params: Promise<{ matchupId: string }>; searchParams: Promise<{ error?: string; finalized?: string; talk?: string }> }) {
  const { matchupId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: matchup } = await supabase.from('matchups').select('id,league_season_id,week,event_type,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final,winner_season_franchise_id').eq('id', matchupId).maybeSingle();
  if (!matchup) notFound();
  const { data: sf } = await supabase.from('season_franchises').select('id,franchise_id,franchises(name,abbreviation,primary_color)').in('id', [matchup.home_season_franchise_id, matchup.away_season_franchise_id]);
  const home = sf?.find(x => x.id === matchup.home_season_franchise_id);
  const away = sf?.find(x => x.id === matchup.away_season_franchise_id);
  const homeFranchise = firstRelation(home?.franchises as FranchiseCard | FranchiseCard[] | null | undefined);
  const awayFranchise = firstRelation(away?.franchises as FranchiseCard | FranchiseCard[] | null | undefined);
  const { data: member } = await supabase.from('league_seasons').select('league_id').eq('id', matchup.league_season_id).maybeSingle();
  const { data: leagueRole } = member ? await supabase.from('league_members').select('role').eq('league_id', member.league_id).eq('user_id', user.id).maybeSingle() : { data:null };
  const { data: ownerships } = await supabase.from('franchise_owners').select('franchise_id').eq('user_id',user.id).is('ends_on',null);
  const ownedIds=new Set((ownerships??[]).map(o=>o.franchise_id));
  const isParticipant=(sf??[]).some(x=>ownedIds.has(x.franchise_id));

  const [{ data: lineups },{ data: playerScores },{ data: teamScores },{ data: generated }] = await Promise.all([
    supabase.from('lineups').select('season_franchise_id,slot,slot_index,athlete_id,real_team_id,athletes(display_name,position,real_teams(abbreviation)),real_teams(abbreviation)').eq('week', matchup.week).in('season_franchise_id',[matchup.home_season_franchise_id,matchup.away_season_franchise_id]),
    supabase.from('fantasy_player_scores').select('athlete_id,points').eq('league_season_id',matchup.league_season_id).eq('week',matchup.week),
    supabase.from('fantasy_team_scores').select('real_team_id,points').eq('league_season_id',matchup.league_season_id).eq('week',matchup.week),
    query.talk ? supabase.from('generated_messages').select('id,tone,body,provider,created_at').eq('matchup_id',matchupId).eq('requested_by',user.id).eq('tone',query.talk).order('created_at',{ascending:false}).limit(3) : Promise.resolve({data:[]})
  ]);
  const playerMap = new Map((playerScores ?? []).map(x => [x.athlete_id, Number(x.points)]));
  const teamMap = new Map((teamScores ?? []).map(x => [x.real_team_id, Number(x.points)]));

  const slotOrder = ['QB:1','RB:1','RB:2','WR:1','WR:2','TE:1','FLEX:1','K:1','DST:1'];
  function assetRow(seasonFranchiseId:string, key:string) {
    const [slot,index] = key.split(':');
    const item = lineups?.find(l => l.season_franchise_id===seasonFranchiseId && l.slot===slot && l.slot_index===Number(index));
    if (!item) return { name:'EMPTY', meta:slot==='DST'?'D/ST':slot, points:0 };
    if (item.athlete_id) {
      const athlete = firstRelation(item.athletes as AthleteRef | AthleteRef[] | null | undefined);
      const team = firstRelation(athlete?.real_teams);
      return { name:athlete?.display_name ?? 'Athlete', meta:`${slot==='FLEX'?athlete?.position:slot} • ${team?.abbreviation ?? 'FA'}`, points:playerMap.get(item.athlete_id) ?? 0 };
    }
    const team = firstRelation(item.real_teams as TeamRef | TeamRef[] | null | undefined);
    return { name:`${team?.abbreviation ?? 'Team'} D/ST`, meta:'D/ST', points:teamMap.get(item.real_team_id!) ?? 0 };
  }

  return <main>
    <section className="panel matchupHero">
      <p className="eyebrow">WEEK {matchup.week} • {matchup.is_final ? 'FINAL' : matchup.event_type.toUpperCase()}</p>
      <div className="scoreboard">
        <div><span>{homeFranchise?.abbreviation ?? 'HOME'}</span><strong>{Number(matchup.home_points).toFixed(2)}</strong><p>{homeFranchise?.name}</p></div>
        <b>VS</b>
        <div><span>{awayFranchise?.abbreviation ?? 'AWAY'}</span><strong>{Number(matchup.away_points).toFixed(2)}</strong><p>{awayFranchise?.name}</p></div>
      </div>
      {query.error && <p className="errorNotice" role="alert">{query.error}</p>}
      {query.finalized && <p className="successNotice">Matchup finalized and standings updated.</p>}
      <div className="actions"><form action={refreshMatchup}><input type="hidden" name="matchup_id" value={matchupId}/><button className="secondary">Refresh Scores</button></form>{leagueRole?.role==='commissioner' && !matchup.is_final && <form action={finalizeMatchup}><input type="hidden" name="matchup_id" value={matchupId}/><button className="primary">Finalize When Games End</button></form>}{member?.league_id&&<a className="secondary" href={`/leagues/${member.league_id}/locker-room`}>Locker Room</a>}</div>
    </section>

    {matchup.is_final&&isParticipant&&<section className="panel">
      <p className="eyebrow">POSTGAME MIC</p><h2>Choose your energy.</h2><p className="lede">Big Exec uses only public matchup facts here. Pick a tone, choose one of three editable lines, then send it to the Locker Room.</p>
      <div className="actions">{(['respect','playful','petty','savage'] as const).map(tone=><form action={generatePostgameTalk} key={tone}><input type="hidden" name="matchup_id" value={matchupId}/><input type="hidden" name="tone" value={tone}/><button className={query.talk===tone?'primary':'secondary'}>{tone}</button></form>)}</div>
      {!!generated?.length&&<div className="weekStack" style={{marginTop:24}}>{generated.map(option=><article className="weekCard" key={option.id}><div className="weekHeader"><div><span>{option.tone.toUpperCase()}</span><strong>{option.provider.startsWith('openai')?'AI OPTION':'BIG EXEC OPTION'}</strong></div></div><form className="authForm" action={postGeneratedTalk}><input type="hidden" name="matchup_id" value={matchupId}/><input type="hidden" name="message_id" value={option.id}/><label>Edit before posting<textarea name="body" defaultValue={option.body} maxLength={1200} rows={3}/></label><button className="primary">Post to Locker Room</button></form></article>)}</div>}
    </section>}

    <section className="panel">
      <p className="eyebrow">HEAD-TO-HEAD LINEUP</p>
      <div className="battleList">{slotOrder.map(key => { const h=assetRow(matchup.home_season_franchise_id,key); const a=assetRow(matchup.away_season_franchise_id,key); return <div className="battleRow" key={key}><div><span>{h.meta}</span><strong>{h.name}</strong><b>{h.points.toFixed(2)}</b></div><em>{key.split(':')[0]==='DST'?'D/ST':key.split(':')[0]}</em><div><span>{a.meta}</span><strong>{a.name}</strong><b>{a.points.toFixed(2)}</b></div></div>})}</div>
    </section>
  </main>;
}
