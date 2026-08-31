import 'server-only';
import { loadFantasyEligibleAthletes } from '../fantasy/athletePool';
import { buildDraftRankings } from '../fantasy/draftRankings';
import { createClient } from '../supabase/server';
import {
  buildAssistantGMDecisionContext,
  type AssistantGMAvailableAsset,
  type AssistantGMLineupSlot,
  type AssistantGMRosterAsset,
} from './decisionEngine';

type Relation<T> = T | T[] | null;
type AthleteRelation = { display_name?: string; position?: string; real_teams?: Relation<{ abbreviation?: string }> };
type TeamRelation = { display_name?: string; abbreviation?: string };
type FranchiseRelation = { name?: string; abbreviation?: string };

function first<T>(value: Relation<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizePosition(value?: string | null) {
  const position = (value ?? '').toUpperCase();
  return position === 'DST' || position === 'DEF' ? 'D/ST' : position;
}

export type AssistantGMLoadedContext = {
  userId: string;
  leagueId: string;
  leagueName: string;
  franchiseId: string;
  franchiseName: string;
  seasonFranchiseId: string;
  week: number;
  roster: AssistantGMRosterAsset[];
  leagueRosters: Array<{ franchiseName: string; assets: Array<{ name: string; position: string; team?: string | null }> }>;
  decision: ReturnType<typeof buildAssistantGMDecisionContext>;
  rankingSource: string;
  rankingVersion: string;
  dataLimitations: string[];
};

export type AssistantGMLoadResult =
  | { ok: true; context: AssistantGMLoadedContext }
  | { ok: false; reason: 'unauthenticated' | 'not_member' | 'no_current_season' | 'no_franchise' | 'load_failed'; message: string };

export async function loadAssistantGMContext(leagueId: string): Promise<AssistantGMLoadResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthenticated', message: 'Sign in to use your Assistant GM.' };

  const [{ data: league }, { data: member }, { data: season }, { data: ownerships }] = await Promise.all([
    supabase.from('fantasy_leagues').select('id,name').eq('id', leagueId).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle(),
    supabase.from('league_seasons').select('id,competition_season_id,roster_config').eq('league_id', leagueId).eq('is_current', true).maybeSingle(),
    supabase.from('franchise_owners').select('franchise_id').eq('user_id', user.id).is('ends_on', null),
  ]);

  if (!league || !member) return { ok: false, reason: 'not_member', message: 'That Assistant GM office belongs to another league.' };
  if (!season) return { ok: false, reason: 'no_current_season', message: 'This league does not have a current season yet.' };

  const [{ data: competitionSeason }, { data: seasonFranchises }, { data: latestMatchup }] = await Promise.all([
    supabase.from('competition_seasons').select('competition_id').eq('id', season.competition_season_id).maybeSingle(),
    supabase.from('season_franchises').select('id,franchise_id,franchises(name,abbreviation)').eq('league_season_id', season.id),
    supabase.from('matchups').select('week').eq('league_season_id', season.id).order('week', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const ownedFranchiseIds = new Set((ownerships ?? []).map(item => item.franchise_id));
  const mySeasonFranchise = (seasonFranchises ?? []).find(item => ownedFranchiseIds.has(item.franchise_id));
  if (!mySeasonFranchise) return { ok: false, reason: 'no_franchise', message: 'You need an owned franchise in this league before the Assistant GM can advise you.' };

  const week = Math.max(1, Math.min(18, Number(latestMatchup?.week ?? 1)));
  const seasonFranchiseIds = (seasonFranchises ?? []).map(item => item.id);

  const rosterPromise = seasonFranchiseIds.length
    ? supabase
        .from('roster_entries')
        .select('id,season_franchise_id,athlete_id,real_team_id,athletes(display_name,position,real_teams(abbreviation)),real_teams(display_name,abbreviation)')
        .in('season_franchise_id', seasonFranchiseIds)
        .is('dropped_at', null)
    : Promise.resolve({ data: [], error: null });

  const [{ data: rosterRows, error: rosterError }, { data: athletes, error: athleteError }, { data: realTeams, error: teamError }, { data: athleteScores }, { data: defenseScores }, { data: lineupRows }] = await Promise.all([
    rosterPromise,
    loadFantasyEligibleAthletes(supabase),
    competitionSeason?.competition_id
      ? supabase.from('real_teams').select('id,display_name,abbreviation').eq('competition_id', competitionSeason.competition_id).order('abbreviation').limit(64)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('fantasy_player_scores').select('athlete_id,points,calculated_at').order('calculated_at', { ascending: false }).limit(5000),
    supabase.from('fantasy_team_scores').select('real_team_id,points,calculated_at').order('calculated_at', { ascending: false }).limit(5000),
    supabase.from('lineups').select('slot,slot_index,athlete_id,real_team_id').eq('season_franchise_id', mySeasonFranchise.id).eq('week', week),
  ]);

  const loadError = rosterError?.message || athleteError?.message || teamError?.message;
  if (loadError) return { ok: false, reason: 'load_failed', message: `Assistant GM could not load current league truth: ${loadError}` };

  const rankedAll = buildDraftRankings(
    (athletes ?? []).map(athlete => {
      const team = first(athlete.real_teams as Relation<{ abbreviation?: string }>);
      return { id: athlete.id, displayName: athlete.display_name, position: athlete.position, team: team?.abbreviation ?? 'FA' };
    }),
    (realTeams ?? []).map(team => ({ id: team.id, displayName: team.display_name ?? team.abbreviation ?? 'Defense', team: team.abbreviation ?? team.display_name ?? 'D/ST' })),
    (athleteScores ?? []).map(score => ({ assetId: score.athlete_id, points: score.points, calculated_at: score.calculated_at })),
    (defenseScores ?? []).map(score => ({ assetId: score.real_team_id, points: score.points, calculated_at: score.calculated_at })),
  );

  const rankedAthleteById = new Map(rankedAll.athletes.map(asset => [asset.id, asset]));
  const rankedDefenseById = new Map(rankedAll.defenses.map(asset => [asset.id, asset]));
  const ownedAthleteIds = new Set((rosterRows ?? []).map(row => row.athlete_id).filter((id): id is string => Boolean(id)));
  const ownedTeamIds = new Set((rosterRows ?? []).map(row => row.real_team_id).filter((id): id is string => Boolean(id)));

  const roster: AssistantGMRosterAsset[] = (rosterRows ?? [])
    .filter(row => row.season_franchise_id === mySeasonFranchise.id)
    .map(row => {
      if (row.athlete_id) {
        const athlete = first(row.athletes as Relation<AthleteRelation>);
        const ranked = rankedAthleteById.get(row.athlete_id);
        const team = first(athlete?.real_teams);
        return {
          id: row.athlete_id,
          name: athlete?.display_name ?? ranked?.displayName ?? 'Player',
          position: normalizePosition(athlete?.position ?? ranked?.position),
          team: team?.abbreviation ?? ranked?.team ?? 'FA',
          overallRank: ranked?.overallRank ?? null,
          positionRank: ranked?.positionRank ?? null,
          rankingScore: ranked?.rankingScore ?? null,
        };
      }
      const team = first(row.real_teams as Relation<TeamRelation>);
      const ranked = row.real_team_id ? rankedDefenseById.get(row.real_team_id) : null;
      return {
        id: row.real_team_id ?? row.id,
        name: `${team?.abbreviation ?? team?.display_name ?? ranked?.team ?? 'Team'} D/ST`,
        position: 'D/ST',
        team: team?.abbreviation ?? ranked?.team ?? null,
        overallRank: ranked?.overallRank ?? null,
        positionRank: ranked?.positionRank ?? null,
        rankingScore: ranked?.rankingScore ?? null,
      };
    });

  const available: AssistantGMAvailableAsset[] = [
    ...rankedAll.athletes
      .filter(asset => !ownedAthleteIds.has(asset.id))
      .map(asset => ({
        id: asset.id,
        name: asset.displayName,
        position: normalizePosition(asset.position),
        team: asset.team,
        overallRank: asset.overallRank,
        positionRank: asset.positionRank,
        rankingScore: asset.rankingScore,
        assetType: 'athlete' as const,
      })),
    ...rankedAll.defenses
      .filter(asset => !ownedTeamIds.has(asset.id))
      .map(asset => ({
        id: asset.id,
        name: `${asset.team} D/ST`,
        position: 'D/ST',
        team: asset.team,
        overallRank: asset.overallRank,
        positionRank: asset.positionRank,
        rankingScore: asset.rankingScore,
        assetType: 'defense' as const,
      })),
  ];

  const starters = ((season.roster_config as { starters?: Record<string, number> } | null)?.starters ?? {});
  const lineupSlots: AssistantGMLineupSlot[] = [];
  for (const [rawSlot, rawCount] of Object.entries(starters)) {
    const slot = rawSlot.toUpperCase();
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count <= 0) continue;
    for (let slotIndex = 1; slotIndex <= count; slotIndex += 1) {
      const filled = (lineupRows ?? []).some(row => row.slot.toUpperCase() === slot && row.slot_index === slotIndex && Boolean(row.athlete_id || row.real_team_id));
      lineupSlots.push({ slot: slot === 'DST' ? 'D/ST' : slot, slotIndex, filled });
    }
  }

  const franchiseBySeasonId = new Map((seasonFranchises ?? []).map(sf => [sf.id, first(sf.franchises as Relation<FranchiseRelation>)]));
  const leagueRosters = (seasonFranchises ?? []).map(sf => ({
    franchiseName: franchiseBySeasonId.get(sf.id)?.name ?? 'Franchise',
    assets: (rosterRows ?? []).filter(row => row.season_franchise_id === sf.id).map(row => {
      if (row.athlete_id) {
        const athlete = first(row.athletes as Relation<AthleteRelation>);
        const team = first(athlete?.real_teams);
        return { name: athlete?.display_name ?? 'Player', position: normalizePosition(athlete?.position), team: team?.abbreviation ?? null };
      }
      const team = first(row.real_teams as Relation<TeamRelation>);
      return { name: `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`, position: 'D/ST', team: team?.abbreviation ?? null };
    }),
  }));

  const franchise = franchiseBySeasonId.get(mySeasonFranchise.id);
  return {
    ok: true,
    context: {
      userId: user.id,
      leagueId,
      leagueName: league.name,
      franchiseId: mySeasonFranchise.franchise_id,
      franchiseName: franchise?.name ?? 'Your Franchise',
      seasonFranchiseId: mySeasonFranchise.id,
      week,
      roster,
      leagueRosters,
      decision: buildAssistantGMDecisionContext({
        roster,
        available,
        lineupSlots,
        rosterConfig: season.roster_config as { starters?: Record<string, number> } | null,
      }),
      rankingSource: rankedAll.source,
      rankingVersion: rankedAll.version,
      dataLimitations: [
        'MVP does not yet have licensed current projections, injury/practice feeds, player news, or matchup-grade external fantasy intelligence.',
        'Recommendations currently use Big Exec roster construction plus Big Exec internal ranking/score history only.',
      ],
    },
  };
}

export function buildDeterministicAssistantGMBrief(context: AssistantGMLoadedContext) {
  const needs = context.decision.positionNeeds.filter(item => item.deficit > 0);
  const top = context.decision.topTargets[0];
  const holes = context.decision.emptyLineupSlots;
  const parts = [`${context.franchiseName}: ${context.roster.length} roster assets.`];
  if (needs.length) parts.push(`Starter-depth needs: ${needs.map(item => `${item.position} (${item.current}/${item.target})`).join(', ')}.`);
  else parts.push('Your configured starter positions are covered on the roster.');
  if (holes.length) parts.push(`Week ${context.week} has ${holes.length} empty starter slot${holes.length === 1 ? '' : 's'}: ${holes.map(item => `${item.slot}${item.slotIndex > 1 ? item.slotIndex : ''}`).join(', ')}.`);
  if (top) parts.push(`First available target on my board: ${top.name} (${top.position}, ${top.team ?? 'FA'}) — ${top.reason}`);
  parts.push('I do not have the licensed projection/injury/news layer connected yet, so I will not fake those signals.');
  return parts.join(' ');
}
