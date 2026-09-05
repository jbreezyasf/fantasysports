import { buildDraftRankings } from '../fantasy/draftRankings';
import { loadFantasyEligibleAthletesFrom, type AthletePoolClient } from '../fantasy/athletePoolCore';

type QueryResult<T> = { data: T | null; error?: { message?: string } | null; count?: number | null };
type SupabaseQuery = {
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQuery;
  eq: (column: string, value: unknown) => SupabaseQuery;
  in: (column: string, values: unknown[]) => SupabaseQuery;
  is: (column: string, value: unknown) => SupabaseQuery;
  gte: (column: string, value: unknown) => SupabaseQuery;
  lte: (column: string, value: unknown) => SupabaseQuery;
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery;
  limit: (count: number) => SupabaseQuery;
  range: (from: number, to: number) => Promise<QueryResult<unknown[]>>;
  maybeSingle: <T>() => Promise<QueryResult<T>>;
  then: <TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
};
type SupabaseLike = { from: (table: string) => SupabaseQuery };

export type AssistantGmToolContext = {
  supabase: SupabaseLike;
  userId: string;
};

export type AssistantGmToolName =
  | 'getLeague'
  | 'getRoster'
  | 'getLineup'
  | 'getMatchup'
  | 'getStandings'
  | 'searchPlayers'
  | 'getPlayerDetails'
  | 'comparePlayers'
  | 'getAvailablePlayers'
  | 'getWaiverState'
  | 'getWaiverRules'
  | 'getDraftState'
  | 'getDraftAvailablePlayers'
  | 'getDraftQueue'
  | 'getInjuryStatus'
  | 'getTradeContext'
  | 'getInvitationState'
  | 'getHistory'
  | 'getEntitlement';

export type AssistantGmToolRequest = {
  tool: AssistantGmToolName;
  leagueId: string;
  franchiseId?: string;
  draftId?: string;
  matchupId?: string;
  athleteId?: string;
  athleteIds?: string[];
  tradeId?: string;
  position?: string;
  query?: string;
  week?: number;
};

export type AssistantGmToolResponse<T = unknown> =
  | { ok: true; tool: AssistantGmToolName; data: T }
  | { ok: false; tool: AssistantGmToolName; error: { code: 'unauthorized' | 'not_found' | 'invalid_request' | 'data_error'; message: string } };

