import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { finalizeMatchup, refreshMatchup } from '../actions';

export default async function MatchupPage({ params, searchParams }: { params: Promise<{ matchupId: string }>; searchParams: Promise<{ error?: string; finalized?: string }> }) {
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
  const homeFranchise = Array.isArray(home?.franchises) ? home?.franchises[0] : home?.franchises as {name?:string;abbreviation?:string;primary_color?:string}|null;
  const awayFranchise = Array.isArray(away?.franchises) ? away?.franchises[0] : away?.franchises as {name?:string;abbreviation?:string;primary_color?:string}|null;
  const { data: member } = await supabase.from('league_seasons').select('league_id').eq('id', matchup.league_season_id).maybeSingle();
  const { data: leagueRole } = member ? await supabase.from('league_members').select('role').eq('league_id', member.league_id).eq('user_id', user.id).maybeSingle() : { data:null };

  const { data: lineups } = await supabase.from('lineups').select('season_franchise_id,slot,slot_index,athlete_id,real_team_id,athletes(display_name,position,real_teams(abbreviation)),real_teams(abbreviation)').eq('week', matchup.week).in('season_franchise_id',[matchup.home_season_franchise_id,matchup.away_season_franchise_id]);
  const { data: playerScores } = await supabase.from('fantasy_player_scores').select('athlete_id,points').eq('league_season_id',matchup.league_season_id).eq('week',matchup.week);
  const { data: teamScores } = await supabase.from('fantasy_team_scores').select('real_team_id,points').eq('league_season_id',matchup.league_season_id).eq('week',matchup.week);
  const playerMap = new Map((playerScores ?? []).map(x => [x.athlete_id, Number(x.points)]));
  const teamMap = new Map((teamScores ?? []).map(x => [x.real_team_id, Number(x.points)]));

  const slotOrder = ['QB:1','RB:1','RB:2','WR:1','WR:2','TE:1','FLEX:1','K:1','DST:1'];
  function assetRow(seasonFranchiseId:string, key:string) {
    const [slot,index] = key.split(':');
    const item = lineups?.find(l => l.season_franchise_id===seasonFranchiseId && l.slot===slot && l.slot_index===Number(index));
    if (!item) return { name:'EMPTY', meta:slot==='DST'?'D/ST':slot, points:0 };
    if (item.athlete_id) {
      const athlete = Array.isArray(item.athletes) ? item.athletes[0] : item.athletes as {display_name?:string;position?:string;real_teams?:{abbreviation?:string}|{abbreviation?:string}[]|null}|null;
      const team = Array.isArray(athlete?.real_teams) ? athlete?.real_teams[0] : athlete?.real_teams;
      return { name:athlete?.display_name ?? 'Athlete', meta:`${slot==='FLEX'?athlete?.position:slot} • ${team?.abbreviation ?? 'FA'}`, points:playerMap.get(item.athlete_id) ?? 0 };
    }
    const team = Array.isArray(item.real_teams) ? item.real_teams[0] : item.real_teams as {abbreviation?:string}|null;
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
      {query.error && <p className="errorNotice">{query.error}</p>}
      {query.finalized && <p className="successNotice">Matchup finalized and standings updated.</p>}
      <div className="actions"><form action={refreshMatchup}><input type="hidden" name="matchup_id" value={matchupId}/><button className="secondary">Refresh Scores</button></form>{leagueRole?.role==='commissioner' && !matchup.is_final && <form action={finalizeMatchup}><input type="hidden" name="matchup_id" value={matchupId}/><button className="primary">Finalize When Games End</button></form>}</div>
    </section>
    <section className="panel">
      <p className="eyebrow">HEAD-TO-HEAD LINEUP</p>
      <div className="battleList">{slotOrder.map(key => { const h=assetRow(matchup.home_season_franchise_id,key); const a=assetRow(matchup.away_season_franchise_id,key); return <div className="battleRow" key={key}><div><span>{h.meta}</span><strong>{h.name}</strong><b>{h.points.toFixed(2)}</b></div><em>{key.split(':')[0]==='DST'?'D/ST':key.split(':')[0]}</em><div><span>{a.meta}</span><strong>{a.name}</strong><b>{a.points.toFixed(2)}</b></div></div>})}</div>
    </section>
  </main>;
}
