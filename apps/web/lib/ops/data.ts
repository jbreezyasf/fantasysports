import 'server-only';
import { createAdminClient } from '../supabase/admin';
import { staleStatus } from './health';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type Profile = { user_id: string; display_name: string | null; avatar_key?: string | null };
type League = { id: string; name: string; created_at: string | null; max_franchises: number | null; draft_min_franchises: number | null };
type Franchise = { id: string; league_id: string; name: string; abbreviation: string | null; established_year: number | null };
type LeagueMember = { id?: string; league_id: string; user_id: string; role: string | null };
type SeasonFranchise = { id: string; league_season_id: string; franchise_id: string; roster_locked_at?: string | null; roster_lock_reason?: string | null; draft_position?: number | null };
type Standing = { season_franchise_id: string; wins: number | null; losses: number | null; ties: number | null; points_for: number | null; points_against: number | null };

export type OpsSearchResult = {
  type: 'user' | 'league' | 'franchise';
  id: string;
  label: string;
  href: string;
  context: string;
};

function ilikeTerm(q: string) {
  return `%${q.replaceAll('%', '').replaceAll('_', '').trim()}%`;
}

async function tableCount(admin: SupabaseAdmin, table: string) {
  const { count: total } = await admin.from(table).select('*', { count: 'exact', head: true });
  return total ?? 0;
}

export async function loadOpsDashboard(query: string) {
  const admin = createAdminClient();
  const term = query.trim();
  const [
    authUsers,
    profileCount,
    leagueCount,
    franchiseCount,
    pendingWaivers,
    openWaivers,
    tradeCount,
    latestAthlete,
    latestStats,
    latestGame
  ] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
    tableCount(admin, 'user_profiles'),
    tableCount(admin, 'fantasy_leagues'),
    tableCount(admin, 'franchises'),
    admin.from('waiver_claims').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('waiver_holds').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    tableCount(admin, 'trades'),
    admin.from('athletes').select('updated_at', { count: 'exact' }).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('athlete_game_stats').select('updated_at,created_at', { count: 'exact' }).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('real_games').select('starts_at,status,updated_at', { count: 'exact' }).order('starts_at', { ascending: false }).limit(1).maybeSingle()
  ]);

  const results: OpsSearchResult[] = [];
  if (term.length >= 2) {
    const [profiles, leagues, franchises] = await Promise.all([
      admin.from('user_profiles').select('user_id,display_name,avatar_key').ilike('display_name', ilikeTerm(term)).limit(8),
      admin.from('fantasy_leagues').select('id,name,created_at,max_franchises,draft_min_franchises').ilike('name', ilikeTerm(term)).limit(8),
      admin.from('franchises').select('id,league_id,name,abbreviation,established_year').or(`name.ilike.${ilikeTerm(term)},abbreviation.ilike.${ilikeTerm(term)}`).limit(8)
    ]);

    const authMatches = (authUsers.data.users ?? [])
      .filter(user => `${user.email ?? ''} ${user.user_metadata?.display_name ?? ''}`.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 8)
      .map(user => ({
        type: 'user' as const,
        id: user.id,
        label: user.email ?? user.user_metadata?.display_name ?? 'User',
        href: `/ops/users/${user.id}`,
        context: `Auth account${user.last_sign_in_at ? `, last sign-in ${new Date(user.last_sign_in_at).toLocaleDateString()}` : ''}`
      }));

    results.push(...authMatches);
    results.push(...(profiles.data ?? []).map((profile: Profile) => ({
      type: 'user' as const,
      id: profile.user_id,
      label: profile.display_name ?? 'Manager profile',
      href: `/ops/users/${profile.user_id}`,
      context: 'Manager profile'
    })));
    results.push(...(leagues.data ?? []).map((league: League) => ({
      type: 'league' as const,
      id: league.id,
      label: league.name,
      href: `/ops/leagues/${league.id}`,
      context: `${league.max_franchises ?? 10} max franchises`
    })));
    results.push(...(franchises.data ?? []).map((franchise: Franchise) => ({
      type: 'franchise' as const,
      id: franchise.id,
      label: franchise.name,
      href: `/ops/leagues/${franchise.league_id}`,
      context: `${franchise.abbreviation ?? 'No abbreviation'} franchise`
    })));
  }

  return {
    query: term,
    results,
    counts: {
      authUsers: authUsers.data.users.length,
      profiles: profileCount,
      leagues: leagueCount,
      franchises: franchiseCount,
      pendingWaivers: pendingWaivers.count ?? 0,
      openWaivers: openWaivers.count ?? 0,
      trades: tradeCount,
      athletes: latestAthlete.count ?? 0,
      athleteStats: latestStats.count ?? 0,
      realGames: latestGame.count ?? 0
    },
    health: {
      athletes: { updatedAt: latestAthlete.data?.updated_at ?? null, status: staleStatus(latestAthlete.data?.updated_at, 24, 72) },
      stats: { updatedAt: latestStats.data?.updated_at ?? latestStats.data?.created_at ?? null, status: staleStatus(latestStats.data?.updated_at ?? latestStats.data?.created_at, 3, 24) },
      games: { updatedAt: latestGame.data?.updated_at ?? latestGame.data?.starts_at ?? null, status: staleStatus(latestGame.data?.updated_at ?? latestGame.data?.starts_at, 24, 72), latestStatus: latestGame.data?.status ?? null }
    }
  };
}

