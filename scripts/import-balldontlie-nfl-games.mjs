#!/usr/bin/env node
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());

const args = new Map(process.argv.slice(2).map((arg) => {
  const match = /^--([^=]+)=(.*)$/.exec(arg);
  return match ? [match[1], match[2]] : [arg.replace(/^--/, ''), 'true'];
}));

const season = Number(args.get('season') ?? 2026);
const week = args.has('week') ? Number(args.get('week')) : null;
const importRows = args.has('import');
const proofOnly = args.has('proof-only') || !importRows;
const verifyWeek = args.has('verify-week') ? Number(args.get('verify-week')) : 1;
const baseUrl = (process.env.BALLDONTLIE_BASE_URL || process.env.SPORTS_DATA_BASE_URL || 'https://api.balldontlie.io').replace(/\/$/, '');
const apiKey = process.env.BALLDONTLIE_API_KEY || process.env.balldontlie || (process.env.SPORTS_DATA_PROVIDER === 'balldontlie' ? process.env.SPORTS_DATA_API_KEY : '');
const minRequestMs = Number(process.env.BALLDONTLIE_MIN_REQUEST_MS || 12_500);

if (!apiKey) throw new Error('BALLDONTLIE_API_KEY, balldontlie, or SPORTS_DATA_API_KEY is required.');
if (!Number.isInteger(season)) throw new Error('--season must be an integer.');
if (week !== null && !Number.isInteger(week)) throw new Error('--week must be an integer.');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

