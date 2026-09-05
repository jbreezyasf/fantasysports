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

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));

const years = (args.get('years') ?? '2021,2022,2023,2024,2025')
  .split(',')
  .map((year) => Number(year.trim()))
  .filter(Number.isInteger);
const seasonType = (args.get('season-type') ?? 'REG').toUpperCase();
const dryRun = args.has('dry-run');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.SPORTS_DATA_API_KEY || process.env.NFL_API || process.env.sportradar;
const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
const baseUrl = (process.env.SPORTS_DATA_BASE_URL || `https://api.sportradar.com/nfl/official/${accessLevel}/v7/en`).replace(/\/$/, '');

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
if ((process.env.SPORTS_DATA_PROVIDER || 'sportradar').toLowerCase() !== 'sportradar') throw new Error('SPORTS_DATA_PROVIDER must be sportradar.');
if (!apiKey) throw new Error('SPORTS_DATA_API_KEY, NFL_API, or sportradar is required.');
if (!['REG', 'PST', 'PRE'].includes(seasonType)) throw new Error('--season-type must be REG, PST, or PRE.');
if (!years.length) throw new Error('--years must include at least one year.');

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
let requests = 0;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const number = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeAlias = (alias) => alias?.trim().toUpperCase() === 'JAC' ? 'JAX' : alias?.trim().toUpperCase();
const pathNumber = (object, path) => path.reduce((value, key) => value?.[key], object);

async function radarGet(path) {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < 1250) await sleep(1250 - elapsed);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastRequestAt = Date.now();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(Number(process.env.SPORTS_DATA_TIMEOUT_MS || 15000)),
    });
    requests += 1;
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 2) throw new Error(`Sportradar ${response.status} for ${path}`);
    await sleep(number(response.headers.get('retry-after')) * 1000 || 2000 * (attempt + 1));
  }
  throw new Error(`Sportradar request failed for ${path}`);
}

function playerFantasyPoints(player) {
  const passing = player.passing ?? {};
  const rushing = player.rushing ?? {};
  const receiving = player.receiving ?? {};
  const fumbles = player.fumbles ?? {};
  const fieldGoals = player.field_goals ?? {};
  const extraPoints = player.extra_points?.kicks ?? player.extra_points ?? {};
  const conversions = player.conversions ?? {};
  const touchdowns = player.touchdowns ?? {};
  return Math.round((
    number(passing.yards) / 25
    + number(passing.touchdowns) * 6
    - number(passing.interceptions) * 2
    + number(rushing.yards) / 10
    + number(rushing.touchdowns) * 6
    + number(receiving.receptions) * 0.5
    + number(receiving.yards) / 10
    + number(receiving.touchdowns) * 6
    + (number(conversions.pass_successes) + number(conversions.rush_successes) + number(conversions.receive_successes)) * 2
    + number(touchdowns.total_return) * 6
    - number(fumbles.lost_fumbles) * 2
    + number(fieldGoals.made_19) * 3
    + number(fieldGoals.made_29) * 3
    + number(fieldGoals.made_39) * 3
    + number(fieldGoals.made_49) * 4
    + number(fieldGoals.made_50) * 5
    + number(extraPoints.made)
  ) * 100) / 100;
}

function defenseFantasyPoints(teamStats) {
  const defense = teamStats.record?.defense ?? {};
  const touchdowns = teamStats.record?.touchdowns ?? {};
  const interceptions = teamStats.record?.interceptions ?? {};
  const fumbles = teamStats.record?.fumbles ?? {};
  const opponents = teamStats.opponents ?? {};
  const pointsAllowed = number(opponents.points) || number(opponents.touchdowns?.total) * 6 + number(opponents.extra_points?.kicks?.made) + number(opponents.field_goals?.made) * 3;
  const pointsAllowedScore =
    pointsAllowed <= 0 ? 10 :
    pointsAllowed <= 6 ? 7 :
    pointsAllowed <= 13 ? 4 :
    pointsAllowed <= 20 ? 1 :
    pointsAllowed <= 27 ? 0 :
    pointsAllowed <= 34 ? -1 : -4;
  return Math.round((
    number(defense.sacks)
    + number(interceptions.interceptions) * 2
    + number(fumbles.opp_rec) * 2
    + number(defense.safeties) * 2
    + number(defense.sp_blocks) * 2
    + number(touchdowns.int_return) * 6
    + number(touchdowns.fumble_return) * 6
    + number(touchdowns.kick_return) * 6
    + number(touchdowns.punt_return) * 6
    + number(touchdowns.total_return) * 6
    + pointsAllowedScore
  ) * 100) / 100;
}