export async function loadOpsUser(userId: string) {
  const admin = createAdminClient();
  const [{ data: authUser }, profile, ownerships, memberships, events] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('user_profiles').select('user_id,display_name,avatar_key').eq('user_id', userId).maybeSingle(),
    admin.from('franchise_owners').select('franchise_id,starts_on,ends_on').eq('user_id', userId).order('starts_on', { ascending: false }),
    admin.from('league_members').select('league_id,role').eq('user_id', userId),
    admin.from('league_feed_events').select('id,league_id,event_type,body,created_at').eq('actor_user_id', userId).order('created_at', { ascending: false }).limit(12)
  ]);
  const leagueIds = Array.from(new Set((memberships.data ?? []).map(row => row.league_id)));
  const franchiseIds = Array.from(new Set((ownerships.data ?? []).map(row => row.franchise_id)));
  const [franchises, leagues] = await Promise.all([
    franchiseIds.length ? admin.from('franchises').select('id,name,abbreviation,league_id').in('id', franchiseIds) : Promise.resolve({ data: [] }),
    leagueIds.length ? admin.from('fantasy_leagues').select('id,name').in('id', leagueIds) : Promise.resolve({ data: [] })
  ]);

  return {
    authUser: authUser.user,
    profile: profile.data as Profile | null,
    ownerships: ownerships.data ?? [],
    memberships: memberships.data ?? [],
    franchises: franchises.data ?? [],
    leagues: leagues.data ?? [],
    events: events.data ?? []
  };
}

