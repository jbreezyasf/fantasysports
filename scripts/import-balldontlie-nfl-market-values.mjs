#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  console.log(`Usage: npm run data:balldontlie:nfl:market -- --season=2026 [--dry-run]\n\nImports current provider rankings, ADP, roster rates, and half-PPR projections without changing completed drafts.`);
  process.exit(0);
}

const now = new Date();
const season = Number(args.get('season') ?? (now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()));
const scoringFormat = args.get('scoring-format') ?? 'half_ppr';
const dryRun = args.has('dry-run');
const apiKey = process.env.BALLDONTLIE_API_KEY || process.env.balldontlie || (process.env.SPORTS_DATA_PROVIDER === 'balldontlie' ? process.env.SPORTS_DATA_API_KEY : '');
const baseUrl = (process.env.BALLDONTLIE_BASE_URL || process.env.SPORTS_DATA_BASE_URL || 'https://api.balldontlie.io').replace(/\/$/, '');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const minRequestMs = Number(process.env.BALLDONTLIE_MIN_REQUEST_MS || 12_500);
if (!Number.isInteger(season)) throw new Error('--season must be a four-digit year.');
const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
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
const playerName = row => {
  const player = row?.player ?? row?.athlete ?? row;
  return String(player?.display_name ?? player?.full_name ?? `${player?.first_name ?? ''} ${player?.last_name ?? ''}`).trim();
};
const playerPosition = row => String((row?.player ?? row?.athlete ?? row)?.position_abbreviation ?? (row?.player ?? row?.athlete ?? row)?.position ?? '').trim().toUpperCase();
const identityKey = row => `${playerName(row).toLowerCase().replace(/[^a-z0-9]/g, '')}|${playerPosition(row)}`;
const percent = value => { const parsed = finite(value); return parsed === null ? null : parsed <= 1 ? Math.round(parsed * 10_000) / 100 : Math.min(100, parsed); };
const normalizeFormat = value => String(value ?? '').trim().toLowerCase().replace(/[ -]+/g, '_');
const matchingEntry = (value, format, typeKeys) => {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  const wanted = normalizeFormat(format);
  return rows.find(row => typeKeys.some(key => normalizeFormat(row?.[key]) === wanted) || normalizeFormat(row?.scoring_format?.key) === wanted) ?? null;
};
export const rankingEntry = (row, format) => matchingEntry(row?.rankings, format, ['ranking_type', 'type', 'scoring_format']) ?? row;
export const projectionEntry = (row, format) => matchingEntry(row?.projections, format, ['scoring_format', 'type', 'projection_type']) ?? row;
export const adpEntry = (row, format) => matchingEntry(row?.adp, format, ['scoring_format', 'type', 'adp_type']) ?? row;

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

export function projectedPoints(row) {
  const selected = projectionEntry(row, scoringFormat);
  const containers = [selected, selected?.stats, row];
  const direct = firstNumber(containers, ['total_points', 'projected_fantasy_points', 'fantasy_points', 'projected_points', 'points']);
  if (direct !== null) return direct;
  const stat = (...keys) => firstNumber(containers, keys) ?? 0;
  const calculated = stat('passing_yards', 'pass_yards') / 25 + stat('passing_touchdowns', 'passing_tds', 'pass_tds') * 6
    - stat('interceptions', 'passing_interceptions') * 2 + stat('rushing_yards', 'rush_yards') / 10
    + stat('rushing_touchdowns', 'rushing_tds', 'rush_tds') * 6 + stat('receptions') * 0.5
    + stat('receiving_yards', 'rec_yards') / 10 + stat('receiving_touchdowns', 'receiving_tds', 'rec_tds') * 6
    + stat('two_point_conversions', 'two_pt_conversions') * 2 - stat('fumbles_lost', 'lost_fumbles') * 2;
  return calculated ? Math.round(calculated * 100) / 100 : null;
}

