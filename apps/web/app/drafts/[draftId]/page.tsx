import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { loadFantasyEligibleAthletes } from '../../../lib/fantasy/athletePool';
import { buildDraftRankings } from '../../../lib/fantasy/draftRankings';
import { pauseDraft, processExpiredDraftPick, startDraft, undoLastDraftPick } from '../actions';
import DraftClock from './DraftClock';
import { DraftPlayerPool } from './DraftPlayerPool';
import DraftRoomLive from './DraftRoomLive';

export default async function DraftPage({ params, searchParams }: { params: Promise<{ draftId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { draftId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: draft } = await supabase.from('drafts').select('id,status,rounds,pick_seconds,current_pick,current_pick_deadline_at,starts_at,league_season_id').eq('id', draftId).maybeSingle();
  if (!draft) notFound();
  const { data: leagueSeason } = await supabase.from('league_seasons').select('id,league_id,competition_season_id').eq('id', draft.league_season_id).maybeSingle();
  if (!leagueSeason) notFound();
  const [{ data: league }, { data: member }, { data: competitionSeason }] = await Promise.all([
    supabase.from('fantasy_leagues').select('name').eq('id', leagueSeason.league_id).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id', leagueSeason.league_id).eq('user_id', user.id).maybeSingle(),
    supabase.from('competition_seasons').select('competition_id').eq('id', leagueSeason.competition_season_id).maybeSingle()
  ]);
  const [{ data: picks }, { data: seasonFranchises }, { data: ownerships }] = await Promise.all([
    supabase.from('draft_picks').select('id,pick_number,round_number,round_pick,season_franchise_id,athlete_id,real_team_id,picked_at').eq('draft_id', draftId).order('pick_number').limit(250),
    supabase.from('season_franchises').select('id,draft_position,franchise_id,franchises(name,abbreviation)').eq('league_season_id', draft.league_season_id).order('draft_position'),
    supabase.from('franchise_owners').select('franchise_id').eq('user_id', user.id).is('ends_on', null)
  ]);
  const ownedFranchiseIds = new Set((ownerships ?? []).map(ownership => ownership.franchise_id));
  const mySeasonFranchise = (seasonFranchises ?? []).find(sf => ownedFranchiseIds.has(sf.franchise_id));
  const current = picks?.find(p => p.pick_number === draft.current_pick);
  const currentFranchise = seasonFranchises?.find(sf => sf.id === current?.season_franchise_id);
  const [{ data: athletes, error: athleteError }, { data: realTeams, error: teamError }, { data: athleteScores }, { data: defenseScores }, { data: queueItems, error: queueError }] = await Promise.all([
    loadFantasyEligibleAthletes(supabase),
    competitionSeason?.competition_id ? supabase.from('real_teams').select('id,display_name,abbreviation').eq('competition_id', competitionSeason.competition_id).order('abbreviation').limit(64) : Promise.resolve({ data: [], error: null }),
    supabase.from('fantasy_player_scores').select('athlete_id,points,calculated_at').order('calculated_at', { ascending: false }).limit(5000),
    supabase.from('fantasy_team_scores').select('real_team_id,points,calculated_at').order('calculated_at', { ascending: false }).limit(5000),
    mySeasonFranchise
      ? supabase.from('draft_queues').select('id,queue_rank,athlete_id,real_team_id').eq('draft_id', draftId).eq('season_franchise_id', mySeasonFranchise.id).order('queue_rank')
      : Promise.resolve({ data: [], error: null })
  ]);
  const draftedAthleteIds = new Set((picks ?? []).map(p => p.athlete_id).filter(Boolean));
  const draftedTeamIds = new Set((picks ?? []).map(p => p.real_team_id).filter(Boolean));
  const availableAthletes = (athletes ?? []).filter(a => !draftedAthleteIds.has(a.id));
  const availableDST = (realTeams ?? []).filter(team => !draftedTeamIds.has(team.id));
  const rankedPool = buildDraftRankings(
    availableAthletes.map(athlete => {
      const team = Array.isArray(athlete.real_teams) ? athlete.real_teams[0] : athlete.real_teams;
      return { id: athlete.id, displayName: athlete.display_name, position: athlete.position, team: team?.abbreviation ?? 'FA' };
    }),
    availableDST.map(team => ({ id: team.id, displayName: team.display_name ?? team.abbreviation ?? 'Defense', team: team.abbreviation ?? team.display_name ?? 'D/ST' })),
    (athleteScores ?? []).map(score => ({ assetId: score.athlete_id, points: score.points, calculated_at: score.calculated_at })),
    (defenseScores ?? []).map(score => ({ assetId: score.real_team_id, points: score.points, calculated_at: score.calculated_at })),
  );
  const athleteQueueItems = (queueItems ?? []).filter((item): item is typeof item & { athlete_id: string } => Boolean(item.athlete_id));
  const teamQueueItems = (queueItems ?? []).filter((item): item is typeof item & { real_team_id: string } => Boolean(item.real_team_id));
  const queuedAthleteIds = new Set(athleteQueueItems.map(item => item.athlete_id));
  const queuedTeamIds = new Set(teamQueueItems.map(item => item.real_team_id));
  const queueByAthleteId = new Map(athleteQueueItems.map(item => [item.athlete_id, item]));
  const queueByTeamId = new Map(teamQueueItems.map(item => [item.real_team_id, item]));
  const queuedAssets = [
    ...rankedPool.athletes.filter(player => queuedAthleteIds.has(player.id)).map(player => {
      const item = queueByAthleteId.get(player.id);
      return { ...player, queueItemId: item?.id ?? '', queueRank: item?.queue_rank ?? player.overallRank, assetType: 'athlete' as const };
    }),
    ...rankedPool.defenses.filter(team => queuedTeamIds.has(team.id)).map(team => {
      const item = queueByTeamId.get(team.id);
      return { ...team, position: 'D/ST', queueItemId: item?.id ?? '', queueRank: item?.queue_rank ?? team.overallRank, assetType: 'defense' as const };
    }),
  ].sort((a, b) => a.queueRank - b.queueRank);
  const poolError = athleteError?.message || teamError?.message || queueError?.message;

  return (
    <main className="draftRoom">
      <DraftRoomLive draftId={draftId} seasonFranchiseId={mySeasonFranchise?.id ?? null}/>
      <section className="leagueHero" style={{minHeight:330}}>
        <div className="leagueHeroGlow"/><div className="leagueTopline"><a className="backLink" href={`/leagues/${leagueSeason.league_id}`}>← LEAGUE HQ</a><span className="leagueRole">DRAFT ROOM</span></div>
        <div className="leagueHeroContent"><p className="eyebrow">{league?.name ?? 'BIG EXEC LEAGUE'}</p><h1>{draft.status === 'live' ? `Pick ${draft.current_pick}` : 'Draft night.'}</h1><p className="leagueTagline">Snake draft • {draft.rounds} rounds • {draft.pick_seconds}s per pick</p><div className="leagueMetaRow"><span>{draft.status.toUpperCase()}</span><span>QB / RB / WR / TE / K</span><span>TEAM D/ST</span></div></div>
      </section>
      {query.error && <p className="errorNotice" role="alert">{query.error}</p>}
      {draft.status === 'scheduled' && member?.role === 'commissioner' && <section className="panel"><form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Start Draft</button></form></section>}
      {draft.status === 'paused' && member?.role === 'commissioner' && <section className="panel"><div className="draftCommissionerTools"><form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Resume Draft</button></form><form action={undoLastDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Undo Last Pick</button></form></div></section>}
      {draft.status === 'paused' && <p className="successNotice">Draft paused. The commissioner can resume when ready.</p>}
      {draft.status === 'live' && currentFranchise && <section className="panel"><div className="inviteLinkBox"><span>ON THE CLOCK</span><strong>{Array.isArray(currentFranchise.franchises) ? currentFranchise.franchises[0]?.name : (currentFranchise.franchises as {name?:string}|null)?.name}</strong><p className="lede">Round {current?.round_number}, Pick {current?.round_pick}</p><DraftClock deadlineAt={draft.current_pick_deadline_at}/>{member?.role === 'commissioner' && <div className="draftCommissionerTools"><form action={pauseDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Pause Draft</button></form><form action={processExpiredDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Process Expired Pick</button></form><form action={undoLastDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Undo Last Pick</button></form></div>}</div></section>}
      {draft.status === 'completed' && <p className="successNotice">Draft complete. Rosters are locked in for the next phase.</p>}
      <section className="panel"><p className="eyebrow">DRAFT ORDER</p><div className="sportGrid">{(seasonFranchises ?? []).map(sf => { const franchise = Array.isArray(sf.franchises) ? sf.franchises[0]?.name : (sf.franchises as {name?:string}|null)?.name; const abbreviation = Array.isArray(sf.franchises) ? sf.franchises[0]?.abbreviation : (sf.franchises as {abbreviation?:string}|null)?.abbreviation; return <article className="sportCard" key={sf.id}><span>PICK {sf.draft_position}</span><strong>{franchise ?? 'Franchise'}</strong><p className="lede">{abbreviation ?? ''}</p></article>; })}</div></section>
      {poolError?<section className="panel"><p className="errorNotice" role="alert">The draft pool could not be loaded. {poolError}</p></section>:<DraftPlayerPool draftId={draftId} status={draft.status} athletes={rankedPool.athletes} defenses={rankedPool.defenses} queuedAssets={queuedAssets} rankingSource={rankedPool.source} rankingVersion={rankedPool.version}/>}
    </main>
  );
}