export async function loadOpsLeague(leagueId: string) {
  const admin = createAdminClient();
  const [league, seasons, members, franchises] = await Promise.all([
    admin.from('fantasy_leagues').select('id,name,created_at,max_franchises,draft_min_franchises').eq('id', leagueId).maybeSingle(),
    admin.from('league_seasons').select('id,status,is_current,trade_deadline_at,roster_config,created_at').eq('league_id', leagueId).order('created_at', { ascending: false }),
    admin.from('league_members').select('league_id,user_id,role').eq('league_id', leagueId),
    admin.from('franchises').select('id,league_id,name,abbreviation,established_year').eq('league_id', leagueId).order('created_at')
  ]);
  if (!league.data) return null;

  const currentSeason = (seasons.data ?? []).find(season => season.is_current) ?? seasons.data?.[0] ?? null;
  const seasonId = currentSeason?.id;
  const [seasonFranchises, standings, drafts, matchups, waiverClaims, waiverHolds, trades, events] = seasonId ? await Promise.all([
    admin.from('season_franchises').select('id,league_season_id,franchise_id,draft_position,roster_locked_at,roster_lock_reason').eq('league_season_id', seasonId),
    admin.from('standings').select('season_franchise_id,wins,losses,ties,points_for,points_against').eq('league_season_id', seasonId).order('wins', { ascending: false }).order('points_for', { ascending: false }),
    admin.from('drafts').select('id,status,current_pick,starts_at,pick_seconds').eq('league_season_id', seasonId),
    admin.from('matchups').select('id,week,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final,event_type').eq('league_season_id', seasonId).order('week'),
    admin.from('waiver_claims').select('id,status,season_franchise_id,created_at,processed_at,failure_reason').eq('league_season_id', seasonId).order('created_at', { ascending: false }).limit(50),
    admin.from('waiver_holds').select('id,status,clears_at,source_season_franchise_id').eq('league_season_id', seasonId).order('clears_at', { ascending: true }).limit(50),
    admin.from('trades').select('id,status,created_at,proposed_by_franchise_id,proposed_to_franchise_id').eq('league_season_id', seasonId).order('created_at', { ascending: false }).limit(50),
    admin.from('league_feed_events').select('id,event_type,body,created_at,actor_user_id').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(20)
  ]) : [];

  let activeRosterEntries: { id: string; season_franchise_id: string; athlete_id: string | null; real_team_id: string | null; dropped_at: string | null }[] = [];
  let currentLineups: unknown[] = [];
  const sfs = (seasonFranchises?.data ?? []) as SeasonFranchise[];
  if (sfs.length) {
    const [roster, lineups] = await Promise.all([
      admin.from('roster_entries').select('id,season_franchise_id,athlete_id,real_team_id,dropped_at').in('season_franchise_id', sfs.map(sf => sf.id)).is('dropped_at', null),
      admin.from('lineups').select('id,season_franchise_id,week,slot,slot_index,athlete_id,real_team_id,locked_at').in('season_franchise_id', sfs.map(sf => sf.id)).limit(500)
    ]);
    activeRosterEntries = roster.data ?? [];
    currentLineups = lineups.data ?? [];
  }

  return {
    league: league.data as League,
    seasons: seasons.data ?? [],
    currentSeason,
    members: (members.data ?? []) as LeagueMember[],
    franchises: (franchises.data ?? []) as Franchise[],
    seasonFranchises: sfs,
    standings: (standings?.data ?? []) as Standing[],
    drafts: drafts?.data ?? [],
    matchups: matchups?.data ?? [],
    rosterEntries: activeRosterEntries,
    lineups: currentLineups,
    waiverClaims: waiverClaims?.data ?? [],
    waiverHolds: waiverHolds?.data ?? [],
    trades: trades?.data ?? [],
    events: events?.data ?? []
  };
}

export async function loadOpsDataHealth() {
  const admin = createAdminClient();
  const dashboard = await loadOpsDashboard('');
  const [providers, teams, games, stats] = await Promise.all([
    admin.from('athlete_provider_ids').select('provider', { count: 'exact' }).limit(1000),
    admin.from('real_teams').select('id', { count: 'exact', head: true }),
    admin.from('real_games').select('status,starts_at,updated_at').order('starts_at', { ascending: false }).limit(16),
    admin.from('athlete_game_stats').select('updated_at,created_at').order('updated_at', { ascending: false }).limit(16)
  ]);
  const providerCounts = new Map<string, number>();
  for (const row of providers.data ?? []) providerCounts.set(row.provider ?? 'unknown', (providerCounts.get(row.provider ?? 'unknown') ?? 0) + 1);
  return { ...dashboard, providerCounts, teams: teams.count ?? 0, recentGames: games.data ?? [], recentStats: stats.data ?? [] };
}

export async function loadOpsAudit() {
  const admin = createAdminClient();
  const { data, error } = await admin.from('ops_audit_events').select('id,actor_user_id,action,target_type,target_id,metadata,created_at').order('created_at', { ascending: false }).limit(100);
  return { events: data ?? [], error: error?.message ?? null };
}