async function main() {
  const { data: competition, error: competitionError } = await supabase.from('competitions').select('id').eq('code', 'pro_football').single();
  if (competitionError || !competition) throw new Error(competitionError?.message || 'pro_football competition missing.');

  const [{ data: providerLinks, error: providerError }, { data: dbTeams, error: dbTeamError }] = await Promise.all([
    supabase.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider', 'sportradar').range(0, 5000),
    supabase.from('real_teams').select('id,abbreviation').eq('competition_id', competition.id),
  ]);
  if (providerError) throw new Error(providerError.message);
  if (dbTeamError) throw new Error(dbTeamError.message);

  const teamPayload = await radarGet('/league/teams.json');
  const dbTeamByAlias = new Map((dbTeams ?? []).map((team) => [normalizeAlias(team.abbreviation), team.id]));
  const radarTeams = (teamPayload.teams ?? [])
    .map((team) => ({ ...team, normalizedAlias: normalizeAlias(team.alias), dbId: dbTeamByAlias.get(normalizeAlias(team.alias)) }))
    .filter((team) => team.normalizedAlias && team.dbId);
  if (radarTeams.length < 32) throw new Error(`Only ${radarTeams.length} Sportradar teams map to Big Exec teams.`);

  const athleteByProviderId = new Map((providerLinks ?? []).map((row) => [row.provider_athlete_id, row.athlete_id]));
  const rows = [];
  const skippedPlayers = [];

  for (const year of years) {
    for (const team of radarTeams) {
      const payload = await radarGet(`/seasons/${year}/${seasonType}/teams/${encodeURIComponent(team.id)}/statistics.json`);
      rows.push({
        competition_id: competition.id,
        season_year: year,
        asset_type: 'team_defense',
        athlete_id: null,
        real_team_id: team.dbId,
        position: 'D/ST',
        points: defenseFantasyPoints(payload),
        games_played: number(payload.record?.games_played),
        games_started: null,
        source: 'sportradar',
        source_version: `${seasonType.toLowerCase()}-seasonal-statistics-v7`,
        raw_stats: { record: payload.record ?? {}, opponents: payload.opponents ?? {} },
      });

      for (const player of payload.player_records ?? []) {
        const position = String(player.position ?? '').toUpperCase();
        if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) continue;
        const athleteId = athleteByProviderId.get(player.id);
        if (!athleteId) {
          skippedPlayers.push({ year, playerId: player.id, name: player.name ?? player.full_name ?? 'Unknown', position });
          continue;
        }
        rows.push({
          competition_id: competition.id,
          season_year: year,
          asset_type: 'athlete',
          athlete_id: athleteId,
          real_team_id: null,
          position,
          points: playerFantasyPoints(player),
          games_played: number(player.games_played),
          games_started: number(player.games_started),
          source: 'sportradar',
          source_version: `${seasonType.toLowerCase()}-seasonal-statistics-v7`,
          raw_stats: player,
        });
      }
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ dryRun, years, seasonType, requests, rows: rows.length, skippedPlayers: skippedPlayers.length }, null, 2));
    return;
  }

  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from('draft_historical_values').upsert(rows.slice(index, index + 500), {
      onConflict: 'competition_id,season_year,source,asset_type,asset_key',
    });
    if (error) throw new Error(error.message);
  }

  const byPosition = rows.reduce((counts, row) => {
    counts[row.position] = (counts[row.position] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ imported: rows.length, skippedPlayers: skippedPlayers.length, requests, years, seasonType, byPosition }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
