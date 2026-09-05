#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadLocalEnv(file = '.env.local', env = process.env) {
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || env[match[1]] !== undefined) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

loadLocalEnv();

const args = new Map(process.argv.slice(2)
  .map((arg) => arg.trim())
  .filter((arg) => arg && arg !== '--')
  .map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }));

if (args.has('help')) {
  console.log(`Usage:
  npm run data:balldontlie:nfl:historical -- --proof-only --sample-year=2025 --current-season=2026
  npm run data:balldontlie:nfl:historical -- --dry-run --years=2021,2022,2023,2024,2025 --current-season=2026
  npm run data:balldontlie:nfl:historical -- --years=2021,2022,2023,2024,2025 --current-season=2026

Options:
  --proof-only            Check provider access without database writes.
  --dry-run               Fetch and map rows without database writes.
  --years=YYYY,...        Historical seasons to import. Defaults to 2021-2025.
  --season-type=2         1 preseason, 2 regular season, 3 postseason. Defaults to 2.
  --current-season=YYYY   Season used to verify fantasy rankings, ADP, and projections.
  --ranking-type=ppr      Ranking type for the fantasy rankings proof call.
`);
  process.exit(0);
}

const years = (args.get('years') ?? '2021,2022,2023,2024,2025')
  .split(',')
  .map((year) => Number(year.trim()))
  .filter(Number.isInteger);
const seasonType = Number(args.get('season-type') ?? 2);
const dryRun = args.has('dry-run');
const proofOnly = args.has('proof-only');
const rankingType = args.get('ranking-type') ?? 'ppr';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.BALLDONTLIE_API_KEY || process.env.balldontlie || (process.env.SPORTS_DATA_PROVIDER === 'balldontlie' ? process.env.SPORTS_DATA_API_KEY : '');
const baseUrl = (process.env.BALLDONTLIE_BASE_URL || process.env.SPORTS_DATA_BASE_URL || 'https://api.balldontlie.io').replace(/\/$/, '');
const minRequestMs = Number(process.env.BALLDONTLIE_MIN_REQUEST_MS || 12_500);

if (!proofOnly && !supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required unless --proof-only is used.');
if (!proofOnly && !serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required unless --proof-only is used.');
if (!apiKey) throw new Error('BALLDONTLIE_API_KEY, balldontlie, or SPORTS_DATA_API_KEY is required.');
if (![1, 2, 3].includes(seasonType)) throw new Error('--season-type must be 1, 2, or 3.');
if (!years.length) throw new Error('--years must include at least one year.');

const supabase = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
let requests = 0;
let lastRequestAt = 0;
let requestGate = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const number = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeAlias = (alias) => alias?.trim().toUpperCase() === 'JAC' ? 'JAX' : alias?.trim().toUpperCase();
const normalizePosition = (position) => {
  const normalized = position?.trim().toUpperCase();
  if (normalized === 'DST' || normalized === 'DEF') return 'D/ST';
  return normalized ?? '';
};
const playerName = (player) => [player?.first_name, player?.last_name].filter(Boolean).join(' ').trim();
const statAliases = {
  passingYards: ['passing_yards', 'pass_yards', 'yards_passing'],
  passingTouchdowns: ['passing_touchdowns', 'passing_tds', 'pass_touchdowns', 'pass_tds'],
  interceptions: ['interceptions', 'passing_interceptions', 'interceptions_thrown'],
  rushingYards: ['rushing_yards', 'rush_yards', 'yards_rushing'],
  rushingTouchdowns: ['rushing_touchdowns', 'rushing_tds', 'rush_touchdowns', 'rush_tds'],
  receptions: ['receptions', 'receiving_receptions'],
  receivingYards: ['receiving_yards', 'rec_yards', 'yards_receiving'],
  receivingTouchdowns: ['receiving_touchdowns', 'receiving_tds', 'rec_touchdowns', 'rec_tds'],
  twoPointConversions: ['two_point_conversions', 'two_pt_conversions', 'two_point_conversion_successes'],
  fumblesLost: ['fumbles_lost', 'lost_fumbles'],
  fieldGoals19: ['field_goals_made_1_19', 'field_goals_made_19'],
  fieldGoals29: ['field_goals_made_20_29', 'field_goals_made_29'],
  fieldGoals39: ['field_goals_made_30_39', 'field_goals_made_39'],
  fieldGoals49: ['field_goals_made_40_49', 'field_goals_made_49'],
  fieldGoals50: ['field_goals_made_50', 'field_goals_made_50_plus'],
  extraPoints: ['extra_points_made', 'pat_made'],
  sacks: ['sacks'],
  safeties: ['safeties'],
  defensiveTouchdowns: ['defensive_touchdowns', 'defense_touchdowns'],
  specialTeamsTouchdowns: ['special_teams_touchdowns', 'return_touchdowns'],
  fumblesRecovered: ['fumbles_recovered', 'defensive_fumbles_recovered'],
  pointsAllowed: ['points_allowed'],
};

function readStat(row, key) {
  for (const alias of statAliases[key]) {
    if (row[alias] !== undefined && row[alias] !== null) return number(row[alias]);
  }
  return 0;
}

function playerFantasyPoints(row) {
  return Math.round((
    readStat(row, 'passingYards') / 25
    + readStat(row, 'passingTouchdowns') * 6
    - readStat(row, 'interceptions') * 2
    + readStat(row, 'rushingYards') / 10
    + readStat(row, 'rushingTouchdowns') * 6
    + readStat(row, 'receptions') * 0.5
    + readStat(row, 'receivingYards') / 10
    + readStat(row, 'receivingTouchdowns') * 6
    + readStat(row, 'twoPointConversions') * 2
    - readStat(row, 'fumblesLost') * 2
    + readStat(row, 'fieldGoals19') * 3
    + readStat(row, 'fieldGoals29') * 3
    + readStat(row, 'fieldGoals39') * 3
    + readStat(row, 'fieldGoals49') * 4
    + readStat(row, 'fieldGoals50') * 5
    + readStat(row, 'extraPoints')
  ) * 100) / 100;
}

function defenseFantasyPoints(row) {
  const pointsAllowed = readStat(row, 'pointsAllowed');
  const pointsAllowedScore =
    pointsAllowed <= 0 ? 10 :
    pointsAllowed <= 6 ? 7 :
    pointsAllowed <= 13 ? 4 :
    pointsAllowed <= 20 ? 1 :
    pointsAllowed <= 27 ? 0 :
    pointsAllowed <= 34 ? -1 : -4;
  return Math.round((
    readStat(row, 'sacks')
    + readStat(row, 'interceptions') * 2
    + readStat(row, 'fumblesRecovered') * 2
    + readStat(row, 'safeties') * 2
    + readStat(row, 'defensiveTouchdowns') * 6
    + readStat(row, 'specialTeamsTouchdowns') * 6
    + pointsAllowedScore
  ) * 100) / 100;
}

async function bdlGet(path, params = {}) {
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
    await waitForRequestSlot();
    const response = await fetch(url, {
      headers: { accept: 'application/json', Authorization: apiKey },
      signal: AbortSignal.timeout(Number(process.env.SPORTS_DATA_TIMEOUT_MS || 15000)),
    });
    requests += 1;
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 2) {
      const body = await response.text().catch(() => '');
      throw new Error(`balldontlie ${response.status} for ${path}${body ? `: ${body.slice(0, 240)}` : ''}`);
    }
    await sleep(number(response.headers.get('retry-after')) * 1000 || 15000 * (attempt + 1));
  }
  throw new Error(`balldontlie request failed for ${path}`);
}

