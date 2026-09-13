#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadLocalEnv(file = '.env.local') {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadLocalEnv();
const args = new Map(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=', 2)).map(([key, value]) => [key, value ?? 'true']));
if (args.has('help')) {
  console.log(`Usage: npm run data:balldontlie:nfl:market -- --season=2026 [--dry-run]\n\nImports current half-PPR rankings, ADP, roster rates, and projections without changing completed drafts.`);
  process.exit(0);
}

const season = Number(args.get('season') ?? new Date().getUTCFullYear());
const scoringFormat = args.get('scoring-format') ?? 'half_ppr';
const dryRun = args.has('dry-run');
const apiKey = process.env.BALLDONTLIE_API_KEY || process.env.balldontlie || (process.env.SPORTS_DATA_PROVIDER === 'balldontlie' ? process.env.SPORTS_DATA_API_KEY : '');
const baseUrl = (process.env.BALLDONTLIE_BASE_URL || process.env.SPORTS_DATA_BASE_URL || 'https://api.balldontlie.io').replace(/\/$/, '');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const minRequestMs = Number(process.env.BALLDONTLIE_MIN_REQUEST_MS || 12_500);
if (!Number.isInteger(season)) throw new Error('--season must be a four-digit year.');
if (!apiKey) throw new Error('BALLDONTLIE_API_KEY, balldontlie, or SPORTS_DATA_API_KEY is required.');
if (!supabaseUrl || !serviceRoleKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
let lastRequestAt = 0;
let requestCount = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const finite = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const positive = value => { const parsed = finite(value); return parsed !== null && parsed > 0 ? parsed : null; };
const firstNumber = (objects, keys, validator = finite) => {
  for (const object of objects) for (const key of keys) { const value = validator(object?.[key]); if (value !== null) return value; }
  return null;
};
const playerId = row => String(row?.player?.id ?? row?.player_id ?? row?.athlete?.id ?? row?.id ?? '');
const percent = value => { const parsed = finite(value); return parsed === null ? null : parsed <= 1 ? Math.round(parsed * 10_000) / 100 : Math.min(100, parsed); };

async function getAll(path, params) {
  const rows = [];
  let cursor;
  do {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < minRequestMs) await sleep(minRequestMs - elapsed);
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries({ ...params, cursor, per_page: 100 })) if (value !== undefined) url.searchParams.set(key, String(value));
    lastRequestAt = Date.now();
    const response = await fetch(url, { headers: { accept: 'application/json', Authorization: apiKey }, signal: AbortSignal.timeout(30_000) });
    requestCount += 1;
    if (!response.ok) throw new Error(`balldontlie ${response.status} for ${path}`);
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    cursor = payload.meta?.next_cursor;
  } while (cursor);
  return rows;
}

function projectedPoints(row) {
  const containers = [row, row?.projections, row?.stats];
  const direct = firstNumber(containers, ['projected_fantasy_points', 'fantasy_points', 'projected_points', 'points']);
  if (direct !== null) return direct;
  const stat = (...keys) => firstNumber(containers, keys) ?? 0;
  const calculated = stat('passing_yards', 'pass_yards') / 25 + stat('passing_touchdowns', 'passing_tds', 'pass_tds') * 6
    - stat('interceptions', 'passing_interceptions') * 2 + stat('rushing_yards', 'rush_yards') / 10
    + stat('rushing_touchdowns', 'rushing_tds', 'rush_tds') * 6 + stat('receptions') * 0.5
    + stat('receiving_yards', 'rec_yards') / 10 + stat('receiving_touchdowns', 'receiving_tds', 'rec_tds') * 6
    + stat('two_point_conversions', 'two_pt_conversions') * 2 - stat('fumbles_lost', 'lost_fumbles') * 2;
  return calculated ? Math.round(calculated * 100) / 100 : null;
}

async function main() {
  const rankings = await getAll('/nfl/v1/fantasy/rankings', { season, ranking_type: scoringFormat });
  const adpRows = await getAll('/nfl/v1/fantasy/adp', { season });
  const projectionRows = await getAll('/nfl/v1/fantasy/projections', { season });
  const { data: competition, error: competitionError } = await supabase.from('competitions').select('id').eq('code', 'pro_football').single();
  if (competitionError || !competition) throw new Error(competitionError?.message || 'pro_football competition missing.');
  const { data: links, error: linkError } = await supabase.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider', 'balldontlie').range(0, 10000);
  if (linkError) throw new Error(linkError.message);
  const athleteByProviderId = new Map((links ?? []).map(link => [String(link.provider_athlete_id), link.athlete_id]));
  const byProviderId = new Map();
  for (const row of rankings) byProviderId.set(playerId(row), { ...(byProviderId.get(playerId(row)) ?? {}), ranking: row });
  for (const row of adpRows) byProviderId.set(playerId(row), { ...(byProviderId.get(playerId(row)) ?? {}), adp: row });
  for (const row of projectionRows) byProviderId.set(playerId(row), { ...(byProviderId.get(playerId(row)) ?? {}), projection: row });
  const importedAt = new Date().toISOString();
  const unmapped = [];
  const values = [];
  for (const [providerId, value] of byProviderId) {
    const athleteId = athleteByProviderId.get(providerId);
    if (!athleteId) { if (providerId) unmapped.push(providerId); continue; }
    const rankContainers = [value.ranking, value.ranking?.rankings];
    const adpContainers = [value.adp, value.adp?.adp];
    values.push({
      competition_id: competition.id, season_year: season, athlete_id: athleteId, source: 'balldontlie', scoring_format: scoringFormat,
      overall_rank: firstNumber(rankContainers, ['overall_rank', 'overall', 'rank'], positive),
      position_rank: firstNumber(rankContainers, ['position_rank', 'positional_rank', 'position'], positive),
      adp: firstNumber(adpContainers, ['average_draft_position', 'adp'], positive),
      projected_points: projectedPoints(value.projection),
      percent_rostered: percent(firstNumber(adpContainers, ['percent_rostered', 'rostered_percentage', 'roster_percentage'])),
      percent_started: percent(firstNumber(adpContainers, ['percent_started', 'started_percentage', 'start_percentage'])),
      raw_ranking: value.ranking ?? {}, raw_adp: value.adp ?? {}, raw_projection: value.projection ?? {}, imported_at: importedAt,
    });
  }
  if (!dryRun && values.length) {
    for (let index = 0; index < values.length; index += 500) {
      const { error } = await supabase.from('fantasy_player_market_values').upsert(values.slice(index, index + 500), { onConflict: 'competition_id,season_year,athlete_id,source,scoring_format' });
      if (error) throw new Error(error.message);
    }
  }
  console.log(JSON.stringify({ dryRun, season, scoringFormat, fetched: { rankings: rankings.length, adp: adpRows.length, projections: projectionRows.length }, mapped: values.length, unmapped: unmapped.length, requests: requestCount }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