export async function runMarketImport() {
  if (!apiKey) throw new Error('BALLDONTLIE_API_KEY, balldontlie, or SPORTS_DATA_API_KEY is required.');
  if (!supabase) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const rankings = await getAll('/nfl/v1/fantasy/rankings', { season, ranking_type: 'ppr' });
  const adpRows = await getAll('/nfl/v1/fantasy/adp', { season });
  const projectionRows = await getAll('/nfl/v1/fantasy/projections', { season });
  const { data: competition, error: competitionError } = await supabase.from('competitions').select('id').eq('code', 'pro_football').single();
  if (competitionError || !competition) throw new Error(competitionError?.message || 'pro_football competition missing.');
  const [{ data: links, error: linkError }, { data: athletes, error: athleteError }] = await Promise.all([
    supabase.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider', 'balldontlie').range(0, 10000),
    supabase.from('athletes').select('id,display_name,position').eq('competition_id', competition.id).eq('active', true).range(0, 10000),
  ]);
  if (linkError || athleteError) throw new Error(linkError?.message || athleteError?.message);
  const athleteByProviderId = new Map((links ?? []).map(link => [String(link.provider_athlete_id), link.athlete_id]));
  const athleteByIdentity = new Map();
  const ambiguousIdentities = new Set();
  for (const athlete of athletes ?? []) {
    const key = `${String(athlete.display_name).toLowerCase().replace(/[^a-z0-9]/g, '')}|${String(athlete.position).toUpperCase()}`;
    if (athleteByIdentity.has(key)) ambiguousIdentities.add(key);
    else athleteByIdentity.set(key, athlete.id);
  }
  for (const key of ambiguousIdentities) athleteByIdentity.delete(key);
  const byProviderId = new Map();
  for (const row of rankings) byProviderId.set(playerId(row), { ...(byProviderId.get(playerId(row)) ?? {}), ranking: row });
  for (const row of adpRows) byProviderId.set(playerId(row), { ...(byProviderId.get(playerId(row)) ?? {}), adp: row });
  for (const row of projectionRows) byProviderId.set(playerId(row), { ...(byProviderId.get(playerId(row)) ?? {}), projection: row });
  const reconciledLinks = [];
  for (const [providerId, value] of byProviderId) {
    if (!providerId || athleteByProviderId.has(providerId)) continue;
    const sample = value.ranking ?? value.adp ?? value.projection;
    const athleteId = athleteByIdentity.get(identityKey(sample));
    if (!athleteId) continue;
    athleteByProviderId.set(providerId, athleteId);
    reconciledLinks.push({ athlete_id: athleteId, provider: 'balldontlie', provider_athlete_id: providerId });
  }
  const importedAt = new Date().toISOString();
  const unmapped = [];
  const values = [];
  for (const [providerId, value] of byProviderId) {
    const athleteId = athleteByProviderId.get(providerId);
    if (!athleteId) { if (providerId) unmapped.push(providerId); continue; }
    const selectedRanking = rankingEntry(value.ranking, 'ppr');
    const selectedAdp = adpEntry(value.adp, scoringFormat);
    const rankContainers = [selectedRanking, value.ranking];
    const adpContainers = [selectedAdp, value.adp];
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
  const ranked = values.filter(value => value.overall_rank !== null).length;
  const projected = values.filter(value => value.projected_points !== null).length;
  const requiredCoverage = Math.min(100, Math.ceil(values.length * 0.5));
  if (!values.length || ranked < requiredCoverage || projected < requiredCoverage) {
    throw new Error(`Provider quality gate failed: mapped=${values.length}, ranked=${ranked}, projected=${projected}, required=${requiredCoverage}. No partial import was accepted.`);
  }
  if (!dryRun && values.length) {
    for (let index = 0; index < reconciledLinks.length; index += 500) {
      const { error } = await supabase.from('athlete_provider_ids').upsert(reconciledLinks.slice(index, index + 500), { onConflict: 'provider,provider_athlete_id' });
      if (error) throw new Error(error.message);
    }
    for (let index = 0; index < values.length; index += 500) {
      const { error } = await supabase.from('fantasy_player_market_values').upsert(values.slice(index, index + 500), { onConflict: 'competition_id,season_year,athlete_id,source,scoring_format' });
      if (error) throw new Error(error.message);
    }
  }
  const report = { dryRun, season, scoringFormat, fetched: { rankings: rankings.length, adp: adpRows.length, projections: projectionRows.length }, mapped: values.length, ranked, projected, reconciledLinks: reconciledLinks.length, unmapped: unmapped.length, requests: requestCount, importedAt };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMarketImport().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
