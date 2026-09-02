#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { QA_ACTORS, QA_LEAGUE_NAME } from './qa-actors.mjs';

nextEnv.loadEnvConfig(process.cwd());

const appUrl = (process.env.QA_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://njjiqdqhmcbxblwhfade.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-ZgoAQmsSp2bNmrfhk11yw_BzLWKXBP';
const password = process.env.QA_AUTH_PASSWORD;
const runId = process.env.QA_RUN_ID || `${new Date().toISOString().slice(0, 10)}_roster-integrity`;
const artifactDir = join(process.cwd(), 'qa-artifacts', runId);
const screenshotDir = join(artifactDir, 'screenshots');

if (!password) {
  console.error('QA_AUTH_PASSWORD is required. It must stay local and ignored.');
  process.exit(1);
}

function runDraftBaseline() {
  const result = spawnSync('npm', ['run', 'qa:draft:run'], {
    cwd: process.cwd(),
    env: { ...process.env, QA_RUN_ID: `${runId}-draft-baseline` },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stderr.write(result.stdout);
    process.exit(result.status ?? 1);
  }
}

function client() {
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signInActors() {
  const sessions = new Map();
  for (const actor of QA_ACTORS) {
    const supabase = client();
    const { data, error } = await supabase.auth.signInWithPassword({ email: actor.email, password });
    if (error || !data.user) throw new Error(`Could not sign in ${actor.label}: ${error?.message || 'missing user'}`);
    sessions.set(actor.label, { actor, supabase, userId: data.user.id });
  }
  return sessions;
}

async function runLinkedSql(sql, parse = false) {
  const tempDir = await mkdtemp(join(tmpdir(), 'big-exec-qa-sql-'));
  const file = join(tempDir, 'query.sql');
  try {
    await writeFile(file, sql, 'utf8');
    const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--file', file], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) throw new Error(`Linked SQL failed: ${result.stderr || result.stdout}`);
    if (!parse) return null;
    return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function queryLinkedRows(sql) {
  const parsed = await runLinkedSql(sql, true);
  return parsed?.rows || [];
}

async function loadFixture(supabase) {
  const { data: league, error: leagueError } = await supabase.from('fantasy_leagues').select('id,name').eq('name', QA_LEAGUE_NAME).maybeSingle();
  if (leagueError || !league) throw new Error(`QA league not found: ${leagueError?.message || 'missing row'}`);
  const { data: season, error: seasonError } = await supabase.from('league_seasons').select('id,trade_deadline_at').eq('league_id', league.id).eq('is_current', true).maybeSingle();
  if (seasonError || !season) throw new Error(`Current QA season not found: ${seasonError?.message || 'missing row'}`);
  const { data: sfs, error: sfError } = await supabase
    .from('season_franchises')
    .select('id,franchise_id,draft_position,franchises(name,abbreviation)')
    .eq('league_season_id', season.id)
    .order('draft_position');
  if (sfError || !sfs?.length) throw new Error(`Season franchises not found: ${sfError?.message || 'missing rows'}`);
  const actors = new Map(sfs.map((sf) => [QA_ACTORS[sf.draft_position - 1].label, sf]));
  return { league, season, sfs, actors };
}

async function activeRoster(supabase, seasonFranchiseId) {
  const { data, error } = await supabase
    .from('roster_entries')
    .select('id,season_franchise_id,athlete_id,real_team_id,athletes(display_name,position),real_teams(display_name,abbreviation)')
    .eq('season_franchise_id', seasonFranchiseId)
    .is('dropped_at', null)
    .order('added_at');
  if (error || !data) throw new Error(`Roster load failed: ${error?.message || 'missing roster'}`);
  return data;
}

function rowName(row) {
  if (row.real_team_id) {
    const team = Array.isArray(row.real_teams) ? row.real_teams[0] : row.real_teams;
    return `${team?.abbreviation || team?.display_name || 'Team'} D/ST`;
  }
  const athlete = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes;
  return `${athlete?.display_name || 'Athlete'} ${athlete?.position || ''}`.trim();
}

function positionOf(row) {
  if (row.real_team_id) return 'DST';
  const athlete = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes;
  return athlete?.position || '';
}

async function capture(storageActor, url, filename, viewport) {
  const storageState = join(process.cwd(), '.auth', `${storageActor}.json`);
  if (!existsSync(storageState)) return { path: null, consoleErrors: ['auth storage missing'], networkFailures: [] };
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState, viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const networkFailures = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) networkFailures.push(`${response.request().method()} ${response.status()} ${response.url()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const screenshot = `screenshots/${filename}`;
  await page.screenshot({ path: join(artifactDir, screenshot), fullPage: true });
  const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
  await context.close();
  await browser.close();
  return { path: screenshot, consoleErrors, networkFailures, bodyText };
}

runDraftBaseline();
await mkdir(screenshotDir, { recursive: true });

const sessions = await signInActors();
const commissioner = sessions.get('Commissioner').supabase;
const fixture = await loadFixture(commissioner);
const weakManager = sessions.get('Manager09').supabase;
const contender = sessions.get('Manager03').supabase;
const weakSf = fixture.actors.get('Manager09');
const contenderSf = fixture.actors.get('Manager03');
if (!weakSf || !contenderSf) throw new Error('Required audit actors missing');

await runLinkedSql(`update public.league_seasons set trade_deadline_at = now() - interval '5 seconds' where id = '${fixture.season.id}'::uuid;`);

const roster = await activeRoster(weakManager, weakSf.id);
const protectedCandidatePositions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE'];
const selectedDrops = [];
const usedRows = new Set();
for (const position of protectedCandidatePositions) {
  const row = roster.find((candidate) => positionOf(candidate) === position && !usedRows.has(candidate.id));
  if (!row) throw new Error(`Manager09 roster lacks ${position} candidate for dump audit`);
  usedRows.add(row.id);
  selectedDrops.push(row);
}

const { data: rosteredRows, error: rosteredError } = await commissioner.from('roster_entries').select('athlete_id').is('dropped_at', null);
if (rosteredError) throw new Error(`Rostered lookup failed: ${rosteredError.message}`);
const rosteredAthleteIds = new Set((rosteredRows || []).map((row) => row.athlete_id).filter(Boolean));
const { data: replacementPool, error: replacementError } = await commissioner
  .from('athletes')
  .select('id,display_name,position')
  .eq('active', true)
  .eq('position', 'WR')
  .order('display_name')
  .limit(1000);
if (replacementError || !replacementPool?.length) throw new Error(`Replacement pool failed: ${replacementError?.message || 'missing rows'}`);
const replacements = replacementPool.filter((athlete) => !rosteredAthleteIds.has(athlete.id)).slice(0, selectedDrops.length);
if (replacements.length < selectedDrops.length) throw new Error('Not enough undrafted replacements to audit bulk dumping');

const dropResults = [];
for (let index = 0; index < selectedDrops.length; index += 1) {
  const drop = selectedDrops[index];
  const replacement = replacements[index];
  const { data, error } = await weakManager.rpc('claim_free_agent', {
    p_season_franchise_id: weakSf.id,
    p_athlete_id: replacement.id,
    p_real_team_id: null,
    p_drop_roster_entry_id: drop.id,
  });
  dropResults.push({ drop, replacement, allowed: !error, error: error?.message || null, newRosterEntryId: data || null });
}

const allowedDrops = dropResults.filter((result) => result.allowed);
const [dumpState] = await queryLinkedRows(`
select
  count(*) filter (where re.dropped_at is not null and re.season_franchise_id='${weakSf.id}'::uuid) as weak_dropped_total,
  count(wh.id) filter (where wh.status='open') as open_waiver_holds
from public.roster_entries re
left join public.waiver_holds wh on wh.source_roster_entry_id=re.id
where re.season_franchise_id='${weakSf.id}'::uuid;
`);

const contenderDrops = await activeRoster(contender, contenderSf.id);
const waiverClaimResults = [];
for (let index = 0; index < allowedDrops.length; index += 1) {
  const drop = allowedDrops[index].drop;
  const [hold] = await queryLinkedRows(`select id from public.waiver_holds where source_roster_entry_id='${drop.id}'::uuid order by starts_at desc limit 1;`);
  if (!hold?.id) throw new Error(`Waiver hold missing for dumped asset ${drop.id}`);
  const contenderDrop = contenderDrops[index];
  const { error } = await contender.rpc('submit_waiver_claim', {
    p_waiver_hold_id: hold.id,
    p_season_franchise_id: contenderSf.id,
    p_drop_roster_entry_id: contenderDrop.id,
  });
  waiverClaimResults.push({ holdId: hold.id, allowed: !error, error: error?.message || null });
}

await runLinkedSql(`
update public.waiver_holds set clears_at = now() - interval '5 seconds' where league_season_id='${fixture.season.id}'::uuid and status='open';
select public.process_due_waivers('${fixture.season.id}'::uuid);
`);
const [claimState] = await queryLinkedRows(`
select
  count(*) filter (where wc.season_franchise_id='${contenderSf.id}'::uuid and wc.status='won') as contender_won_claims,
  count(*) filter (where wh.claimed_by_season_franchise_id='${contenderSf.id}'::uuid and wh.status='claimed') as contender_claimed_holds
from public.waiver_claims wc
join public.waiver_holds wh on wh.id=wc.waiver_hold_id
where wh.league_season_id='${fixture.season.id}'::uuid;
`);

const weakCapture = await capture('Manager09', `${appUrl}/franchises/${weakSf.franchise_id}/team?week=1`, '30-manager09-post-deadline-dump-desktop.png', { width: 1440, height: 900 });
const contenderCapture = await capture('Manager03', `${appUrl}/franchises/${contenderSf.franchise_id}/team?week=1`, '31-manager03-post-dump-claims-mobile.png', { width: 390, height: 844 });
const playersCapture = await capture('Manager03', `${appUrl}/leagues/${fixture.league.id}/players?position=WR`, '32-manager03-player-pool-after-dump-desktop.png', { width: 1440, height: 900 });
const captures = [weakCapture, contenderCapture, playersCapture];

const exploitSucceeded = allowedDrops.length >= 6 && Number(claimState?.contender_won_claims || 0) >= 6;

const markdown = [
  '# Roster Integrity Audit',
  '',
  `Run: ${runId}`,
  `League: ${fixture.league.id}`,
  `Season: ${fixture.season.id}`,
  '',
  '## Scenario',
  'Manager09 attempts to drop six high-value roster assets after the trade deadline by claiming replacement free agents. Manager03 then claims the dumped assets from waivers.',
  '',
  '## Current-System Result',
  `- Post-deadline protected/core drop blocking exists: false`,
  `- Bulk-dump blocking exists: false`,
  `- Drops attempted: ${dropResults.length}`,
  `- Drops allowed: ${allowedDrops.length}`,
  `- Waiver holds opened from dropped assets: ${dumpState?.open_waiver_holds ?? 'unknown'}`,
  `- Manager03 waiver claims submitted: ${waiverClaimResults.filter((result) => result.allowed).length}`,
  `- Manager03 waiver claims won: ${claimState?.contender_won_claims ?? 'unknown'}`,
  `- Exploit succeeded: ${exploitSucceeded}`,
  '',
  '## Dropped Assets',
  ...dropResults.map((result, index) => `- ${index + 1}. ${rowName(result.drop)} -> ${result.allowed ? 'ALLOWED' : `BLOCKED: ${result.error}`}`),
  '',
  '## Evidence',
  `- RI-001 Manager09 post-deadline roster desktop: ${weakCapture.path}`,
  `- RI-002 Manager03 post-claim roster mobile: ${contenderCapture.path}`,
  `- RI-003 Manager03 player pool desktop: ${playersCapture.path}`,
  '',
  '## Interpretation',
  exploitSucceeded
    ? '- PROVEN: The current anti-dumping design controls redistribution but does not prevent post-deadline bulk dumping from succeeding when another manager claims the dumped assets.'
    : '- UNVERIFIED/INCONCLUSIVE: The attempted dump did not fully succeed; inspect errors above before drawing a product conclusion.',
  '- PROPOSED Roster Integrity Mode remains unimplemented in this run. This audit is the baseline failing case for any future implementation.',
  '',
  '## Console / Network',
  ...captures.flatMap((item, index) => [
    `- Capture ${index + 1} console: ${item.consoleErrors.length ? item.consoleErrors.map((error) => error.slice(0, 300).replaceAll('\n', ' ')).join(' | ') : 'None'}`,
    `- Capture ${index + 1} network: ${item.networkFailures.length ? item.networkFailures.join(' | ') : 'None'}`,
  ]),
  '',
];

await writeFile(join(artifactDir, 'ROSTER_INTEGRITY_AUDIT.md'), markdown.join('\n'), 'utf8');
if (!exploitSucceeded) process.exit(1);
console.log(`Roster integrity audit complete for ${fixture.league.id}. Evidence: qa-artifacts/${runId}/ROSTER_INTEGRITY_AUDIT.md`);