type LeagueRow = { id: string; name?: string; max_franchises?: number | null; draft_min_franchises?: number | null };
type LeagueMemberRow = { role?: string | null };
type LeagueSeasonRow = { id: string; league_id?: string; competition_season_id?: string | null; roster_config?: unknown; is_current?: boolean | null; status?: string | null };
type FranchiseRow = { id: string; name?: string; abbreviation?: string; league_id?: string };
type SeasonFranchiseRow = { id: string; franchise_id: string; draft_position?: number | null; franchises?: FranchiseRow | FranchiseRow[] | null };
type RosterEntryRow = { id: string; season_franchise_id: string; athlete_id?: string | null; real_team_id?: string | null; athletes?: Record<string, unknown> | Record<string, unknown>[] | null; real_teams?: Record<string, unknown> | Record<string, unknown>[] | null };
type LineupRow = { season_franchise_id: string; week: number; slot: string; slot_index: number; athlete_id?: string | null; real_team_id?: string | null; athletes?: Record<string, unknown> | Record<string, unknown>[] | null; real_teams?: Record<string, unknown> | Record<string, unknown>[] | null };
type MatchupRow = { id: string; league_season_id: string; week: number; event_type?: string; home_season_franchise_id: string; away_season_franchise_id: string; home_points: number | string; away_points: number | string; is_final: boolean };
type StandingRow = { season_franchise_id: string; wins: number; losses: number; ties?: number | null; points_for: number | string; points_against?: number | string | null; streak?: string | null };
type DraftRow = { id: string; status: string; rounds?: number; pick_seconds?: number; current_pick?: number; current_pick_deadline_at?: string | null; league_season_id: string };
type DraftPickRow = { id: string; pick_number: number; round_number: number; round_pick: number; season_franchise_id: string; athlete_id?: string | null; real_team_id?: string | null; picked_at?: string | null };
type DraftQueueRow = { id: string; queue_rank: number; athlete_id?: string | null; real_team_id?: string | null };
type ScoreSeasonRef = { competition_seasons?: { season_year?: number | string | null } | { season_year?: number | string | null }[] | null };
type ScoreWithSeason = { athlete_id?: string | null; real_team_id?: string | null; points: number | string | null; calculated_at: string | null; league_seasons?: ScoreSeasonRef | ScoreSeasonRef[] | null };
type DraftHistoricalValue = { athlete_id?: string | null; real_team_id?: string | null; points: number | string | null; imported_at: string | null; season_year: number | string | null };
type WaiverHoldRow = { id: string; athlete_id?: string | null; real_team_id?: string | null; source_season_franchise_id?: string | null; starts_at?: string; clears_at: string; status: string; athletes?: Record<string, unknown> | Record<string, unknown>[] | null; real_teams?: Record<string, unknown> | Record<string, unknown>[] | null };
type WaiverClaimRow = { id: string; waiver_hold_id: string; status: string; drop_roster_entry_id?: string | null; created_at?: string; failure_reason?: string | null };
type TradeRow = { id: string; league_season_id: string; proposed_by_franchise_id: string; proposed_to_franchise_id: string; status: string; created_at?: string; resolved_at?: string | null };
type LeagueInviteRow = { id: string; email: string; status: string; expires_at?: string | null; created_at?: string | null };
type EntitlementRow = { id: string; league_season_id: string; product_code: string; status: string; activated_at?: string | null; expires_at?: string | null };

export const assistantGmToolContracts: Record<AssistantGmToolName, { access: 'league_member' | 'owned_franchise' | 'league_member_or_participant'; writes: false; description: string }> = {
  getLeague: { access: 'league_member', writes: false, description: 'Read league metadata and requester league role.' },
  getRoster: { access: 'owned_franchise', writes: false, description: 'Read the requester-owned franchise roster.' },
  getLineup: { access: 'owned_franchise', writes: false, description: 'Read the requester-owned franchise lineup for a week.' },
  getMatchup: { access: 'league_member_or_participant', writes: false, description: 'Read matchup score and lineup state for a league matchup.' },
  getStandings: { access: 'league_member', writes: false, description: 'Read league standings from authoritative standings rows.' },
  searchPlayers: { access: 'league_member', writes: false, description: 'Search the fantasy-eligible player pool with roster availability state.' },
  getPlayerDetails: { access: 'league_member', writes: false, description: 'Read one fantasy-eligible player profile and roster availability state.' },
  comparePlayers: { access: 'league_member', writes: false, description: 'Read multiple player detail records for deterministic comparison.' },
  getAvailablePlayers: { access: 'league_member', writes: false, description: 'List currently unrostered eligible players.' },
  getWaiverState: { access: 'owned_franchise', writes: false, description: 'Read open waiver holds and requester claim state.' },
  getWaiverRules: { access: 'league_member', writes: false, description: 'Read verified waiver model facts for the league.' },
  getDraftState: { access: 'league_member', writes: false, description: 'Read draft status, current pick, and order state.' },
  getDraftAvailablePlayers: { access: 'league_member', writes: false, description: 'Read draft-available players ranked through the canonical draft ranking helper.' },
  getDraftQueue: { access: 'owned_franchise', writes: false, description: 'Read the requester-owned draft queue.' },
  getInjuryStatus: { access: 'league_member', writes: false, description: 'Read verified injury status when present in the fantasy athlete pool.' },
  getTradeContext: { access: 'league_member', writes: false, description: 'Read current league trade context without accepting, rejecting, or proposing a trade.' },
  getInvitationState: { access: 'league_member', writes: false, description: 'Read commissioner-authorized league invitation state.' },
  getHistory: { access: 'league_member', writes: false, description: 'Read authorized league history, championships, awards, and story events.' },
  getEntitlement: { access: 'league_member', writes: false, description: 'Read current league-season Assistant GM entitlement mode.' }
};

