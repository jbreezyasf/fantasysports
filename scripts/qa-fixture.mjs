#!/usr/bin/env node
/**
 * Single source of truth for current Big Exec QA fixture identifiers.
 *
 * QA league, season, franchise, and draft ids are recreated by
 * `npm run qa:league:reset`, so every id changes. Ids printed into
 * `qa-artifacts/**` and into `docs/GATE_STATUS.md` are a historical record of the
 * run that produced them and are NOT reusable: pointing a browser or a script at
 * an id from a past artifact silently 404s, which reads like a broken product
 * rather than a stale id.
 *
 * Resolve ids here instead. Never hard-code a QA uuid.
 *
 *   import { resolveQaFixture } from './qa-fixture.mjs';
 *   const fixture = await resolveQaFixture(supabase);
 *
 * Or from a shell, to get the ids currently valid:
 *
 *   npm run qa:ids
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { QA_ACTORS, QA_LEAGUE_NAME } from './qa-actors.mjs';

/**
 * Loads the ignored local .env.local without printing values. QA_AUTH_PASSWORD
 * lives there and npm does not load it automatically.
 */
export function loadLocalEnv(file = '.env.local', env = process.env) {
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (env[key] !== undefined) continue;
    env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const DEFAULT_SUPABASE_URL = 'https://njjiqdqhmcbxblwhfade.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_-ZgoAQmsSp2bNmrfhk11yw_BzLWKXBP';

export function qaSupabaseConfig(env = process.env) {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY,
    appUrl: (env.QA_APP_URL || env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  };
}

export function createQaClient(env = process.env) {
  const { url, key } = qaSupabaseConfig(env);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signInQaActor(label, env = process.env) {
  const actor = QA_ACTORS.find(candidate => candidate.label === label);
  if (!actor) throw new Error(`Unknown QA actor: ${label}`);

  const password = env.QA_AUTH_PASSWORD;
  if (!password) throw new Error('QA_AUTH_PASSWORD is not set. It lives in the ignored local .env.local.');

  const supabase = createQaClient(env);
  const { error } = await supabase.auth.signInWithPassword({ email: actor.email, password });
  if (error) throw new Error(`Sign-in failed for ${label}: ${error.message}`);
  return supabase;
}

/**
 * Resolves the ids that are valid right now. Every lookup is by stable name or
 * by relationship, never by a remembered uuid.
 */
export async function resolveQaFixture(supabase) {
  const { data: league, error: leagueError } = await supabase
    .from('fantasy_leagues')
    .select('id,name,max_franchises')
    .eq('name', QA_LEAGUE_NAME)
    .maybeSingle();
  if (leagueError) throw new Error(`QA league lookup failed: ${leagueError.message}`);
  if (!league) throw new Error(`QA league "${QA_LEAGUE_NAME}" does not exist. Run: npm run qa:league:reset`);

  const { data: season, error: seasonError } = await supabase
    .from('league_seasons')
    .select('id,status,is_current')
    .eq('league_id', league.id)
    .eq('is_current', true)
    .maybeSingle();
  if (seasonError) throw new Error(`QA current season lookup failed: ${seasonError.message}`);
  if (!season) throw new Error('QA league has no current season. Run: npm run qa:league:reset');

  const { data: draft, error: draftError } = await supabase
    .from('drafts')
    .select('id,status,current_pick,current_pick_deadline_at')
    .eq('league_season_id', season.id)
    .maybeSingle();
  if (draftError) throw new Error(`QA draft lookup failed: ${draftError.message}`);

  const { data: seasonFranchises, error: franchiseError } = await supabase
    .from('season_franchises')
    .select('id,franchise_id')
    .eq('league_season_id', season.id);
  if (franchiseError) throw new Error(`QA franchise lookup failed: ${franchiseError.message}`);

  return { league, season, draft: draft ?? null, seasonFranchises: seasonFranchises ?? [] };
}

/** Routes for the fixture as it exists right now. */
export function qaRoutes(fixture, appUrl = qaSupabaseConfig().appUrl) {
  return {
    leagueHq: `${appUrl}/leagues/${fixture.league.id}`,
    players: `${appUrl}/leagues/${fixture.league.id}/players`,
    trades: `${appUrl}/leagues/${fixture.league.id}/trades`,
    lockerRoom: `${appUrl}/leagues/${fixture.league.id}/locker-room`,
    schedule: `${appUrl}/leagues/${fixture.league.id}/schedule`,
    draftRoom: fixture.draft ? `${appUrl}/drafts/${fixture.draft.id}` : null,
  };
}

// CLI: print the currently valid ids.
// pathToFileURL, not string concatenation: this repository path contains spaces,
// which import.meta.url percent-encodes and a raw `file://` + path does not.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadLocalEnv();
  const supabase = await signInQaActor('Commissioner');
  const fixture = await resolveQaFixture(supabase);
  console.log(JSON.stringify({
    resolvedAt: new Date().toISOString(),
    leagueName: QA_LEAGUE_NAME,
    leagueId: fixture.league.id,
    leagueSeasonId: fixture.season.id,
    seasonStatus: fixture.season.status,
    draftId: fixture.draft?.id ?? null,
    draftStatus: fixture.draft?.status ?? null,
    seasonFranchises: fixture.seasonFranchises.length,
    routes: qaRoutes(fixture),
    warning: 'These ids are valid only until the next qa:league:reset. Never copy them into code, docs, or a later run.',
  }, null, 2));
}
