import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { makeDraftPick, startDraft } from '../actions';

export default async function DraftPage({ params, searchParams }: { params: Promise<{ draftId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { draftId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: draft } = await supabase.from('drafts').select('id,status,rounds,pick_seconds,current_pick,starts_at,league_season_id').eq('id', draftId).maybeSingle();
  if (!draft) notFound();
  const { data: leagueSeason } = await supabase.from('league_seasons').select('id,league_id').eq('id', draft.league_season_id).maybeSingle();
  if (!leagueSeason) notFound();
  const { data: league } = await supabase.from('fantasy_leagues').select('name').eq('id', leagueSeason.league_id).maybeSingle();
  const { data: member } = await supabase.from('league_members').select('role').eq('league_id', leagueSeason.league_id).eq('user_id', user.id).maybeSingle();
  const { data: picks } = await supabase.from('draft_picks').select('id,pick_number,round_number,round_pick,season_franchise_id,athlete_id,real_team_id,picked_at').eq('draft_id', draftId).order('pick_number').limit(40);
  const { data: seasonFranchises } = await supabase.from('season_franchises').select('id,draft_position,franchise_id,franchises(name,abbreviation)').eq('league_season_id', draft.league_season_id).order('draft_position');
  const current = picks?.find(p => p.pick_number === draft.current_pick);
  const currentFranchise = seasonFranchises?.find(sf => sf.id === current?.season_franchise_id);

  const { data: athletes } = await supabase.from('athletes').select('id,display_name,position,real_team_id,real_teams(display_name,abbreviation)').eq('active', true).order('display_name').limit(150);
  const draftedAthleteIds = new Set((picks ?? []).map(p => p.athlete_id).filter(Boolean));
  const availableAthletes = (athletes ?? []).filter(a => !draftedAthleteIds.has(a.id)).slice(0, 60);

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">DRAFT ROOM / {league?.name ?? 'LEAGUE'}</p>
        <h1>{draft.status === 'live' ? `Pick ${draft.current_pick}` : 'Draft night.'}</h1>
        <p className="lede">Snake draft • {draft.rounds} rounds • {draft.pick_seconds}s per pick</p>
        {query.error && <p className="errorNotice">{query.error}</p>}
        {draft.status === 'scheduled' && member?.role === 'commissioner' && <form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Start Draft</button></form>}
        {draft.status === 'live' && currentFranchise && <div className="inviteLinkBox"><span>ON THE CLOCK</span><strong>{Array.isArray(currentFranchise.franchises) ? currentFranchise.franchises[0]?.name : (currentFranchise.franchises as {name?:string}|null)?.name}</strong><p className="lede">Round {current?.round_number}, Pick {current?.round_pick}</p></div>}
        {draft.status === 'completed' && <p className="successNotice">Draft complete. Rosters are locked in for the next phase.</p>}
      </section>

      <section className="panel">
        <p className="eyebrow">DRAFT ORDER</p>
        <div className="sportGrid">{(seasonFranchises ?? []).map(sf => {
          const franchise = Array.isArray(sf.franchises) ? sf.franchises[0] : sf.franchises as {name?:string;abbreviation?:string}|null;
          return <article className="sportCard" key={sf.id}><span>PICK {sf.draft_position}</span><strong>{franchise?.name ?? 'Franchise'}</strong><p className="lede">{franchise?.abbreviation ?? ''}</p></article>;
        })}</div>
      </section>

      <section className="panel">
        <p className="eyebrow">PLAYER POOL</p>
        <h2>Available athletes.</h2>
        {!availableAthletes.length ? <p className="errorNotice">The athlete pool has not been loaded into Supabase yet. The draft engine is ready; historical/current athlete ingestion is the next data blocker.</p> : <div className="playerList">{availableAthletes.map(athlete => {
          const team = Array.isArray(athlete.real_teams) ? athlete.real_teams[0] : athlete.real_teams as {display_name?:string;abbreviation?:string}|null;
          return <form className="playerRow" action={makeDraftPick} key={athlete.id}>
            <input type="hidden" name="draft_id" value={draftId}/><input type="hidden" name="athlete_id" value={athlete.id}/>
            <div><span>{athlete.position} • {team?.abbreviation ?? 'FA'}</span><strong>{athlete.display_name}</strong></div>
            <button className="secondary" type="submit" disabled={draft.status !== 'live'}>Draft</button>
          </form>;
        })}</div>}
      </section>
    </main>
  );
}