function fail(tool: AssistantGmToolName, code: 'unauthorized' | 'not_found' | 'invalid_request' | 'data_error', message: string): AssistantGmToolResponse {
  return { ok: false, tool, error: { code, message } };
}

function scoreSeasonYear(score: ScoreWithSeason) {
  return first(first(score.league_seasons)?.competition_seasons)?.season_year ?? null;
}

function ok<T>(tool: AssistantGmToolName, data: T): AssistantGmToolResponse<T> {
  return { ok: true, tool, data };
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

async function many<T>(query: PromiseLike<QueryResult<unknown>>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? 'Database read failed');
  return (data ?? []) as T[];
}

async function one<T>(query: Promise<QueryResult<T>>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? 'Database read failed');
  return data;
}

async function requireLeagueMember(ctx: AssistantGmToolContext, leagueId: string) {
  const [league, member] = await Promise.all([
    one<LeagueRow>(ctx.supabase.from('fantasy_leagues').select('id,name,max_franchises,draft_min_franchises').eq('id', leagueId).maybeSingle()),
    one<LeagueMemberRow>(ctx.supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', ctx.userId).maybeSingle())
  ]);
  if (!league) throw Object.assign(new Error('League not found'), { code: 'not_found' });
  if (!member) throw Object.assign(new Error('User is not a member of this league'), { code: 'unauthorized' });
  return { league, member };
}

async function currentSeason(ctx: AssistantGmToolContext, leagueId: string) {
  const season = await one<LeagueSeasonRow>(ctx.supabase.from('league_seasons').select('id,league_id,competition_season_id,roster_config,status').eq('league_id', leagueId).eq('is_current', true).maybeSingle());
  if (!season) throw Object.assign(new Error('Current league season not found'), { code: 'not_found' });
  return season;
}

async function resolveOwnedSeasonFranchise(ctx: AssistantGmToolContext, leagueId: string, franchiseId?: string) {
  await requireLeagueMember(ctx, leagueId);
  const season = await currentSeason(ctx, leagueId);
  const [seasonFranchises, ownerships] = await Promise.all([
    many<SeasonFranchiseRow>(ctx.supabase.from('season_franchises').select('id,franchise_id,draft_position,franchises(id,name,abbreviation,league_id)').eq('league_season_id', season.id)),
    many<{ franchise_id: string }>(ctx.supabase.from('franchise_owners').select('franchise_id').eq('user_id', ctx.userId).is('ends_on', null))
  ]);
  const ownedIds = new Set(ownerships.map((ownership) => ownership.franchise_id));
  const seasonFranchise = seasonFranchises.find((item) => ownedIds.has(item.franchise_id) && (!franchiseId || item.franchise_id === franchiseId));
  if (!seasonFranchise) throw Object.assign(new Error('User does not own a franchise in this league'), { code: 'unauthorized' });
  return { season, seasonFranchise };
}

async function franchiseNames(ctx: AssistantGmToolContext, seasonId: string) {
  const rows = await many<SeasonFranchiseRow>(ctx.supabase.from('season_franchises').select('id,franchise_id,draft_position,franchises(id,name,abbreviation)').eq('league_season_id', seasonId));
  return new Map(rows.map((row) => [row.id, first(row.franchises)]));
}

async function rosterOwnership(ctx: AssistantGmToolContext, seasonId: string) {
  const sfs = await many<SeasonFranchiseRow>(ctx.supabase.from('season_franchises').select('id,franchise_id,franchises(name,abbreviation)').eq('league_season_id', seasonId));
  const sfIds = sfs.map((sf) => sf.id);
  const franchises = new Map(sfs.map((sf) => [sf.id, first(sf.franchises)]));
  const rows = sfIds.length ? await many<RosterEntryRow>(ctx.supabase.from('roster_entries').select('id,season_franchise_id,athlete_id,real_team_id').in('season_franchise_id', sfIds).is('dropped_at', null)) : [];
  const athleteOwner = new Map<string, string>();
  const teamOwner = new Map<string, string>();
  for (const row of rows) {
    const franchise = franchises.get(row.season_franchise_id);
    const owner = franchise?.abbreviation ?? franchise?.name ?? 'Rostered';
    if (row.athlete_id) athleteOwner.set(row.athlete_id, owner);
    if (row.real_team_id) teamOwner.set(row.real_team_id, owner);
  }
  return { athleteOwner, teamOwner };
}

export async function runAssistantGmTool(ctx: AssistantGmToolContext, request: AssistantGmToolRequest): Promise<AssistantGmToolResponse> {
  try {
    switch (request.tool) {
      case 'getLeague': {
        const { league, member } = await requireLeagueMember(ctx, request.leagueId);
        return ok(request.tool, { league, requesterRole: member.role ?? 'member' });
      }
      case 'getRoster': {
        const { seasonFranchise } = await resolveOwnedSeasonFranchise(ctx, request.leagueId, request.franchiseId);
        const roster = await many<RosterEntryRow>(ctx.supabase.from('roster_entries').select('id,season_franchise_id,athlete_id,real_team_id,athletes(display_name,position,injury_status,real_teams(abbreviation)),real_teams(display_name,abbreviation)').eq('season_franchise_id', seasonFranchise.id).is('dropped_at', null).order('added_at'));
        return ok(request.tool, { seasonFranchiseId: seasonFranchise.id, roster });
      }
      case 'getLineup': {
        const { seasonFranchise } = await resolveOwnedSeasonFranchise(ctx, request.leagueId, request.franchiseId);
        const week = request.week ?? 1;
        const lineup = await many<LineupRow>(ctx.supabase.from('lineups').select('season_franchise_id,week,slot,slot_index,athlete_id,real_team_id,athletes(display_name,position,real_teams(abbreviation)),real_teams(display_name,abbreviation)').eq('season_franchise_id', seasonFranchise.id).eq('week', week).order('slot_index'));
        return ok(request.tool, { seasonFranchiseId: seasonFranchise.id, week, lineup });
      }
      case 'getMatchup': {
        if (!request.matchupId) return fail(request.tool, 'invalid_request', 'matchupId is required');
        const matchup = await one<MatchupRow>(ctx.supabase.from('matchups').select('id,league_season_id,week,event_type,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final').eq('id', request.matchupId).maybeSingle());
        if (!matchup) return fail(request.tool, 'not_found', 'Matchup not found');
        const season = await one<LeagueSeasonRow>(ctx.supabase.from('league_seasons').select('id,league_id').eq('id', matchup.league_season_id).maybeSingle());
        if (!season || season.league_id !== request.leagueId) return fail(request.tool, 'not_found', 'Matchup does not belong to this league');
        await requireLeagueMember(ctx, request.leagueId);
        const lineups = await many<LineupRow>(ctx.supabase.from('lineups').select('season_franchise_id,week,slot,slot_index,athlete_id,real_team_id,athletes(display_name,position,real_teams(abbreviation)),real_teams(display_name,abbreviation)').eq('week', matchup.week).in('season_franchise_id', [matchup.home_season_franchise_id, matchup.away_season_franchise_id]));
        return ok(request.tool, { matchup, lineups });
      }
      case 'getStandings': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const [standings, names] = await Promise.all([
          many<StandingRow>(ctx.supabase.from('standings').select('season_franchise_id,wins,losses,ties,points_for,points_against,streak').eq('league_season_id', season.id).order('wins', { ascending: false }).order('points_for', { ascending: false })),
          franchiseNames(ctx, season.id)
        ]);
        return ok(request.tool, { standings: standings.map((row, index) => ({ rank: index + 1, ...row, franchise: names.get(row.season_franchise_id) ?? null })) });
      }
      case 'searchPlayers':
      case 'getAvailablePlayers': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const { athleteOwner } = await rosterOwnership(ctx, season.id);
        const q = (request.query ?? '').trim().toLowerCase();
        const position = (request.position ?? 'ALL').toUpperCase();
        const athletes = await loadFantasyEligibleAthletesFrom(ctx.supabase as unknown as AthletePoolClient);
        const filtered = (athletes.data ?? [])
          .filter((athlete) => position === 'ALL' || (position === 'FLEX' && ['RB', 'WR', 'TE'].includes(athlete.position)) || athlete.position === position)
          .filter((athlete) => !q || `${athlete.display_name} ${athlete.position}`.toLowerCase().includes(q))
          .filter((athlete) => request.tool === 'searchPlayers' || !athleteOwner.has(athlete.id))
          .map((athlete) => ({ ...athlete, availability: athleteOwner.get(athlete.id) ? `Rostered by ${athleteOwner.get(athlete.id)}` : 'Available' }));
        return ok(request.tool, { query: request.query ?? '', position, players: filtered });
      }
      case 'getPlayerDetails':
      case 'getInjuryStatus': {
        if (!request.athleteId) return fail(request.tool, 'invalid_request', 'athleteId is required');
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const { athleteOwner } = await rosterOwnership(ctx, season.id);
        const athletes = await loadFantasyEligibleAthletesFrom(ctx.supabase as unknown as AthletePoolClient);
        const athlete = (athletes.data ?? []).find((item) => item.id === request.athleteId);
        if (!athlete) return fail(request.tool, 'not_found', 'Player not found in fantasy-eligible athlete pool');
        return ok(request.tool, { athlete, availability: athleteOwner.get(athlete.id) ? `Rostered by ${athleteOwner.get(athlete.id)}` : 'Available', injuryStatus: athlete.injury_status ?? null });
      }
      case 'comparePlayers': {
        const ids = request.athleteIds ?? [];
        if (ids.length < 2) return fail(request.tool, 'invalid_request', 'At least two athleteIds are required');
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const { athleteOwner } = await rosterOwnership(ctx, season.id);
        const athletes = await loadFantasyEligibleAthletesFrom(ctx.supabase as unknown as AthletePoolClient);
        const players = ids.map((id) => {
          const athlete = (athletes.data ?? []).find((item) => item.id === id);
          return athlete ? { ...athlete, availability: athleteOwner.get(athlete.id) ? `Rostered by ${athleteOwner.get(athlete.id)}` : 'Available' } : { id, error: 'Player not found' };
        });
        return ok(request.tool, { players });
      }
      case 'getWaiverState': {
        const { season, seasonFranchise } = await resolveOwnedSeasonFranchise(ctx, request.leagueId, request.franchiseId);
        const holds = await many<WaiverHoldRow>(ctx.supabase.from('waiver_holds').select('id,athlete_id,real_team_id,source_season_franchise_id,starts_at,clears_at,status,athletes(display_name,position,real_teams(abbreviation)),real_teams(display_name,abbreviation)').eq('league_season_id', season.id).eq('status', 'open').order('clears_at', { ascending: true }));
        const holdIds = holds.map((hold) => hold.id);
        const claims = holdIds.length ? await many<WaiverClaimRow>(ctx.supabase.from('waiver_claims').select('id,waiver_hold_id,status,drop_roster_entry_id,created_at,failure_reason').eq('season_franchise_id', seasonFranchise.id).in('waiver_hold_id', holdIds)) : [];
        return ok(request.tool, { holds, requesterClaims: claims });
      }
      case 'getWaiverRules': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        return ok(request.tool, { leagueSeasonId: season.id, priorityModel: 'Inverse standings at processing', faabEnabled: false, source: 'Verified current app UI and no active FAAB implementation in code/migrations' });
      }
      case 'getDraftState': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const draft = await one<DraftRow>(ctx.supabase.from('drafts').select('id,status,rounds,pick_seconds,current_pick,current_pick_deadline_at,league_season_id').eq('league_season_id', season.id).maybeSingle());
        if (!draft) return fail(request.tool, 'not_found', 'Draft not found for current league season');
        const picks = await many<DraftPickRow>(ctx.supabase.from('draft_picks').select('id,pick_number,round_number,round_pick,season_franchise_id,athlete_id,real_team_id,picked_at').eq('draft_id', draft.id).order('pick_number').limit(250));
        return ok(request.tool, { draft, picks });
      }
      case 'getDraftAvailablePlayers': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const draft = await one<DraftRow>(ctx.supabase.from('drafts').select('id,status,league_season_id').eq('id', request.draftId ?? '').maybeSingle());
        if (!draft || draft.league_season_id !== season.id) return fail(request.tool, 'not_found', 'Draft not found for current league season');
        const competitionSeason = await one<{ competition_id?: string | null }>(ctx.supabase.from('competition_seasons').select('competition_id').eq('id', season.competition_season_id ?? '').maybeSingle());
        const [athletes, realTeams, picks, draftValues, athleteScores, defenseScores] = await Promise.all([
          loadFantasyEligibleAthletesFrom(ctx.supabase as unknown as AthletePoolClient),
          many<{ id: string; display_name?: string; abbreviation?: string }>(ctx.supabase.from('real_teams').select('id,display_name,abbreviation').eq('competition_id', competitionSeason?.competition_id ?? '').order('abbreviation').limit(64)),
          many<DraftPickRow>(ctx.supabase.from('draft_picks').select('athlete_id,real_team_id,pick_number,round_number,round_pick,season_franchise_id').eq('draft_id', draft.id).order('pick_number').limit(250)),
          many<DraftHistoricalValue>(ctx.supabase.from('draft_historical_values').select('athlete_id,real_team_id,points,imported_at,season_year').eq('competition_id', competitionSeason?.competition_id ?? '').order('season_year', { ascending: false }).limit(10000)),
          many<ScoreWithSeason>(ctx.supabase.from('fantasy_player_scores').select('athlete_id,points,calculated_at,league_seasons(competition_seasons(season_year))').order('calculated_at', { ascending: false }).limit(5000)),
          many<ScoreWithSeason>(ctx.supabase.from('fantasy_team_scores').select('real_team_id,points,calculated_at,league_seasons(competition_seasons(season_year))').order('calculated_at', { ascending: false }).limit(5000))
        ]);
        const hasHistoricalValues = draftValues.length > 0;
        const draftedAthleteIds = new Set(picks.map((pick) => pick.athlete_id).filter(Boolean));
        const draftedTeamIds = new Set(picks.map((pick) => pick.real_team_id).filter(Boolean));
        const rankings = buildDraftRankings(
          (athletes.data ?? []).filter((athlete) => !draftedAthleteIds.has(athlete.id)).map((athlete) => ({ id: athlete.id, displayName: athlete.display_name, position: athlete.position, team: first(athlete.real_teams)?.abbreviation ?? 'FA' })),
          realTeams.filter((team) => !draftedTeamIds.has(team.id)).map((team) => ({ id: team.id, displayName: team.display_name ?? team.abbreviation ?? 'Defense', team: team.abbreviation ?? team.display_name ?? 'D/ST' })),
          hasHistoricalValues
            ? draftValues.filter(score => score.athlete_id).map((score) => ({ assetId: score.athlete_id ?? null, points: score.points, calculated_at: score.imported_at, seasonYear: score.season_year }))
            : athleteScores.map((score) => ({ assetId: score.athlete_id ?? null, points: score.points, calculated_at: score.calculated_at, seasonYear: scoreSeasonYear(score) })),
          hasHistoricalValues
            ? draftValues.filter(score => score.real_team_id).map((score) => ({ assetId: score.real_team_id ?? null, points: score.points, calculated_at: score.imported_at, seasonYear: score.season_year }))
            : defenseScores.map((score) => ({ assetId: score.real_team_id ?? null, points: score.points, calculated_at: score.calculated_at, seasonYear: scoreSeasonYear(score) }))
        );
        return ok(request.tool, { draftId: draft.id, rankings });
      }
      case 'getDraftQueue': {
        const { seasonFranchise } = await resolveOwnedSeasonFranchise(ctx, request.leagueId, request.franchiseId);
        if (!request.draftId) return fail(request.tool, 'invalid_request', 'draftId is required');
        const queue = await many<DraftQueueRow>(ctx.supabase.from('draft_queues').select('id,queue_rank,athlete_id,real_team_id').eq('draft_id', request.draftId).eq('season_franchise_id', seasonFranchise.id).order('queue_rank'));
        return ok(request.tool, { seasonFranchiseId: seasonFranchise.id, queue });
      }
      case 'getTradeContext': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        let tradeQuery = ctx.supabase.from('trades').select('id,league_season_id,proposed_by_franchise_id,proposed_to_franchise_id,status,created_at,resolved_at').eq('league_season_id', season.id).order('created_at', { ascending: false }).limit(25);
        if (request.tradeId) tradeQuery = tradeQuery.eq('id', request.tradeId);
        const trades = await many<TradeRow>(tradeQuery);
        const tradeIds = trades.map((trade) => trade.id);
        const items = tradeIds.length ? await many(ctx.supabase.from('trade_items').select('id,trade_id,from_season_franchise_id,to_season_franchise_id,athlete_id,real_team_id').in('trade_id', tradeIds)) : [];
        return ok(request.tool, { leagueSeasonId: season.id, trades, items });
      }
      case 'getInvitationState': {
        const { member } = await requireLeagueMember(ctx, request.leagueId);
        if (member.role !== 'commissioner') return fail(request.tool, 'unauthorized', 'Only commissioners can read league invitation state.');
        const invites = await many<LeagueInviteRow>(ctx.supabase.from('league_invites').select('id,email,status,expires_at,created_at').eq('league_id', request.leagueId).order('created_at', { ascending: false }).limit(50));
        return ok(request.tool, { invites });
      }
      case 'getHistory': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const [championships, weeklyAwards, storyEvents] = await Promise.all([
          many(ctx.supabase.from('championships').select('id,league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,awarded_at').eq('league_season_id', season.id).order('awarded_at', { ascending: false }).limit(10)),
          many(ctx.supabase.from('weekly_awards').select('id,league_season_id,week,code,title,winner_season_franchise_id,created_at').eq('league_season_id', season.id).order('created_at', { ascending: false }).limit(25)),
          many(ctx.supabase.from('story_events').select('id,league_id,league_season_id,event_type,facts,created_at').eq('league_id', request.leagueId).order('created_at', { ascending: false }).limit(25))
        ]);
        return ok(request.tool, { leagueSeasonId: season.id, championships, weeklyAwards, storyEvents });
      }
      case 'getEntitlement': {
        await requireLeagueMember(ctx, request.leagueId);
        const season = await currentSeason(ctx, request.leagueId);
        const entitlement = await one<EntitlementRow>(ctx.supabase.from('league_season_entitlements').select('id,league_season_id,product_code,status,activated_at,expires_at').eq('league_season_id', season.id).eq('product_code', 'big_exec_executive_league_season_pass').order('created_at', { ascending: false }).limit(1).maybeSingle());
        return ok(request.tool, { leagueSeasonId: season.id, mode: entitlement?.status === 'active' ? 'pro_plus' : 'standard', entitlement: entitlement ?? null });
      }
      default:
        return fail(request.tool, 'invalid_request', 'Unknown Assistant GM tool');
    }
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: 'unauthorized' | 'not_found' }).code : undefined;
    return fail(request.tool, code ?? 'data_error', error instanceof Error ? error.message : 'Assistant GM tool failed');
  }
}
