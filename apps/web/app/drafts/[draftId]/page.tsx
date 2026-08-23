import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { startDraft } from '../actions';
import { DraftPlayerPool } from './DraftPlayerPool';

const FANTASY_ELIGIBLE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

export default async function DraftPage({ params, searchParams }: { params: Promise<{ draftId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { draftId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: draft } = await supabase.from('drafts').select('id,status,rounds,pick_seconds,current_pick,starts_at,league_season_id').eq('id', draftId).maybeSingle();
  if (!draft) notFound();
  const { data: leagueSeason } = await supabase.from('league_seasons').select('id,league_id,competition_season_id').eq('id', draft.league_season_id).maybeSingle();
  if (!leagueSeason) notFound();
  const [{ data: league }, { data: member }, { data: competitionSeason }] = await Promise.all([
    supabase.from('fantasy_leagues').select('name').eq('id', leagueSeason.league_id).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id', leagueSeason.league_id).eq('user_id', user.id).maybeSingle(),
    supabase.from('competition_seasons').select('competition_id').eq('id', leagueSeason.competition_season_id).maybeSingle()
  ]);
  const [{ data: picks }, { data: seasonFranchises }] = await Promise.all([
    supabase.from('draft_picks').select('id,pick_number,round_number,round_pick,season_franchise_id,athlete_id,real_team_id,picked_at').eq('draft_id', draftId).order('pick_number').limit(250),
    supabase.from('season_franchises').select('id,draft_position,franchise_id,franchises(name,abbreviation)').eq('league_season_id', draft.league_season_id).order('draft_position')
  ]);
  const current = picks?.find(p => p.pick_number === draft.current_pick);
  const currentFranchise = seasonFranchises?.find(sf => sf.id === current?.season_franchise_id);
  const [{ data: athletes, error: athleteError }, { data: realTeams, error: teamError }] = await Promise.all([
    supabase.from('athletes').select('id,display_name,position,real_team_id,real_teams(display_name,abbreviation)').eq('active', true).in('position', ['QB', 'RB', 'WR', 'TE', 'K']).order('position').order('display_name').limit(500),
    competitionSeason?.competition_id ? supabase.from('real_teams').select('id,display_name,abbreviation').eq('competition_id', competitionSeason.competition_id).order('abbreviation').limit(64) : Promise.resolve({ data: [], error: null })
  ]);
  const draftedAthleteIds = new Set((picks ?? []).map(p => p.athlete_id).filter(Boolean));
  const draftedTeamIds = new Set((picks ?? []).map(p => p.real_team_id).filter(Boolean));
  const availableAthletes = (athletes ?? []).filter(a => FANTASY_ELIGIBLE_POSITIONS.has(String(a.position ?? '').toUpperCase())).filter(a => !draftedAthleteIds.has(a.id));
  const availableDST = (realTeams ?? []).filter(team => !draftedTeamIds.has(team.id));
  const poolError = athleteError?.message || teamError?.message;

  return (
    <main className="draftRoom">
      <section className="leagueHero" style={{minHeight:330}}>
        <div className="leagueHeroGlow"/><div className="leagueTopline"><a className="backLink" href={`/leagues/${leagueSeason.league_id}`}>← LEAGUE HQ</a><span className="leagueRole">DRAFT ROOM</span></div>
        <div className="leagueHeroContent"><p className="eyebrow">{league?.name ?? 'BIG EXEC LEAGUE'}</p><h1>{draft.status === 'live' ? `Pick ${draft.current_pick}` : 'Draft night.'}</h1><p className="leagueTagline">Snake draft • {draft.rounds} rounds • {draft.pick_seconds}s per pick</p><div className="leagueMetaRow"><span>{draft.status.toUpperCase()}</span><span>QB / RB / WR / TE / K</span><span>TEAM D/ST</span></div></div>
      </section>
      {query.error && <p className="errorNotice" role="alert">{query.error}</p>}
      {draft.status === 'scheduled' && member?.role === 'commissioner' && <section className="panel"><form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Start Draft</button></form></section>}
      {draft.status === 'live' && currentFranchise && <section className="panel"><div className="inviteLinkBox"><span>ON THE CLOCK</span><strong>{Array.isArray(currentFranchise.franchises) ? currentFranchise.franchises[0]?.name : (currentFranchise.franchises as {name?:string}|null)?.name}</strong><p className="lede">Round {current?.round_number}, Pick {current?.round_pick}</p></div></section>}
      {draft.status === 'completed' && <p className="successNotice">Draft complete. Rosters are locked in for the next phase.</p>}
      <section className="panel"><p className="eyebrow">DRAFT ORDER</p><div className="sportGrid">{(seasonFranchises ?? []).map(sf => { const franchise = Array.isArray(sf.franchises) ? sf.franchises[0] : sf.franchises as {name?:string;abbreviation?:string}|null; return <article className="sportCard" key={sf.id}><span>PICK {sf.draft_position}</span><strong>{franchise?.name ?? 'Franchise'}</strong><p className="lede">{franchise?.abbreviation ?? ''}</p></article>; })}</div></section>
      {poolError?<section className="panel"><p className="errorNotice" role="alert">The draft pool could not be loaded. {poolError}</p></section>:<DraftPlayerPool draftId={draftId} status={draft.status} athletes={availableAthletes.map(athlete=>{const team=Array.isArray(athlete.real_teams)?athlete.real_teams[0]:athlete.real_teams as {abbreviation?:string}|null;return{id:athlete.id,displayName:athlete.display_name,position:athlete.position,team:team?.abbreviation??'FA'}})} defenses={availableDST.map(team=>({id:team.id,displayName:team.display_name,team:team.abbreviation??team.display_name}))}/>} 
    </main>
  );
}
