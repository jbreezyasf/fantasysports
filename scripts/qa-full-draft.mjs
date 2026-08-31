#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
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
const runId = process.env.QA_RUN_ID || `${new Date().toISOString().slice(0, 10)}_full-draft`;
const artifactDir = join(process.cwd(), 'qa-artifacts', runId);
const screenshotDir = join(artifactDir, 'screenshots');

if (!password) {
  console.error('QA_AUTH_PASSWORD is required. It must stay local and ignored.');
  process.exit(1);
}

function runReset() {
  const result = spawnSync('npm', ['run', 'qa:league:reset'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stderr.write(result.stdout);
    process.exit(result.status ?? 1);
  }
}

async function runLinkedSql(sql) {
  const tempDir = await mkdtemp(join(tmpdir(), 'big-exec-qa-sql-'));
  const file = join(tempDir, 'query.sql');
  try {
    await writeFile(file, sql, 'utf8');
    const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--file', file], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      throw new Error(`Linked SQL failed: ${result.stderr || result.stdout}`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
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

async function loadFixture(supabase) {
  const { data: league, error: leagueError } = await supabase.from('fantasy_leagues').select('id,name').eq('name', QA_LEAGUE_NAME).maybeSingle();
  if (leagueError || !league) throw new Error(`QA league not found: ${leagueError?.message || 'missing row'}`);
  const { data: season, error: seasonError } = await supabase.from('league_seasons').select('id').eq('league_id', league.id).eq('is_current', true).maybeSingle();
  if (seasonError || !season) throw new Error(`Current QA season not found: ${seasonError?.message || 'missing row'}`);
  const { data: draft, error: draftError } = await supabase.from('drafts').select('id,status,current_pick').eq('league_season_id', season.id).maybeSingle();
  if (draftError || !draft) throw new Error(`Current QA draft not found: ${draftError?.message || 'missing row'}`);
  const { data: sfs, error: sfError } = await supabase
    .from('season_franchises')
    .select('id,franchise_id,draft_position,franchises(name,abbreviation)')
    .eq('league_season_id', season.id)
    .order('draft_position');
  if (sfError || !sfs?.length) throw new Error(`Season franchises not found: ${sfError?.message || 'missing rows'}`);
  return { league, season, draft, sfs };
}

async function loadDraftPool(supabase) {
  const { data: athletes, error } = await supabase
    .from('athletes')
    .select('id,display_name,position')
    .eq('active', true)
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K'])
    .order('position')
    .order('display_name')
    .limit(1000);
  if (error || !athletes) throw new Error(`Draft pool failed: ${error?.message || 'missing rows'}`);
  const byPosition = new Map();
  for (const athlete of athletes) {
    if (!byPosition.has(athlete.position)) byPosition.set(athlete.position, []);
    byPosition.get(athlete.position).push(athlete);
  }
  for (const [position, required] of [['QB', 20], ['RB', 40], ['WR', 50], ['TE', 20], ['K', 10]]) {
    if ((byPosition.get(position)?.length || 0) < required) throw new Error(`Draft pool too small at ${position}: ${byPosition.get(position)?.length || 0}`);
  }
  const { data: defenses, error: defenseError } = await supabase
    .from('real_teams')
    .select('id,display_name,abbreviation')
    .eq('active', true)
    .order('abbreviation')
    .limit(64);
  if (defenseError || !defenses || defenses.length < 10) throw new Error(`D/ST pool too small: ${defenseError?.message || defenses?.length || 0}`);
  return { byPosition, defenses };
}

function actorForSeasonFranchise(sfs, seasonFranchiseId) {
  const sf = sfs.find((row) => row.id === seasonFranchiseId);
  if (!sf) throw new Error(`No actor mapping for season franchise ${seasonFranchiseId}`);
  return QA_ACTORS[sf.draft_position - 1].label;
}

async function capture(storageActor, url, filename, viewport) {
  const storageState = join(process.cwd(), '.auth', `${storageActor}.json`);
  if (!existsSync(storageState)) return { skipped: true, path: null };
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
  await context.close();
  await browser.close();
  return { skipped: false, path: screenshot, consoleErrors, networkFailures };
}

runReset();
await mkdir(screenshotDir, { recursive: true });

const sessions = await signInActors();
const commissioner = sessions.get('Commissioner').supabase;
const fixture = await loadFixture(commissioner);
const pool = await loadDraftPool(commissioner);
const beforeDesktop = await capture('Commissioner', `${appUrl}/drafts/${fixture.draft.id}`, '10-commissioner-draft-before-start-desktop.png', { width: 1440, height: 900 });
const beforeMobile = await capture('Manager04', `${appUrl}/drafts/${fixture.draft.id}`, '11-manager04-draft-before-start-mobile.png', { width: 390, height: 844 });

const { error: startError } = await commissioner.rpc('start_draft', { p_draft_id: fixture.draft.id });
if (startError) throw new Error(`start_draft failed: ${startError.message}`);

const usedAthletes = new Set();
const usedTeams = new Set();
let autoPickTriggered = false;
let duplicateRejected = false;
let pauseResumeProven = false;
let undoProven = false;
let pickCount = 0;

const rosterPlan = ['QB','RB','WR','TE','RB','WR','K','DST','WR','RB','TE','QB','WR','RB','WR'];
const rosterProgress = new Map(QA_ACTORS.map((actor) => [actor.label, 0]));
const nextAssetForActor = (actorLabel) => {
  const index = rosterProgress.get(actorLabel) || 0;
  const position = rosterPlan[index];
  if (!position) throw new Error(`Roster plan exhausted for ${actorLabel}`);
  if (position === 'DST') {
    const team = pool.defenses.find((candidate) => !usedTeams.has(candidate.id));
    if (!team) throw new Error('No unused D/ST available for pick');
    return { type: 'team', id: team.id, label: `${team.abbreviation || team.display_name} D/ST`, position };
  }
  const athlete = pool.byPosition.get(position)?.find((candidate) => !usedAthletes.has(candidate.id));
  if (!athlete) throw new Error(`No unused ${position} available for pick`);
  return { type: 'athlete', id: athlete.id, label: athlete.display_name, position };
};
const markUsed = (asset, actorLabel) => {
  if (asset.type === 'team') usedTeams.add(asset.id);
  else usedAthletes.add(asset.id);
  rosterProgress.set(actorLabel, (rosterProgress.get(actorLabel) || 0) + 1);
};
const unmarkUsed = (asset, actorLabel) => {
  if (asset.type === 'team') usedTeams.delete(asset.id);
  else usedAthletes.delete(asset.id);
  rosterProgress.set(actorLabel, Math.max(0, (rosterProgress.get(actorLabel) || 1) - 1));
};

while (true) {
  const { data: draft, error: draftError } = await commissioner.from('drafts').select('status,current_pick').eq('id', fixture.draft.id).maybeSingle();
  if (draftError || !draft) throw new Error(`Draft state failed: ${draftError?.message || 'missing draft'}`);
  if (draft.status === 'completed') break;
  const { data: pick, error: pickError } = await commissioner
    .from('draft_picks')
    .select('pick_number,season_franchise_id')
    .eq('draft_id', fixture.draft.id)
    .eq('pick_number', draft.current_pick)
    .maybeSingle();
  if (pickError || !pick) throw new Error(`Current pick failed: ${pickError?.message || 'missing pick'}`);
  const actorLabel = actorForSeasonFranchise(fixture.sfs, pick.season_franchise_id);
  const actorClient = sessions.get(actorLabel).supabase;

  if (!pauseResumeProven && draft.current_pick === 3) {
    const { error: pauseError } = await commissioner.rpc('pause_draft', { p_draft_id: fixture.draft.id });
    if (pauseError) throw new Error(`pause_draft failed: ${pauseError.message}`);
    const pausedAsset = nextAssetForActor(actorLabel);
    const { error: pausedPickError } = await actorClient.rpc('make_draft_pick', {
      p_draft_id: fixture.draft.id,
      p_athlete_id: pausedAsset.type === 'athlete' ? pausedAsset.id : null,
      p_real_team_id: pausedAsset.type === 'team' ? pausedAsset.id : null,
      p_auto: false,
    });
    if (!pausedPickError) throw new Error('Paused draft accepted a manager pick');
    const { error: resumeError } = await commissioner.rpc('start_draft', { p_draft_id: fixture.draft.id });
    if (resumeError) throw new Error(`resume/start_draft failed: ${resumeError.message}`);
    pauseResumeProven = true;
    continue;
  }

  if (!autoPickTriggered && draft.current_pick === 7) {
    const queuedAsset = nextAssetForActor(actorLabel);
    const { error: queueError } = await actorClient.rpc('add_draft_queue_item', {
      p_draft_id: fixture.draft.id,
      p_athlete_id: queuedAsset.type === 'athlete' ? queuedAsset.id : null,
      p_real_team_id: queuedAsset.type === 'team' ? queuedAsset.id : null,
    });
    if (queueError) throw new Error(`Queue setup for autopick failed: ${queueError.message}`);
    await runLinkedSql(`update public.drafts set current_pick_deadline_at = now() - interval '5 seconds' where id = '${fixture.draft.id}'::uuid;`);
    const { error: autoError } = await commissioner.rpc('process_expired_draft_picks', { p_draft_id: fixture.draft.id, p_limit: 1 });
    if (!autoError) {
      autoPickTriggered = true;
      markUsed(queuedAsset, actorLabel);
      continue;
    }
    throw new Error(`Autopick failed: ${autoError.message}`);
  }

  const asset = nextAssetForActor(actorLabel);
  const { error: pickRpcError } = await actorClient.rpc('make_draft_pick', {
    p_draft_id: fixture.draft.id,
    p_athlete_id: asset.type === 'athlete' ? asset.id : null,
    p_real_team_id: asset.type === 'team' ? asset.id : null,
    p_auto: false,
  });
  if (pickRpcError) throw new Error(`Pick ${draft.current_pick} by ${actorLabel} failed: ${pickRpcError.message}`);
  markUsed(asset, actorLabel);
  pickCount += 1;

  if (!duplicateRejected && draft.current_pick === 1) {
    const nextActorClient = sessions.get('Manager01').supabase;
    const { error: duplicateError } = await nextActorClient.rpc('make_draft_pick', {
      p_draft_id: fixture.draft.id,
      p_athlete_id: asset.type === 'athlete' ? asset.id : null,
      p_real_team_id: asset.type === 'team' ? asset.id : null,
      p_auto: false,
    });
    if (!duplicateError) throw new Error('Duplicate drafted athlete was accepted');
    duplicateRejected = true;
  }

  if (!undoProven && draft.current_pick === 4) {
    const { error: undoError } = await commissioner.rpc('undo_last_draft_pick', { p_draft_id: fixture.draft.id });
    if (undoError) throw new Error(`undo_last_draft_pick failed: ${undoError.message}`);
    unmarkUsed(asset, actorLabel);
    undoProven = true;
  }
}

const afterDesktop = await capture('Commissioner', `${appUrl}/drafts/${fixture.draft.id}`, '12-commissioner-draft-completed-desktop.png', { width: 1440, height: 900 });
const afterMobile = await capture('Manager04', `${appUrl}/drafts/${fixture.draft.id}`, '13-manager04-draft-completed-mobile.png', { width: 390, height: 844 });

const { data: finalDraft } = await commissioner.from('drafts').select('status,current_pick').eq('id', fixture.draft.id).maybeSingle();
const { data: madePicks } = await commissioner.from('draft_picks').select('id,is_auto_pick').eq('draft_id', fixture.draft.id).not('picked_at', 'is', null);
const sfIds = fixture.sfs.map((sf) => sf.id);
const { data: rosterRows } = await commissioner.from('roster_entries').select('season_franchise_id,athlete_id,real_team_id,athletes(position)').in('season_franchise_id', sfIds).is('dropped_at', null);
const rosterCounts = new Map();
const rosterPositionCounts = new Map();
for (const row of rosterRows || []) {
  rosterCounts.set(row.season_franchise_id, (rosterCounts.get(row.season_franchise_id) || 0) + 1);
  if (!rosterPositionCounts.has(row.season_franchise_id)) rosterPositionCounts.set(row.season_franchise_id, { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 });
  const counts = rosterPositionCounts.get(row.season_franchise_id);
  if (row.real_team_id) counts.DST += 1;
  else {
    const athlete = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes;
    if (athlete?.position && counts[athlete.position] !== undefined) counts[athlete.position] += 1;
  }
}
const completeRosters = fixture.sfs.every((sf) => rosterCounts.get(sf.id) === 15);
const legalRosters = fixture.sfs.every((sf) => {
  const counts = rosterPositionCounts.get(sf.id);
  return counts && counts.QB >= 1 && counts.RB >= 2 && counts.WR >= 2 && counts.TE >= 1 && counts.K >= 1 && counts.DST >= 1;
});

const markdown = [
  '# Full Draft QA',
  '',
  `Run: ${runId}`,
  `League: ${fixture.league.id}`,
  `Season: ${fixture.season.id}`,
  `Draft: ${fixture.draft.id}`,
  '',
  '## Result',
  `- Draft status: ${finalDraft?.status || 'unknown'}`,
  `- Manual picks submitted by actor sessions: ${pickCount}`,
  `- Total made picks: ${madePicks?.length || 0}`,
  `- Auto-pick observed: ${(madePicks || []).some((pick) => pick.is_auto_pick)}`,
  `- Duplicate drafted asset rejected: ${duplicateRejected}`,
  `- Pause/resume rejected picks while paused and resumed cleanly: ${pauseResumeProven}`,
  `- Commissioner undo/correction executed: ${undoProven}`,
  `- Every franchise has 15 active roster entries: ${completeRosters}`,
  `- Every franchise has legal starter-position coverage: ${legalRosters}`,
  '',
  '## Evidence',
  `- DRAFT-001 Commissioner desktop before start: ${beforeDesktop.path || 'skipped'}`,
  `- DRAFT-002 Manager04 mobile before start: ${beforeMobile.path || 'skipped'}`,
  `- DRAFT-003 Commissioner desktop completed: ${afterDesktop.path || 'skipped'}`,
  `- DRAFT-004 Manager04 mobile completed: ${afterMobile.path || 'skipped'}`,
  '',
  '## Console / Network',
  ...[beforeDesktop, beforeMobile, afterDesktop, afterMobile].flatMap((item, index) => [
    `- Capture ${index + 1} console: ${item.consoleErrors?.length ? item.consoleErrors.map((error) => error.slice(0, 300).replaceAll('\n', ' ')).join(' | ') : 'None'}`,
    `- Capture ${index + 1} network: ${item.networkFailures?.length ? item.networkFailures.join(' | ') : 'None'}`,
  ]),
  '',
];

await writeFile(join(artifactDir, 'DRAFT_QA.md'), markdown.join('\n'), 'utf8');

if (finalDraft?.status !== 'completed' || (madePicks?.length || 0) !== 150 || !completeRosters || !legalRosters || !(madePicks || []).some((pick) => pick.is_auto_pick) || !duplicateRejected || !pauseResumeProven || !undoProven) {
  process.exit(1);
}

console.log(`Full draft QA complete for ${fixture.draft.id}. Evidence: qa-artifacts/${runId}/DRAFT_QA.md`);