let lastRequestAt = 0;
let requestCount = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, params = {}) {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < minRequestMs) await sleep(minRequestMs - elapsed);
  lastRequestAt = Date.now();

  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(`${key}[]`, String(entry));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: 'application/json', Authorization: apiKey },
      signal: AbortSignal.timeout(Number(process.env.SPORTS_DATA_TIMEOUT_MS || 15_000)),
    });
    requestCount += 1;
    if (response.ok) return response.json();
    const body = await response.text().catch(() => '');
    if (response.status !== 429 || attempt === 2) throw new Error(`balldontlie ${response.status} for ${path}: ${body.slice(0, 240)}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15_000 * (attempt + 1));
  }
  throw new Error(`balldontlie request failed for ${path}`);
}

async function listAll(path, params) {
  const rows = [];
  let cursor = undefined;
  do {
    const page = await get(path, { ...params, cursor, per_page: 100 });
    rows.push(...(page.data ?? []));
    cursor = page.meta?.next_cursor;
  } while (cursor);
  return rows;
}

function stateFor(statusState) {
  if (['scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'delayed', 'suspended'].includes(statusState)) return statusState;
  return 'unknown';
}

function normalizeGame(game) {
  return {
    providerGameId: String(game.id),
    season: Number(game.season),
    week: typeof game.week === 'number' ? game.week : null,
    homeTeamProviderId: game.home_team?.id ? String(game.home_team.id) : null,
    homeTeamAbbreviation: game.home_team?.abbreviation ?? null,
    awayTeamProviderId: game.visitor_team?.id ? String(game.visitor_team.id) : null,
    awayTeamAbbreviation: game.visitor_team?.abbreviation ?? null,
    scheduledKickoffAt: game.date ?? null,
    state: stateFor(game.status_state),
    status: game.status ?? null,
    homeScore: typeof game.home_team_score === 'number' ? game.home_team_score : null,
    awayScore: typeof game.visitor_team_score === 'number' ? game.visitor_team_score : null,
    providerUpdatedAt: typeof game.updated_at === 'string' ? game.updated_at : null,
  };
}

function normalizeAlias(alias) {
  const map = new Map([
    ['JAC', 'JAX'],
    ['WSH', 'WAS'],
    ['LAR', 'LA'],
    ['LA', 'LA'],
  ]);
  return map.get(alias) ?? alias;
}

const { data: competition } = await supabase.from('competitions').select('id').eq('code', 'pro_football').maybeSingle();
if (!competition) throw new Error('pro_football competition not found.');
const { data: competitionSeason } = await supabase
  .from('competition_seasons')
  .select('id,season_year')
  .eq('competition_id', competition.id)
  .eq('season_year', season)
  .maybeSingle();
if (!competitionSeason) throw new Error(`competition_seasons row missing for Pro Football ${season}.`);

const { data: teams } = await supabase.from('real_teams').select('id,abbreviation,display_name').eq('competition_id', competition.id).eq('active', true);
const teamByAlias = new Map((teams ?? []).map((team) => [normalizeAlias(team.abbreviation), team]));

const games = (await listAll('/nfl/v1/games', {
  seasons: [season],
  weeks: week === null ? undefined : [week],
  season_types: [2],
})).map(normalizeGame).filter((game) => game.season === season && (week === null || game.week === week));

const importable = [];
const missingTeams = [];
for (const game of games) {
  const home = teamByAlias.get(normalizeAlias(game.homeTeamAbbreviation));
  const away = teamByAlias.get(normalizeAlias(game.awayTeamAbbreviation));
  if (!home || !away || !game.scheduledKickoffAt || !game.providerGameId) {
    missingTeams.push({
      providerGameId: game.providerGameId,
      week: game.week,
      home: game.homeTeamAbbreviation,
      away: game.awayTeamAbbreviation,
      hasKickoff: Boolean(game.scheduledKickoffAt),
    });
    continue;
  }
  importable.push({
    competition_season_id: competitionSeason.id,
    provider_game_id: `balldontlie:${game.providerGameId}`,
    week: game.week,
    home_team_id: home.id,
    away_team_id: away.id,
    starts_at: game.scheduledKickoffAt,
    state: game.state,
    home_score: game.homeScore,
    away_score: game.awayScore,
    updated_at: game.providerUpdatedAt ?? new Date().toISOString(),
  });
}

const before = await supabase
  .from('real_games')
  .select('id,provider_game_id,week,starts_at,home_team_id,away_team_id,state,home_score,away_score', { count: 'exact' })
  .eq('competition_season_id', competitionSeason.id);

let upserted = 0;
let inserted = 0;
let updated = 0;
if (importRows) {
  for (const row of importable) {
    const { data: existing, error: lookupError } = await supabase
      .from('real_games')
      .select('id')
      .eq('provider_game_id', row.provider_game_id)
      .maybeSingle();
    if (lookupError) throw new Error(`real_games lookup failed for ${row.provider_game_id}: ${lookupError.message}`);
    if (existing?.id) {
      const { error } = await supabase.from('real_games').update(row).eq('id', existing.id);
      if (error) throw new Error(`real_games update failed for ${row.provider_game_id}: ${error.message}`);
      updated += 1;
    } else {
      const { error } = await supabase.from('real_games').insert(row);
      if (error) throw new Error(`real_games insert failed for ${row.provider_game_id}: ${error.message}`);
      inserted += 1;
    }
    upserted += 1;
  }
}

const after = await supabase
  .from('real_games')
  .select('id,provider_game_id,week,starts_at,home_team_id,away_team_id,state,home_score,away_score', { count: 'exact' })
  .eq('competition_season_id', competitionSeason.id);

const weekRows = (after.data ?? []).filter((row) => row.week === verifyWeek);
const duplicateProviderIds = new Map();
for (const row of after.data ?? []) duplicateProviderIds.set(row.provider_game_id, (duplicateProviderIds.get(row.provider_game_id) ?? 0) + 1);
const duplicates = [...duplicateProviderIds.entries()].filter(([, count]) => count > 1);

console.log(JSON.stringify({
  mode: proofOnly ? 'proof-only' : 'import',
  season,
  week,
  providerRequests: requestCount,
  providerGames: games.length,
  importableGames: importable.length,
  skippedGames: missingTeams,
  beforeRows: before.count ?? before.data?.length ?? 0,
  upsertedRows: upserted,
  insertedRows: inserted,
  updatedRows: updated,
  afterRows: after.count ?? after.data?.length ?? 0,
  duplicateProviderIds: duplicates.length,
  verifyWeek,
  verifyWeekRows: weekRows.length,
  verifyWeekFirstKickoff: weekRows.map((row) => row.starts_at).sort()[0] ?? null,
  verifyWeekLastKickoff: weekRows.map((row) => row.starts_at).sort().at(-1) ?? null,
}, null, 2));

if (games.length === 0 || missingTeams.length > 0 || duplicates.length > 0 || (importRows && weekRows.length !== 16 && verifyWeek === 1)) {
  process.exitCode = 1;
}
