#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { importSportradarFallback } from './sportradar-nfl-live-fallback.mjs';

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
}

const number = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const alias = value => ({ JAX: 'JAC', WAS: 'WSH', LA: 'LAR' }[String(value)] ?? String(value));
const state = value => ['scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'delayed', 'suspended'].includes(value) ? value : 'unknown';
export const cleanName = value => String(value ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');
const playerName = row => String(row?.player?.display_name ?? row?.player?.full_name ?? `${row?.player?.first_name ?? ''} ${row?.player?.last_name ?? ''}`).trim();
const playerPosition = row => String(row?.player?.position_abbreviation ?? row?.player?.position ?? '').toUpperCase();
const playerTeam = row => alias(row?.team?.abbreviation ?? row?.player?.team?.abbreviation ?? '');
export const liveIdentityKey = (name, position, team) => `${cleanName(name)}|${String(position).toUpperCase()}|${alias(team)}`;
export const liveNamePositionKey = (name, position) => `${cleanName(name)}|${String(position).toUpperCase()}`;

export function canonicalLivePlayerStats(row, fieldGoals = {}) {
  return {
    ...row,
    passing_tds: number(row.passing_touchdowns), passing_interceptions: number(row.passing_interceptions),
    rushing_tds: number(row.rushing_touchdowns), receiving_tds: number(row.receiving_touchdowns),
    rushing_fumbles_lost: number(row.fumbles_lost), receiving_fumbles_lost: 0, sack_fumbles_lost: 0,
    special_teams_tds: number(row.kick_return_touchdowns) + number(row.punt_return_touchdowns),
    fg_made_0_19: fieldGoals.fg_made_0_19 ?? 0, fg_made_20_29: fieldGoals.fg_made_20_29 ?? 0,
    fg_made_30_39: fieldGoals.fg_made_30_39 ?? 0, fg_made_40_49: fieldGoals.fg_made_40_49 ?? 0,
    fg_made_50_59: fieldGoals.fg_made_50_59 ?? 0, fg_made_60_: fieldGoals.fg_made_60_ ?? 0,
    pat_made: number(row.extra_points_made),
  };
}

export function canonicalWeeklyPlayerStats(row) {
  const stats = row?.stats ?? {};
  return {
    ...stats,
    passing_tds: number(stats.passing_touchdowns),
    passing_interceptions: number(stats.passing_interceptions),
    rushing_tds: number(stats.rushing_touchdowns),
    receiving_tds: number(stats.receiving_touchdowns),
    receptions: number(stats.receptions ?? stats.receiving_receptions),
    passing_2pt_conversions: number(stats.passing_two_point_conversions),
    rushing_2pt_conversions: number(stats.rushing_two_point_conversions),
    receiving_2pt_conversions: number(stats.receiving_two_point_conversions),
    rushing_fumbles_lost: number(stats.fumbles_lost),
    receiving_fumbles_lost: 0,
    sack_fumbles_lost: 0,
    special_teams_tds: number(stats.kick_return_touchdowns) + number(stats.punt_return_touchdowns),
    fg_made_0_19: number(stats.field_goals_made_0_to_39),
    fg_made_20_29: 0,
    fg_made_30_39: 0,
    fg_made_40_49: number(stats.field_goals_made_40_to_49),
    fg_made_50_59: number(stats.field_goals_made_50_to_59),
    fg_made_60_: number(stats.field_goals_made_60_plus),
    pat_made: number(stats.extra_points_made),
  };
}

export function canonicalLiveTeamStats(row) {
  const game = row.game ?? {};
  const isHome = String(row.team?.id) === String(game.home_team?.id);
  return {
    ...row,
    def_sacks: number(row.defensive_sacks), def_interceptions: number(row.defensive_interceptions),
    fumble_recovery_opp: number(row.defensive_fumbles_recovered ?? row.fumbles_recovered),
    def_tds: number(row.defensive_touchdowns), special_teams_tds: number(row.kick_return_touchdowns) + number(row.punt_return_touchdowns),
    def_safeties: number(row.defensive_safeties), def_punt_blocks: number(row.punts_blocked),
    def_pat_blocks: number(row.extra_points_blocked), def_fg_blocks: number(row.field_goals_blocked),
    points_allowed: number(isHome ? game.visitor_team_score : game.home_team_score),
  };
}

export function fieldGoalBuckets(plays) {
  const byPlayer = new Map();
  for (const play of plays) {
    if (!play.scoring_play || !/field goal/i.test(`${play.type_text ?? ''} ${play.short_text ?? ''} ${play.text ?? ''}`) || /no good|blocked/i.test(`${play.short_text ?? ''} ${play.text ?? ''}`)) continue;
    const kicker = play.participants?.find(participant => participant.type === 'kicker')?.player_id;
    const distance = number(/(\d+)\s*(?:yd|yard)/i.exec(`${play.short_text ?? ''} ${play.text ?? ''}`)?.[1] ?? play.stat_yardage);
    if (!kicker || !distance) continue;
    const key = distance < 20 ? 'fg_made_0_19' : distance < 30 ? 'fg_made_20_29' : distance < 40 ? 'fg_made_30_39' : distance < 50 ? 'fg_made_40_49' : distance < 60 ? 'fg_made_50_59' : 'fg_made_60_';
    const buckets = byPlayer.get(String(kicker)) ?? {};
    buckets[key] = number(buckets[key]) + 1;
    byPlayer.set(String(kicker), buckets);
  }
  return byPlayer;
}

export async function runLiveStatsImport() {
  const apiKey = process.env.BALLDONTLIE_API_KEY || process.env.balldontlie || process.env.SPORTS_DATA_API_KEY;
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://njjiqdqhmcbxblwhfade.supabase.co';
  const dbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [!apiKey && 'BALLDONTLIE_API_KEY', !dbKey && 'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
  if (missing.length) throw new Error(`Missing production runtime binding: ${missing.join(', ')}`);
  const db = createClient(dbUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const baseUrl = (process.env.BALLDONTLIE_BASE_URL || 'https://api.balldontlie.io').replace(/\/$/, '');
  let requests = 0;
  async function page(path, params = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : [value]) if (item != null) url.searchParams.append(Array.isArray(value) ? `${key}[]` : key, String(item));
    const response = await fetch(url, { headers: { Authorization: apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) }); requests += 1;
    if (!response.ok) throw new Error(`balldontlie ${response.status} for ${path}`);
    return response.json();
  }
  async function all(path, params = {}) { const rows = []; let cursor; do { const payload = await page(path, { ...params, cursor, per_page: 100 }); rows.push(...(payload.data ?? [])); cursor = payload.meta?.next_cursor; } while (cursor); return rows; }

  const now = new Date(); const season = now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const { data: competition, error: competitionError } = await db.from('competitions').select('id').eq('code', 'pro_football').single();
  if (competitionError) throw new Error(competitionError.message);
  const { data: competitionSeason, error: seasonError } = await db.from('competition_seasons').select('id').eq('competition_id', competition.id).eq('season_year', season).single();
  if (seasonError) throw new Error(seasonError.message);
  const lower = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(); const upper = new Date(now.getTime() + 20 * 60 * 1000).toISOString();
  const { data: candidates, error: candidatesError } = await db.from('real_games').select('id,provider_game_id,week').eq('competition_season_id', competitionSeason.id).gte('starts_at', lower).lte('starts_at', upper);
  if (candidatesError) throw new Error(candidatesError.message);
  if (!candidates?.length) return { season, skipped: true, reason: 'no games in active window', requests: 0 };
  const providerIds = candidates.map(game => String(game.provider_game_id).replace(/^balldontlie:/, ''));
  const games = await all('/nfl/v1/games', { seasons: [season], weeks: [...new Set(candidates.map(game => game.week))], season_types: [2] });
  const activeGames = games.filter(game => providerIds.includes(String(game.id)));
  if (!activeGames.length) return { season, skipped: true, reason: 'no provider games in active window', requests };
  const activeIds = activeGames.map(game => String(game.id));
  const weeks = [...new Set(activeGames.map(game => Number(candidates.find(candidate => String(candidate.provider_game_id).replace(/^balldontlie:/, '') === String(game.id))?.week)).filter(Number.isFinite))];
  const [players, teamRows, playGroups, weeklyGroups] = await Promise.all([
    all('/nfl/v1/stats', { game_ids: activeIds }), all('/nfl/v1/team_stats', { game_ids: activeIds }),
    Promise.all(activeGames.filter(game => game.status_state === 'in_progress').map(game => all('/nfl/v1/plays', { game_id: game.id }))),
    Promise.all(weeks.map(week => all('/nfl/v1/fantasy/weekly_stats', { season, week, scoring_format: 'half_ppr' }))),
  ]);
  const kicks = fieldGoalBuckets(playGroups.flat());
  const weeklyPlayers = weeklyGroups.flat().filter(row => row.player && activeIds.includes(String(row.game?.id)));
  const weeklyKeys = new Set(weeklyPlayers.map(row => `${row.player.id}|${row.game?.id}`));
  const scoringPlayers = [
    ...weeklyPlayers.map(row => ({ ...row, _weekly: true })),
    ...players.filter(row => !weeklyKeys.has(`${row.player?.id}|${row.game?.id}`)),
  ];
  const [{ data: links }, { data: teams }, { data: athletes }] = await Promise.all([
    db.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider', 'balldontlie').range(0, 10000),
    db.from('real_teams').select('id,abbreviation').eq('competition_id', competition.id),
    db.from('athletes').select('id,display_name,position,real_teams(abbreviation)').eq('competition_id', competition.id).eq('active', true).range(0, 10000),
  ]);
  const athleteByProvider = new Map((links ?? []).map(row => [String(row.provider_athlete_id), row.athlete_id]));
  const teamByAlias = new Map((teams ?? []).map(row => [alias(row.abbreviation), row.id]));
  const athletesByIdentity = new Map();
  const athletesByNamePosition = new Map();
  for (const athlete of athletes ?? []) {
    const team = Array.isArray(athlete.real_teams) ? athlete.real_teams[0] : athlete.real_teams;
    const key = liveIdentityKey(athlete.display_name, athlete.position, team?.abbreviation);
    athletesByIdentity.set(key, [...(athletesByIdentity.get(key) ?? []), athlete.id]);
    const namePositionKey = liveNamePositionKey(athlete.display_name, athlete.position);
    athletesByNamePosition.set(namePositionKey, [...(athletesByNamePosition.get(namePositionKey) ?? []), athlete.id]);
  }
  const gameByProvider = new Map(candidates.map(row => [String(row.provider_game_id).replace(/^balldontlie:/, ''), row.id]));
  const ingestedAt = new Date().toISOString();
  const playerStats = scoringPlayers.flatMap(row => { const mapped = athleteByProvider.get(String(row.player?.id)); const exactMatches = athletesByIdentity.get(liveIdentityKey(playerName(row), playerPosition(row), playerTeam(row))) ?? []; const crossTeamMatches = athletesByNamePosition.get(liveNamePositionKey(playerName(row), playerPosition(row))) ?? []; const safeCrossTeamMatch = crossTeamMatches.length === 1 ? crossTeamMatches : []; const athleteIds = [...new Set([mapped, ...exactMatches, ...safeCrossTeamMatch].filter(Boolean))]; const gameId = gameByProvider.get(String(row.game?.id)); const rawStats = row._weekly ? canonicalWeeklyPlayerStats(row) : canonicalLivePlayerStats(row, kicks.get(String(row.player.id))); return gameId ? athleteIds.map(athleteId => ({ athlete_id: athleteId, game_id: gameId, raw_stats: rawStats, source_provider: 'balldontlie', source_updated_at: row.collected_at ?? row.game?.updated_at ?? null, ingested_at: ingestedAt })) : []; });
  const teamStats = teamRows.flatMap(row => { const teamId = teamByAlias.get(String(row.team?.abbreviation)); const gameId = gameByProvider.get(String(row.game?.id)); return teamId && gameId ? [{ real_team_id: teamId, game_id: gameId, raw_stats: canonicalLiveTeamStats(row), source_provider: 'balldontlie', source_updated_at: row.game?.updated_at ?? null, ingested_at: ingestedAt }] : []; });
  for (const [table, values, conflict] of [['athlete_game_stats', playerStats, 'athlete_id,game_id,source_provider'], ['real_team_game_stats', teamStats, 'real_team_id,game_id,source_provider']]) if (values.length) { const { error } = await db.from(table).upsert(values, { onConflict: conflict }); if (error) throw new Error(error.message); }
  let sportradarFallback;
  try {
    sportradarFallback = await importSportradarFallback({ db, season, week: weeks[0], activeGames, gameByProvider, ingestedAt });
  } catch (error) {
    sportradarFallback = { enabled: true, games: 0, playerStats: 0, requests: 0, error: error instanceof Error ? error.message : String(error) };
    console.error(JSON.stringify({ job: 'live-scoring', provider: 'sportradar-fallback', ...sportradarFallback }));
  }
  for (const game of activeGames) { const { error } = await db.from('real_games').update({ state: state(game.status_state), home_score: game.home_team_score, away_score: game.visitor_team_score, updated_at: ingestedAt }).eq('id', gameByProvider.get(String(game.id))); if (error) throw new Error(error.message); }
  const { data: leagueSeasons, error: leagueSeasonsError } = await db.from('league_seasons').select('id').eq('competition_season_id', competitionSeason.id);
  if (leagueSeasonsError) throw new Error(leagueSeasonsError.message);
  for (const week of weeks) for (const leagueSeason of leagueSeasons ?? []) { const { error } = await db.rpc('calculate_pro_football_week_scores', { p_league_season_id: leagueSeason.id, p_week: week }); if (error) throw new Error(error.message); const { data: matchups, error: matchupsError } = await db.from('matchups').select('id').eq('league_season_id', leagueSeason.id).eq('week', week).eq('is_final', false); if (matchupsError) throw new Error(matchupsError.message); for (const matchup of matchups ?? []) { const { error: matchupError } = await db.rpc('recompute_matchup', { p_matchup_id: matchup.id, p_finalize: false }); if (matchupError) throw new Error(matchupError.message); } }
  const report = { season, weeks, games: activeGames.length, playerStats: playerStats.length, weeklyPlayerStats: weeklyPlayers.length, rawPlayerStats: players.length, teamStats: teamStats.length, requests, sportradarFallback, ingestedAt }; console.log(JSON.stringify(report)); return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runLiveStatsImport().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
