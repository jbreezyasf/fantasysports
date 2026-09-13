#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
}
export async function runWeeklyStatsImport() {
const args = new Map(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=', 2)).map(([key, value]) => [key, value ?? 'true']));
const now = new Date();
const season = Number(args.get('season') ?? (now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()));
const requestedWeek = Number(args.get('week') ?? 0);
const apiKey = process.env.BALLDONTLIE_API_KEY || process.env.balldontlie || process.env.SPORTS_DATA_API_KEY;
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = [!apiKey && 'BALLDONTLIE_API_KEY', !dbUrl && 'NEXT_PUBLIC_SUPABASE_URL', !dbKey && 'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
if (missing.length) throw new Error(`Missing production runtime binding: ${missing.join(', ')}`);
const db = createClient(dbUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
const baseUrl = (process.env.BALLDONTLIE_BASE_URL || 'https://api.balldontlie.io').replace(/\/$/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const number = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
function canonicalStats(stats = {}, isDefense = false) {
  if (!isDefense) return {
    ...stats,
    passing_tds: number(stats.passing_tds ?? stats.passing_touchdowns),
    passing_interceptions: number(stats.passing_interceptions ?? stats.interceptions_thrown ?? stats.interceptions),
    rushing_tds: number(stats.rushing_tds ?? stats.rushing_touchdowns),
    receiving_tds: number(stats.receiving_tds ?? stats.receiving_touchdowns),
    passing_2pt_conversions: number(stats.passing_2pt_conversions ?? stats.passing_two_point_conversions),
    rushing_2pt_conversions: number(stats.rushing_2pt_conversions ?? stats.rushing_two_point_conversions),
    receiving_2pt_conversions: number(stats.receiving_2pt_conversions ?? stats.receiving_two_point_conversions),
    rushing_fumbles_lost: number(stats.rushing_fumbles_lost ?? (stats.receiving_fumbles_lost == null && stats.sack_fumbles_lost == null && stats.passing_fumbles_lost == null ? stats.fumbles_lost : 0)),
    receiving_fumbles_lost: number(stats.receiving_fumbles_lost),
    sack_fumbles_lost: number(stats.sack_fumbles_lost ?? stats.passing_fumbles_lost),
    special_teams_tds: number(stats.special_teams_tds ?? stats.kick_return_touchdowns) + number(stats.punt_return_touchdowns),
    fg_made_0_19: number(stats.fg_made_0_19 ?? stats.field_goals_made_0_to_19),
    fg_made_20_29: number(stats.fg_made_20_29 ?? stats.field_goals_made_20_to_29),
    fg_made_30_39: number(stats.fg_made_30_39 ?? stats.field_goals_made_30_to_39 ?? stats.field_goals_made_0_to_39),
    fg_made_40_49: number(stats.fg_made_40_49 ?? stats.field_goals_made_40_to_49),
    fg_made_50_59: number(stats.fg_made_50_59 ?? stats.field_goals_made_50_to_59),
    fg_made_60_: number(stats.fg_made_60_ ?? stats.field_goals_made_60_plus),
    pat_made: number(stats.pat_made ?? stats.extra_points_made),
  };
  return {
    ...stats,
    def_sacks: number(stats.def_sacks ?? stats.defensive_sacks),
    def_interceptions: number(stats.def_interceptions ?? stats.defensive_interceptions),
    fumble_recovery_opp: number(stats.fumble_recovery_opp ?? stats.opponent_fumble_recoveries),
    def_tds: number(stats.def_tds ?? stats.interception_return_touchdowns),
    fumble_recovery_tds: number(stats.fumble_recovery_tds ?? stats.fumble_return_touchdowns),
    special_teams_tds: number(stats.special_teams_tds ?? stats.kick_return_touchdowns) + number(stats.punt_return_touchdowns) + number(stats.blocked_kick_return_touchdowns),
    def_safeties: number(stats.def_safeties ?? stats.defensive_safeties),
    def_punt_blocks: number(stats.def_punt_blocks ?? stats.kicks_blocked),
    def_pat_blocks: number(stats.def_pat_blocks),
    def_fg_blocks: number(stats.def_fg_blocks),
  };
}
let lastRequestAt = 0;
async function all(path, params) {
  const rows = []; let cursor;
  do {
    const wait = 12_500 - (Date.now() - lastRequestAt); if (wait > 0) await sleep(wait);
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries({ ...params, cursor, per_page: 100 })) if (value != null) url.searchParams.set(key, String(value));
    lastRequestAt = Date.now();
    const response = await fetch(url, { headers: { Authorization: apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`balldontlie ${response.status} for ${path}`);
    const payload = await response.json(); rows.push(...(payload.data ?? [])); cursor = payload.meta?.next_cursor;
  } while (cursor);
  return rows;
}
const { data: competition } = await db.from('competitions').select('id').eq('code', 'pro_football').single();
const { data: competitionSeason } = await db.from('competition_seasons').select('id').eq('competition_id', competition.id).eq('season_year', season).single();
let week = requestedWeek;
if (!week) {
  const lower = new Date(Date.now() - 4 * 86400000).toISOString(); const upper = new Date(Date.now() + 4 * 86400000).toISOString();
  const { data: nearby } = await db.from('real_games').select('week').eq('competition_season_id', competitionSeason.id).gte('starts_at', lower).lte('starts_at', upper).order('starts_at').limit(1);
  week = Number(nearby?.[0]?.week ?? 0);
}
if (!Number.isInteger(week) || week < 1 || week > 18) throw new Error('Could not resolve a current regular-season week. Supply --week=1..18.');
const rows = await all('/nfl/v1/fantasy/weekly_stats', { season, week, scoring_format: 'half_ppr' });
const [{ data: links }, { data: games }, { data: teams }] = await Promise.all([
  db.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider', 'balldontlie').range(0, 10000),
  db.from('real_games').select('id,provider_game_id').eq('competition_season_id', competitionSeason.id).eq('week', week),
  db.from('real_teams').select('id,abbreviation').eq('competition_id', competition.id),
]);
const athleteByProvider = new Map((links ?? []).map(row => [String(row.provider_athlete_id), row.athlete_id]));
const gameByProvider = new Map((games ?? []).map(row => [String(row.provider_game_id).replace(/^balldontlie:/, ''), row.id]));
const providerAlias = value => ({ JAX: 'JAC', WAS: 'WSH', LA: 'LAR' }[String(value)] ?? String(value));
const teamByAlias = new Map((teams ?? []).map(row => [providerAlias(row.abbreviation), row.id]));
const playerStats = []; const teamStats = []; const ingestedAt = new Date().toISOString();
for (const row of rows) {
  const gameId = gameByProvider.get(String(row.game?.id ?? row.game_id ?? '')); if (!gameId) continue;
  const raw = { ...canonicalStats(row.stats ?? {}, !row.player), _provider_fantasy_points: row.fantasy_points ?? [], _provider_collected_at: row.collected_at ?? null };
  if (row.player?.id) {
    const athleteId = athleteByProvider.get(String(row.player.id)); if (!athleteId) continue;
    playerStats.push({ athlete_id: athleteId, game_id: gameId, raw_stats: raw, source_provider: 'balldontlie', source_updated_at: row.collected_at ?? null, ingested_at: ingestedAt });
  } else {
    const teamId = teamByAlias.get(String(row.team?.abbreviation ?? '')); if (!teamId) continue;
    teamStats.push({ real_team_id: teamId, game_id: gameId, raw_stats: raw, source_provider: 'balldontlie', source_updated_at: row.collected_at ?? null, ingested_at: ingestedAt });
  }
}
for (const [table, values, conflict] of [['athlete_game_stats', playerStats, 'athlete_id,game_id,source_provider'], ['real_team_game_stats', teamStats, 'real_team_id,game_id,source_provider']]) {
  for (let index = 0; index < values.length; index += 500) { const { error } = await db.from(table).upsert(values.slice(index, index + 500), { onConflict: conflict }); if (error) throw new Error(error.message); }
}
const { data: leagueSeasons } = await db.from('league_seasons').select('id').eq('competition_season_id', competitionSeason.id);
for (const leagueSeason of leagueSeasons ?? []) {
  const { error } = await db.rpc('calculate_pro_football_week_scores', { p_league_season_id: leagueSeason.id, p_week: week }); if (error) throw new Error(error.message);
  const { data: matchups } = await db.from('matchups').select('id').eq('league_season_id', leagueSeason.id).eq('week', week).eq('is_final', false);
  for (const matchup of matchups ?? []) { const { error: matchupError } = await db.rpc('recompute_matchup', { p_matchup_id: matchup.id, p_finalize: false }); if (matchupError) throw new Error(matchupError.message); }
}
const report = { season, week, fetched: rows.length, playerStats: playerStats.length, teamStats: teamStats.length, recalculatedLeagues: leagueSeasons?.length ?? 0, ingestedAt };
console.log(JSON.stringify(report, null, 2));
return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runWeeklyStatsImport().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