async function waitForRequestSlot() {
  const turn = requestGate.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < minRequestMs) await sleep(minRequestMs - elapsed);
    lastRequestAt = Date.now();
  });
  requestGate = turn.catch(() => {});
  await turn;
}

async function bdlAll(path, params = {}) {
  const rows = [];
  let cursor = undefined;
  do {
    const payload = await bdlGet(path, { ...params, cursor, per_page: params.per_page ?? 100 });
    rows.push(...(payload.data ?? []));
    cursor = payload.meta?.next_cursor;
  } while (cursor);
  return rows;
}

async function bdlPage(path, params = {}) {
  const payload = await bdlGet(path, { ...params, per_page: params.per_page ?? 1 });
  return payload.data ?? [];
}

async function proveFantasyEndpoints(currentSeason) {
  const [rankings, adp, projections] = await Promise.all([
    bdlPage('/nfl/v1/fantasy/rankings', { season: currentSeason, ranking_type: rankingType, per_page: 1 }),
    bdlPage('/nfl/v1/fantasy/adp', { season: currentSeason, per_page: 1 }),
    bdlPage('/nfl/v1/fantasy/projections', { season: currentSeason, per_page: 1 }),
  ]);
  return {
    season: currentSeason,
    rankingType,
    rankingsSample: rankings.length,
    adpSample: adp.length,
    projectionsSample: projections.length,
  };
}

