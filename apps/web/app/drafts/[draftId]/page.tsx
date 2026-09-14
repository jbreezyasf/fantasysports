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
type ScoreSeasonRef={competition_seasons?:{season_year?:number|string|null}|{season_year?:number|string|null}[]|null};
type ScoreWithSeason={athlete_id?:string|null;real_team_id?:string|null;points:number|string|null;calculated_at:string|null;league_seasons?:ScoreSeasonRef|ScoreSeasonRef[]|null};
type DraftHistoricalValue={athlete_id?:string|null;real_team_id?:string|null;points:number|string|null;imported_at:string|null;season_year:number|string|null;source?:string|null};
type DraftMarketValue={athlete_id?:string|null;overall_rank:number|string|null;position_rank:number|string|null;adp:number|string|null;projected_points:number|string|null;imported_at:string|null;source?:string|null;scoring_format?:string|null};
function firstRef<T>(value:T|T[]|null|undefined):T|null{return !value?null:Array.isArray(value)?value[0]??null:value;}
function scoreSeasonYear(score:ScoreWithSeason){return firstRef(firstRef(score.league_seasons)?.competition_seasons)?.season_year??null;}

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
    supabase.from('competition_seasons').select('competition_id,season_year').eq('id', leagueSeason.competition_season_id).maybeSingle()
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
  const [{ data: athletes, error: athleteError }, { data: realTeams, error: teamError }, { data: draftValues }, { data: marketValues, error: marketError }, { data: athleteScores }, { data: defenseScores }, { data: queueItems, error: queueError }] = await Promise.all([
    loadFantasyEligibleAthletes(supabase),
    competitionSeason?.competition_id ? supabase.from('real_teams').select('id,display_name,abbreviation').eq('competition_id', competitionSeason.competition_id).order('abbreviation').limit(64) : Promise.resolve({ data: [], error: null }),
    competitionSeason?.competition_id ? supabase.from('draft_historical_values').select('athlete_id,real_team_id,points,imported_at,season_year,source').eq('competition_id', competitionSeason.competition_id).order('season_year', { ascending: false }).limit(10000) : Promise.resolve({ data: [], error: null }),
    competitionSeason?.competition_id && competitionSeason?.season_year ? supabase.from('fantasy_player_market_values').select('athlete_id,overall_rank,position_rank,adp,projected_points,imported_at,source,scoring_format').eq('competition_id',competitionSeason.competition_id).eq('season_year',competitionSeason.season_year).eq('scoring_format','half_ppr').limit(5000) : Promise.resolve({data:[],error:null}),
    supabase.from('fantasy_player_scores').select('athlete_id,points,calculated_at,league_seasons(competition_seasons(season_year))').order('calculated_at', { ascending: false }).limit(5000),
    supabase.from('fantasy_team_scores').select('real_team_id,points,calculated_at,league_seasons(competition_seasons(season_year))').order('calculated_at', { ascending: false }).limit(5000),
    mySeasonFranchise
      ? supabase.from('draft_queues').select('id,queue_rank,athlete_id,real_team_id').eq('draft_id', draftId).eq('season_franchise_id', mySeasonFranchise.id).order('queue_rank')
      : Promise.resolve({ data: [], error: null })
  ]);
  const draftedAthleteIds = new Set((picks ?? []).map(p => p.athlete_id).filter(Boolean));
  const draftedTeamIds = new Set((picks ?? []).map(p => p.real_team_id).filter(Boolean));
  const availableAthletes = (athletes ?? []).filter(a => !draftedAthleteIds.has(a.id));
  const availableDST = (realTeams ?? []).filter(team => !draftedTeamIds.has(team.id));
  const historicalValues = (draftValues ?? []) as DraftHistoricalValue[];
  const hasHistoricalValues = historicalValues.length > 0;
  const rankedPool = buildDraftRankings(
    availableAthletes.map(athlete => {
      const team = Array.isArray(athlete.real_teams) ? athlete.real_teams[0] : athlete.real_teams;
      return { id: athlete.id, displayName: athlete.display_name, position: athlete.position, team: team?.abbreviation ?? 'FA' };
    }),
    availableDST.map(team => ({ id: team.id, displayName: team.display_name ?? team.abbreviation ?? 'Defense', team: team.abbreviation ?? team.display_name ?? 'D/ST' })),
    hasHistoricalValues
      ? historicalValues.filter(score => score.athlete_id).map(score => ({ assetId: score.athlete_id ?? null, points: score.points, calculated_at: score.imported_at, seasonYear: score.season_year, source: score.source }))
      : ((athleteScores ?? []) as ScoreWithSeason[]).map(score => ({ assetId: score.athlete_id ?? null, points: score.points, calculated_at: score.calculated_at, seasonYear: scoreSeasonYear(score) })),
    hasHistoricalValues
      ? historicalValues.filter(score => score.real_team_id).map(score => ({ assetId: score.real_team_id ?? null, points: score.points, calculated_at: score.imported_at, seasonYear: score.season_year, source: score.source }))
      : ((defenseScores ?? []) as ScoreWithSeason[]).map(score => ({ assetId: score.real_team_id ?? null, points: score.points, calculated_at: score.calculated_at, seasonYear: scoreSeasonYear(score) })),
    ((marketValues??[]) as DraftMarketValue[]).map(value=>({assetId:value.athlete_id??null,overallRank:value.overall_rank,positionRank:value.position_rank,adp:value.adp,projectedPoints:value.projected_points,importedAt:value.imported_at,source:value.source,scoringFormat:value.scoring_format})),
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
  const poolError = athleteError?.message || teamError?.message || marketError?.message || queueError?.message;
  const currentManager=firstRef(currentFranchise?.franchises as FranchiseRef|FranchiseRef[]|null);
  const managerOnClock=currentManager?.name??currentManager?.abbreviation??null;
  const userNextPick=mySeasonFranchise?(picks??[]).find(p=>p.pick_number>=draft.current_pick&&p.season_franchise_id===mySeasonFranchise.id&&!p.picked_at)?.pick_number:null;
  const recentPicks=(picks??[]).filter(p=>p.picked_at).slice(-8).reverse();
  const pickAssetLabel=(pick:typeof recentPicks[number])=>{if(pick.athlete_id){const athlete=firstRef(pick.athletes as AthleteRef|AthleteRef[]|null);return `${athlete?.display_name??'Athlete'}${athlete?.position?` • ${athlete.position}`:''}`;}const team=firstRef(pick.real_teams as TeamRef|TeamRef[]|null);return `${team?.abbreviation??team?.display_name??'Team'} D/ST`;};
  const userOnClock=current?.season_franchise_id===mySeasonFranchise?.id;
  const myDraftedAssets=(picks??[]).filter(pick=>pick.picked_at&&pick.season_franchise_id===mySeasonFranchise?.id).map(pick=>({id:pick.id,pickNumber:pick.pick_number,label:pickAssetLabel(pick)}));
  const remainingSeconds=draft.current_pick_deadline_at?Math.max(0,Math.ceil((new Date(draft.current_pick_deadline_at).getTime()-Date.now())/1000)):null;

  return (
    <main className="draftRoom draftRoomEvent">
      {draft.status !== 'completed' && <div className="draftRoomIdentity"><p className="eyebrow">THE SELECTION SUITE</p><h1>Draft Room</h1><p>Your board. Your next franchise player.</p></div>}
      <header className="draftEventHeader">
        <div><a className="backLink" href={`/leagues/${leagueSeason.league_id}`}>← LEAGUE HQ</a><p>{league?.name ?? 'BIG EXEC LEAGUE'}</p></div>
        <div><span className="leagueRole">{draft.status.toUpperCase()}</span><DraftRoomLive draftId={draftId} seasonFranchiseId={mySeasonFranchise?.id ?? null}/></div>
      </header>
      {query.error && <p className="errorNotice" role="alert">{query.error}</p>}
      {query.draft_status==='picked'&&<p className="successNotice" role="status">Draft pick confirmed: {query.draft_asset??'selected player'}.</p>}
      {query.draft_status==='queued'&&<p className="successNotice" role="status">Added to draft queue: {query.draft_asset??'selected player'}.</p>}
      <p className="srOnly" role="status">{draftStateAnnouncement({status:draft.status,currentRound:current?.round_number,currentPick:draft.current_pick,roundPick:current?.round_pick,managerOnClock,userNextPick})}{userOnClock?` ${onClockAnnouncement(current?.round_number,current?.round_pick,remainingSeconds)}`:''}</p>

      {draft.status !== 'completed' && <>
        <section className={`draftCommandBar ${userOnClock?'isUserTurn':''}`} aria-label="Current draft status">
          <div className="draftClockManager"><span>{userOnClock?'YOUR PICK':'ON THE CLOCK'}</span><strong>{managerOnClock??(draft.status==='scheduled'?'Waiting to start':'Draft paused')}</strong></div>
          <div className="draftPickPosition"><span>ROUND</span><strong>{current?.round_number??'—'}</strong><small>PICK {current?.round_pick??'—'} • #{draft.current_pick}</small></div>
          <div className="draftClockCell">{draft.status==='live'?<DraftClock deadlineAt={draft.current_pick_deadline_at} announcementPrefix={userOnClock?`You are on the clock. Round ${current?.round_number??'unknown'}, Pick ${current?.round_pick??'unknown'}.`:undefined} announceThresholds={userOnClock} draftId={draftId} processExpiredAction={processExpiredDraftPick}/>:<strong>{draft.status==='paused'?'PAUSED':'NOT LIVE'}</strong>}</div>
          <div className="draftNextPick"><span>NEXT FOR YOU</span><strong>{userOnClock?'NOW':userNextPick?`OVERALL #${userNextPick}`:'NO PICKS LEFT'}</strong></div>
        </section>
        <section className="draftOrderStrip" id="draft-board" aria-labelledby="draft-order-heading"><div><span>DRAFT ORDER</span><strong id="draft-order-heading">Snake board</strong></div><div className="draftOrderRail" tabIndex={0} role="region" aria-label="Draft order, scroll to see all franchises">{(seasonFranchises??[]).map(sf=>{const franchise=firstRef(sf.franchises as FranchiseRef|FranchiseRef[]|null);return <article className={`${sf.id===current?.season_franchise_id?'isOnClock':''} ${sf.id===mySeasonFranchise?.id?'isMine':''}`} key={sf.id}><span>{sf.draft_position}</span><div><strong>{franchise?.abbreviation??`P${sf.draft_position}`}</strong><small>{franchise?.name??'Franchise'}</small></div></article>;})}</div></section>
        {member?.role==='commissioner'&&<details className="draftCommissionerMenu"><summary>Commissioner controls</summary><div>{draft.status==='scheduled'&&<form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Start Draft</button></form>}{draft.status==='paused'&&<form action={startDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="primary" type="submit">Resume Draft</button></form>}{draft.status==='live'&&<form action={pauseDraft}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Pause Draft</button></form>}{draft.status==='live'&&<form action={processExpiredDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Process Expired Pick</button></form>}{draft.status!=='scheduled'&&<form action={undoLastDraftPick}><input type="hidden" name="draft_id" value={draftId}/><button className="secondary" type="submit">Undo Last Pick</button></form>}</div></details>}
        {draft.status==='paused'&&<p className="successNotice">Draft paused. Your queue and player filters are preserved.</p>}
        {poolError?<section className="panel"><p className="errorNotice" role="alert">The draft pool could not be loaded. {poolError}</p></section>:<DraftPlayerPool draftId={draftId} status={draft.status} canDraft={userOnClock&&draft.status==='live'} athletes={rankedPool.athletes} defenses={rankedPool.defenses} queuedAssets={queuedAssets} draftedAssets={myDraftedAssets} rankingSource={rankedPool.source} rankingVersion={rankedPool.version}/>}
      </>}

      {draft.status==='completed'&&<section className="draftCompletionLetter" aria-labelledby="draft-complete-heading"><p className="eyebrow">A LETTER FROM BIG EXEC</p><h1 id="draft-complete-heading">Congratulations, Franchise Managers.</h1><p>Dear Franchise Managers,</p><p>The draft is complete, your franchises are built, and a new Big Exec season is officially underway. Every pick is now part of your team’s story.</p><p>Thank you for showing up, making the calls, and competing together. Set your lineups, watch the waiver wire, talk your talk, and take care of business each week.</p><strong>Let’s have a great season—and get ready for some football.</strong><p>— Big Exec Fantasy Sports</p><div><a className="primary" href={`/leagues/${leagueSeason.league_id}/trades`}>Enter Trade Room</a>{mySeasonFranchise&&<a className="secondary" href={`/franchises/${mySeasonFranchise.franchise_id}/team`}>Manage Team</a>}<a className="secondary" href={`/leagues/${leagueSeason.league_id}/locker-room`}>Locker Room</a></div></section>}

      <section className="draftRecentPicks" aria-labelledby="recent-picks-heading"><div><p className="eyebrow">RECENT PICKS</p><h2 id="recent-picks-heading">Latest off the board</h2></div><div>{recentPicks.map(pick=>{const sf=(seasonFranchises??[]).find(sf=>sf.id===pick.season_franchise_id);const franchise=firstRef(sf?.franchises as FranchiseRef|FranchiseRef[]|null);return <article aria-label={`Pick ${pick.pick_number}, round ${pick.round_number}, ${franchise?.name??'Franchise'} selected ${pickAssetLabel(pick)}`} key={pick.id}><span>#{pick.pick_number}</span><strong>{pickAssetLabel(pick)}</strong><small>{franchise?.abbreviation??franchise?.name??'Franchise'}</small></article>})}{!recentPicks.length&&<p className="lede">No picks have been made yet.</p>}</div></section>
    </main>
  );
}
