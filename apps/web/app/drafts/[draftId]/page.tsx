import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { loadFantasyEligibleAthletes } from '../../../lib/fantasy/athletePool';
import { buildDraftRankings } from '../../../lib/fantasy/draftRankings';
import { pauseDraft, processExpiredDraftPick, startDraft, undoLastDraftPick } from '../actions';
import DraftClock from './DraftClock';
import { DraftPlayerPool } from './DraftPlayerPool';
import DraftRoomLive from './DraftRoomLive';
import { draftStateAnnouncement, onClockAnnouncement } from './draftAccessibility';

type FranchiseRef={name?:string;abbreviation?:string};
type AthleteRef={display_name?:string;position?:string};
type TeamRef={display_name?:string;abbreviation?:string};
function firstRef<T>(value:T|T[]|null|undefined):T|null{return !value?null:Array.isArray(value)?value[0]??null:value;}

export default async function DraftPage({ params, searchParams }: { params: Promise<{ draftId: string }>; searchParams: Promise<{ error?: string; draft_status?: string; draft_asset?: string }> }) {
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
    supabase.from('draft_picks').select('id,pick_number,round_number,round_pick,season_franchise_id,athlete_id,real_team_id,picked_at,athletes(display_name,position),real_teams(display_name,abbreviation)').eq('draft_id', draftId).order('pick_number').limit(250),
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
  const currentManager=firstRef(currentFranchise?.franchises as FranchiseRef|FranchiseRef[]|null);
  const managerOnClock=currentManager?.name??currentManager?.abbreviation??null;
  const userNextPick=mySeasonFranchise?(picks??[]).find(p=>p.pick_number>=draft.current_pick&&p.season_franchise_id===mySeasonFranchise.id&&!p.picked_at)?.pick_number:null;
  const recentPicks=(picks??[]).filter(p=>p.picked_at).slice(-8).reverse();
  const pickAssetLabel=(pick:typeof recentPicks[number])=>{if(pick.athlete_id){const athlete=firstRef(pick.athletes as AthleteRef|AthleteRef[]|null);return `${athlete?.display_name??'Athlete'}${athlete?.position?` • ${athlete.position}`:''}`;}const team=firstRef(pick.real_teams as TeamRef|TeamRef[]|null);return `${team?.abbreviation??team?.display_name??'Team'} D/ST`;};
  const userOnClock=current?.season_franchise_id===mySeasonFranchise?.id;
  const remainingSeconds=draft.current_pick_deadline_at?Math.max(0,Math.ceil((new Date(draft.current_pick_deadline_at).getTime()-Date.now())/1000)):null;

  return (
    <main className="draftRoom">
      <DraftRoomLive draftId={draftId} seasonFranchiseId={mySeasonFranchise?.id ?? null}/>
      <section className="leagueHero" style={{minHeight:330}}>
        <div className="leagueHeroGlow"/><div className="leagueTopline"><a className="backLink" href={`/leagues/${leagueSeason.league_id}`}>← LEAGUE HQ</a><span className="leagueRole">DRAFT ROOM</span></div>
        <div className="leagueHeroContent"><p className="eyebrow">{league?.name ?? 'BIG EXEC LEAGUE'}</p><h1>{draft.status === 'live' ? `Pick ${draft.current_pick}` : 'Draft night.'}</h1><p className="leagueTagline">Snake draft • {draft.rounds} rounds • {draft.pick_seconds}s per pick</p><div className="leagueMetaRow"><span>{draft.status.toUpperCase()}</span><span>QB / RB / WR / TE / K</span><span>TEAM D/ST</span></div></div>
      </section>
      {query.error && <p className="errorNotice" role="alert">{query.error}</p>}
      {query.draft_status==='picked'&&<p className="successNotice" role="status">Draft pick confirmed: {query.draft_asset??'selected player'}.</p>}
      {query.draft_status==='queued'&&<p className="successNotice" role="status">Added to draft queue: {query.draft_asset??'selected player'}.</p>}
      <section className="panel" aria-labelledby="draft-state-heading"><p className="eyebrow">DRAFT STATE</p><h2 id="draft-state-heading" className="srOnly">Current draft state</h2><p className="successNotice" role="status">{draftStateAnnouncement({status:draft.status,currentRound:current?.round_number,currentPick:draft.current_pick,roundPick:current?.round_pick,managerOnClock,userNextPick})}</p>{userOnClock&&<p className="successNotice" role="status">{onClockAnnouncement(current?.round_number,current?.round_pick,remainingSeconds)}</p>}</section>
      {draft.status === 'scheduled' && member?.role === 'commissioner' && <section className="panel"><form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Start Draft</button></form></section>}
      {draft.status === 'paused' && member?.role === 'commissioner' && <section className="panel"><div className="draftCommissionerTools"><form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Resume Draft</button></form><form action={undoLastDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Undo Last Pick</button></form></div></section>}
      {draft.status === 'paused' && <p className="successNotice">Draft paused. The commissioner can resume when ready.</p>}
      {draft.status === 'live' && currentFranchise && <section className="panel"><div className="inviteLinkBox"><span>ON THE CLOCK</span><strong>{managerOnClock}</strong><p className="lede">Round {current?.round_number}, Pick {current?.round_pick}</p><DraftClock deadlineAt={draft.current_pick_deadline_at} announcementPrefix={userOnClock?`You are on the clock. Round ${current?.round_number??'unknown'}, Pick ${current?.round_pick??'unknown'}.`:undefined} announceThresholds={userOnClock} draftId={draftId} processExpiredAction={processExpiredDraftPick}/>{member?.role === 'commissioner' && <div className="draftCommissionerTools"><form action={pauseDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Pause Draft</button></form><form action={processExpiredDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Process Expired Pick</button></form><form action={undoLastDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Undo Last Pick</button></form></div>}</div></section>}
      {draft.status === 'completed' && <p className="successNotice">Draft complete. Rosters are locked in for the next phase.</p>}
      <section className="panel" aria-labelledby="recent-picks-heading"><p className="eyebrow">RECENT PICKS</p><h2 id="recent-picks-heading">Last selections.</h2><div className="playerList">{recentPicks.map(pick=>{const sf=(seasonFranchises??[]).find(sf=>sf.id===pick.season_franchise_id);const franchise=firstRef(sf?.franchises as FranchiseRef|FranchiseRef[]|null);return <article className="playerRow" aria-label={`Pick ${pick.pick_number}, round ${pick.round_number}, ${franchise?.name??'Franchise'} selected ${pickAssetLabel(pick)}`} key={pick.id}><div><span>ROUND {pick.round_number} • PICK {pick.round_pick}</span><strong>{pickAssetLabel(pick)}</strong><small>{franchise?.name??'Franchise'}</small></div></article>})}{!recentPicks.length&&<p className="lede">No picks have been made yet.</p>}</div></section>
      <section className="panel"><p className="eyebrow">DRAFT ORDER</p><div className="sportGrid">{(seasonFranchises ?? []).map(sf => { const franchise = Array.isArray(sf.franchises) ? sf.franchises[0]?.name : (sf.franchises as {name?:string}|null)?.name; const abbreviation = Array.isArray(sf.franchises) ? sf.franchises[0]?.abbreviation : (sf.franchises as {abbreviation?:string}|null)?.abbreviation; return <article className="sportCard" key={sf.id}><span>PICK {sf.draft_position}</span><strong>{franchise ?? 'Franchise'}</strong><p className="lede">{abbreviation ?? ''}</p></article>; })}</div></section>
      {poolError?<section className="panel"><p className="errorNotice" role="alert">The draft pool could not be loaded. {poolError}</p></section>:<DraftPlayerPool draftId={draftId} status={draft.status} athletes={rankedPool.athletes} defenses={rankedPool.defenses} queuedAssets={queuedAssets} rankingSource={rankedPool.source} rankingVersion={rankedPool.version}/>}
    </main>
  );
}