async function main() {
  const currentSeason = Number(args.get('current-season') ?? Math.max(...years));
  const teams = await bdlAll('/nfl/v1/teams', { per_page: 100 });
  const fantasyProof = await proveFantasyEndpoints(currentSeason).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

  if (proofOnly) {
    const sampleYear = Number(args.get('sample-year') ?? currentSeason);
    const sampleStats = await bdlPage('/nfl/v1/season_stats', { season: sampleYear, season_type: seasonType, per_page: 1 });
    console.log(JSON.stringify({ proofOnly, teams: teams.length, sampleYear, sampleStats: sampleStats.length, fantasyProof, requests }, null, 2));
    return;
  }

  const { data: competition, error: competitionError } = await supabase.from('competitions').select('id').eq('code', 'pro_football').single();
  if (competitionError || !competition) throw new Error(competitionError?.message || 'pro_football competition missing.');

  const [athleteResult, providerResult, teamResult] = await Promise.all([
    supabase.from('athletes').select('id,display_name,position,real_team_id').eq('competition_id', competition.id).range(0, 10000),
    supabase.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider', 'balldontlie').range(0, 10000),
    supabase.from('real_teams').select('id,abbreviation').eq('competition_id', competition.id),
  ]);
  if (athleteResult.error) throw new Error(athleteResult.error.message);
  if (providerResult.error) throw new Error(providerResult.error.message);
  if (teamResult.error) throw new Error(teamResult.error.message);

  const dbTeamByAlias = new Map((teamResult.data ?? []).map((team) => [normalizeAlias(team.abbreviation), team.id]));
  const bdlTeamById = new Map(teams.map((team) => [team.id, { ...team, dbId: dbTeamByAlias.get(normalizeAlias(team.abbreviation)) }]));
  const mappedTeamIds = teams.filter((team) => dbTeamByAlias.has(normalizeAlias(team.abbreviation))).map((team) => team.id);
  if (mappedTeamIds.length < 32) throw new Error(`Only ${mappedTeamIds.length} balldontlie teams map to Big Exec teams.`);

  const athleteByProviderId = new Map((providerResult.data ?? []).map((row) => [row.provider_athlete_id, row.athlete_id]));
  const athleteByIdentity = new Map((athleteResult.data ?? []).map((athlete) => [
    `${athlete.display_name.toLowerCase()}|${athlete.position}|${athlete.real_team_id ?? ''}`,
    athlete.id,
  ]));

  const rows = [];
  const providerLinks = [];
  const skippedPlayers = [];

  for (const year of years) {
    const [playerStats, teamStats] = await Promise.all([
      bdlAll('/nfl/v1/season_stats', { season: year, season_type: seasonType, per_page: 100 }),
      bdlAll('/nfl/v1/team_season_stats', { season: year, team_ids: mappedTeamIds, season_type: seasonType, per_page: 100 }),
    ]);

    for (const stat of teamStats) {
      const team = bdlTeamById.get(stat.team?.id);
      if (!team?.dbId) continue;
      rows.push({
        competition_id: competition.id,
        season_year: year,
        asset_type: 'team_defense',
        athlete_id: null,
        real_team_id: team.dbId,
        position: 'D/ST',
        points: defenseFantasyPoints(stat),
        games_played: number(stat.games_played),
        games_started: null,
        source: 'balldontlie',
        source_version: `nfl-v1-season-type-${seasonType}`,
        raw_stats: stat,
      });
    }

    for (const stat of playerStats) {
      const player = stat.player;
      const team = bdlTeamById.get(stat.team?.id ?? player?.team?.id);
      const position = normalizePosition(player?.position_abbreviation ?? stat.position ?? player?.position);
      if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) continue;
      const name = playerName(player);
      const athleteId = athleteByProviderId.get(String(player?.id)) ?? athleteByIdentity.get(`${name.toLowerCase()}|${position}|${team?.dbId ?? ''}`);
      if (!athleteId) {
        skippedPlayers.push({ year, playerId: player?.id ?? null, name: name || 'Unknown', position, team: team?.abbreviation ?? null });
        continue;
      }
      if (player?.id) providerLinks.push({ athlete_id: athleteId, provider: 'balldontlie', provider_athlete_id: String(player.id) });
      rows.push({
        competition_id: competition.id,
        season_year: year,
        asset_type: 'athlete',
        athlete_id: athleteId,
        real_team_id: null,
        position,
        points: playerFantasyPoints(stat),
        games_played: number(stat.games_played),
        games_started: number(stat.games_started),
        source: 'balldontlie',
        source_version: `nfl-v1-season-type-${seasonType}`,
        raw_stats: stat,
      });
    }
  }

  const byPosition = rows.reduce((counts, row) => {
    counts[row.position] = (counts[row.position] ?? 0) + 1;
    return counts;
  }, {});

  if (dryRun) {
    console.log(JSON.stringify({ dryRun, years, seasonType, rows: rows.length, skippedPlayers: skippedPlayers.length, byPosition, fantasyProof, requests }, null, 2));
    return;
  }

  for (let index = 0; index < providerLinks.length; index += 500) {
    const { error } = await supabase.from('athlete_provider_ids').upsert(providerLinks.slice(index, index + 500), { onConflict: 'provider,provider_athlete_id' });
    if (error) throw new Error(error.message);
  }
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from('draft_historical_values').upsert(rows.slice(index, index + 500), {
      onConflict: 'competition_id,season_year,source,asset_type,asset_key',
    });
    if (error) throw new Error(error.message);
  }

  console.log(JSON.stringify({ imported: rows.length, providerLinks: providerLinks.length, skippedPlayers: skippedPlayers.length, requests, years, seasonType, byPosition, fantasyProof }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
