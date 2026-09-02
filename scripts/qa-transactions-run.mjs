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
const runId = process.env.QA_RUN_ID || `${new Date().toISOString().slice(0, 10)}_transactions`;
const artifactDir = join(process.cwd(), 'qa-artifacts', runId);
const screenshotDir = join(artifactDir, 'screenshots');

if (!password) {
  console.error('QA_AUTH_PASSWORD is required. It must stay local and ignored.');
  process.exit(1);
}

function client() {
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
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

function positionOf(row) {
  if (row.real_team_id) return 'DST';
  const athlete = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes;
  return athlete?.position || '';
}

function pickByPosition(roster, position, used = new Set()) {
  const row = roster.find((item) => positionOf(item) === position && !used.has(item.id));
  if (!row) throw new Error(`No ${position} asset available on roster`);
  used.add(row.id);
  return row;
}

function assetArgs(row, prefix) {
  return {
    [`${prefix}_athlete_ids`]: row.athlete_id ? [row.athlete_id] : [],
    [`${prefix}_team_ids`]: row.real_team_id ? [row.real_team_id] : [],
  };
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

function rpcOk(result, label) {
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  return result.data;
}

await mkdir(screenshotDir, { recursive: true });
const sessions = await signInActors();
const commissioner = sessions.get('Commissioner').supabase;
const fixture = await loadFixture(commissioner);

const manager01 = sessions.get('Manager01').supabase;
const manager02 = sessions.get('Manager02').supabase;
const manager03 = sessions.get('Manager03').supabase;
const manager07 = sessions.get('Manager07').supabase;
const manager09 = sessions.get('Manager09').supabase;
const sf01 = fixture.actors.get('Manager01');
const sf02 = fixture.actors.get('Manager02');
const sf03 = fixture.actors.get('Manager03');
const sf07 = fixture.actors.get('Manager07');
const sf09 = fixture.actors.get('Manager09');
if (!sf01 || !sf02 || !sf03 || !sf07 || !sf09) throw new Error('Required QA actor franchises missing');

const roster01 = await activeRoster(manager01, sf01.id);
const usedLineupRows = new Set();
const lineupSlots = [
  ['QB', 1, pickByPosition(roster01, 'QB', usedLineupRows)],
  ['RB', 1, pickByPosition(roster01, 'RB', usedLineupRows)],
  ['RB', 2, pickByPosition(roster01, 'RB', usedLineupRows)],
  ['WR', 1, pickByPosition(roster01, 'WR', usedLineupRows)],
  ['WR', 2, pickByPosition(roster01, 'WR', usedLineupRows)],
  ['TE', 1, pickByPosition(roster01, 'TE', usedLineupRows)],
  ['FLEX', 1, pickByPosition(roster01, 'WR', usedLineupRows)],
  ['K', 1, pickByPosition(roster01, 'K', usedLineupRows)],
  ['DST', 1, pickByPosition(roster01, 'DST', usedLineupRows)],
];
for (const [slot, slotIndex, asset] of lineupSlots) {
  rpcOk(await manager01.rpc('set_lineup_slot', {
    p_season_franchise_id: sf01.id,
    p_week: 1,
    p_slot: slot,
    p_slot_index: slotIndex,
    p_athlete_id: asset.athlete_id,
    p_real_team_id: asset.real_team_id,
  }), `set lineup ${slot}${slotIndex}`);
}
const unauthorizedLineup = await manager02.rpc('set_lineup_slot', {
  p_season_franchise_id: sf01.id,
  p_week: 1,
  p_slot: 'QB',
  p_slot_index: 1,
  p_athlete_id: lineupSlots[0][2].athlete_id,
  p_real_team_id: null,
});
if (!unauthorizedLineup.error) throw new Error('Manager02 was allowed to set Manager01 lineup');

const { data: lineupRows, error: lineupError } = await manager01.from('lineups').select('id').eq('season_franchise_id', sf01.id).eq('week', 1);
if (lineupError || lineupRows?.length !== 9) throw new Error(`Lineup verification failed: ${lineupError?.message || lineupRows?.length}`);

const currentRosterIds = new Set((await commissioner.from('roster_entries').select('athlete_id').is('dropped_at', null)).data?.map((row) => row.athlete_id).filter(Boolean));
const { data: freeAgents, error: freeAgentError } = await commissioner.from('athletes').select('id,display_name,position').eq('active', true).eq('position', 'WR').order('display_name').limit(1000);
if (freeAgentError || !freeAgents?.length) throw new Error(`Free agent lookup failed: ${freeAgentError?.message || 'missing rows'}`);
const freeAgent = freeAgents.find((athlete) => !currentRosterIds.has(athlete.id));
if (!freeAgent) throw new Error('No undrafted WR free agent available');
const manager01BenchDrop = roster01.find((row) => !usedLineupRows.has(row.id) && positionOf(row) === 'WR') || roster01.find((row) => !usedLineupRows.has(row.id));
if (!manager01BenchDrop) throw new Error('No Manager01 bench asset available to drop');
rpcOk(await manager01.rpc('claim_free_agent', {
  p_season_franchise_id: sf01.id,
  p_athlete_id: freeAgent.id,
  p_real_team_id: null,
  p_drop_roster_entry_id: manager01BenchDrop.id,
}), 'claim free agent');

const { data: hold, error: holdError } = await commissioner
  .from('waiver_holds')
  .select('id,athlete_id,status')
  .eq('league_season_id', fixture.season.id)
  .eq('source_roster_entry_id', manager01BenchDrop.id)
  .maybeSingle();
if (holdError || !hold) throw new Error(`Waiver hold for dropped asset not found: ${holdError?.message || 'missing row'}`);

const roster02 = await activeRoster(manager02, sf02.id);
const roster09 = await activeRoster(manager09, sf09.id);
rpcOk(await manager02.rpc('submit_waiver_claim', { p_waiver_hold_id: hold.id, p_season_franchise_id: sf02.id, p_drop_roster_entry_id: roster02[0].id }), 'Manager02 waiver claim');
rpcOk(await manager09.rpc('submit_waiver_claim', { p_waiver_hold_id: hold.id, p_season_franchise_id: sf09.id, p_drop_roster_entry_id: roster09[0].id }), 'Manager09 waiver claim');
await runLinkedSql(`update public.waiver_holds set clears_at = now() - interval '5 seconds' where id = '${hold.id}'::uuid; select public.process_due_waivers('${fixture.season.id}'::uuid);`);
const { data: resolvedClaims, error: claimsError } = await commissioner.from('waiver_claims').select('season_franchise_id,status,priority_rank').eq('waiver_hold_id', hold.id).order('priority_rank');
if (claimsError || !resolvedClaims?.some((claim) => claim.season_franchise_id === sf09.id && claim.status === 'won')) {
  throw new Error(`Waiver priority verification failed: ${claimsError?.message || JSON.stringify(resolvedClaims)}`);
}

const roster03 = await activeRoster(manager03, sf03.id);
const roster07 = await activeRoster(manager07, sf07.id);
const offerAsset = pickByPosition(roster03, 'WR');
const requestAsset = pickByPosition(roster07, 'RB');
const invalidTrade = await manager02.rpc('create_trade_proposal', {
  p_league_season_id: fixture.season.id,
  p_to_season_franchise_id: sf07.id,
  p_offer_athlete_ids: offerAsset.athlete_id ? [offerAsset.athlete_id] : [],
  p_request_athlete_ids: [],
  p_offer_team_ids: offerAsset.real_team_id ? [offerAsset.real_team_id] : [],
  p_request_team_ids: [],
});
if (!invalidTrade.error) throw new Error('Manager02 was allowed to offer Manager03 asset');
const trade = rpcOk(await manager03.rpc('create_trade_proposal', {
  p_league_season_id: fixture.season.id,
  p_to_season_franchise_id: sf07.id,
  ...assetArgs(offerAsset, 'p_offer'),
  ...assetArgs(requestAsset, 'p_request'),
}), 'create private trade');
const tradeId = trade.trade_id;
rpcOk(await manager03.rpc('post_trade_message', { p_trade_id: tradeId, p_body: 'QA private negotiation: Manager03 offers a WR for Manager07 RB.' }), 'post trade message');
const unauthorizedMessage = await manager02.rpc('post_trade_message', { p_trade_id: tradeId, p_body: 'QA unauthorized manager should not post this.' });
if (!unauthorizedMessage.error) throw new Error('Manager02 was allowed to post to a private trade');
const { data: outsiderMessages, error: outsiderMessagesError } = await manager02.from('trade_messages').select('id,body').eq('trade_id', tradeId);
if (outsiderMessagesError) throw new Error(`Outsider trade message read errored instead of denying rows: ${outsiderMessagesError.message}`);
if ((outsiderMessages || []).length !== 0) throw new Error('Manager02 could read private trade messages');
rpcOk(await manager07.rpc('resolve_trade', { p_trade_id: tradeId, p_action: 'accept' }), 'accept trade');
const [acceptedTrade] = await queryLinkedRows(`select status from public.trades where id='${tradeId}'::uuid;`);
if (acceptedTrade?.status !== 'accepted') throw new Error(`Trade accept verification failed: ${acceptedTrade?.status}`);
const [tradeMovement] = await queryLinkedRows(`
select
  exists(select 1 from public.roster_entries where season_franchise_id='${sf07.id}'::uuid and dropped_at is null and athlete_id ${offerAsset.athlete_id ? `= '${offerAsset.athlete_id}'::uuid` : 'is null'} and real_team_id ${offerAsset.real_team_id ? `= '${offerAsset.real_team_id}'::uuid` : 'is null'}) as offer_moved,
  exists(select 1 from public.roster_entries where season_franchise_id='${sf03.id}'::uuid and dropped_at is null and athlete_id ${requestAsset.athlete_id ? `= '${requestAsset.athlete_id}'::uuid` : 'is null'} and real_team_id ${requestAsset.real_team_id ? `= '${requestAsset.real_team_id}'::uuid` : 'is null'}) as request_moved;
`);
const offerMoved = !!tradeMovement?.offer_moved;
const requestMoved = !!tradeMovement?.request_moved;
if (!offerMoved || !requestMoved) throw new Error('Accepted trade did not move both assets');

await runLinkedSql(`update public.league_seasons set trade_deadline_at = now() - interval '5 seconds' where id = '${fixture.season.id}'::uuid;`);
const deadlineTrade = await sessions.get('Manager04').supabase.rpc('create_trade_proposal', {
  p_league_season_id: fixture.season.id,
  p_to_season_franchise_id: sf07.id,
  p_offer_athlete_ids: [],
  p_request_athlete_ids: [],
  p_offer_team_ids: [],
  p_request_team_ids: [],
});
const deadlineRejected = !!deadlineTrade.error && /deadline/i.test(deadlineTrade.error.message);
await runLinkedSql(`update public.league_seasons set trade_deadline_at = timestamptz '2026-11-10 21:00:00+00' where id = '${fixture.season.id}'::uuid;`);
if (!deadlineRejected) throw new Error('Trade deadline rejection was not proven');

const teamCapture = await capture('Manager01', `${appUrl}/franchises/${sf01.franchise_id}/team?week=1`, '20-manager01-lineup-desktop.png', { width: 1440, height: 900 });
const playersCapture = await capture('Manager09', `${appUrl}/leagues/${fixture.league.id}/players?position=WR`, '21-manager09-free-agency-mobile.png', { width: 390, height: 844 });
const tradeSenderCapture = await capture('Manager03', `${appUrl}/trades/${tradeId}`, '22-manager03-private-trade-desktop.png', { width: 1440, height: 900 });
const tradeRecipientCapture = await capture('Manager07', `${appUrl}/trades/${tradeId}`, '23-manager07-private-trade-mobile.png', { width: 390, height: 844 });
const tradeOutsiderCapture = await capture('Manager02', `${appUrl}/trades/${tradeId}`, '24-manager02-private-trade-denied-desktop.png', { width: 1440, height: 900 });
const captures = [teamCapture, playersCapture, tradeSenderCapture, tradeRecipientCapture, tradeOutsiderCapture];

const markdown = [
  '# Transactions QA',
  '',
  `Run: ${runId}`,
  `League: ${fixture.league.id}`,
  `Season: ${fixture.season.id}`,
  '',
  '## Result',
  `- Manager01 lineup slots set: ${lineupRows.length}`,
  `- Manager02 blocked from Manager01 lineup: ${!!unauthorizedLineup.error}`,
  `- Manager01 free-agent add/drop created waiver hold: ${hold.id}`,
  `- Waiver winner: ${sf09.id}`,
  `- Waiver claims: ${JSON.stringify(resolvedClaims)}`,
  `- Manager02 invalid asset trade rejected: ${!!invalidTrade.error}`,
  `- Private trade ID: ${tradeId}`,
  `- Manager02 private message post rejected: ${!!unauthorizedMessage.error}`,
  `- Manager02 private message read count: ${(outsiderMessages || []).length}`,
  `- Accepted trade status: ${acceptedTrade.status}`,
  `- Accepted trade moved offered asset to Manager07: ${offerMoved}`,
  `- Accepted trade moved requested asset to Manager03: ${requestMoved}`,
  `- Trade deadline rejected new trade: ${deadlineRejected}`,
  '',
  '## Evidence',
  `- TM-001 Manager01 lineup desktop: ${teamCapture.path}`,
  `- TM-002 Manager09 free agency mobile: ${playersCapture.path}`,
  `- TM-003 Manager03 private trade desktop: ${tradeSenderCapture.path}`,
  `- TM-004 Manager07 private trade mobile: ${tradeRecipientCapture.path}`,
  `- TM-005 Manager02 private trade denied desktop: ${tradeOutsiderCapture.path}`,
  '',
  '## Console / Network',
  ...captures.flatMap((item, index) => [
    `- Capture ${index + 1} console: ${item.consoleErrors.length ? item.consoleErrors.map((error) => error.slice(0, 300).replaceAll('\n', ' ')).join(' | ') : 'None'}`,
    `- Capture ${index + 1} network: ${item.networkFailures.length ? item.networkFailures.join(' | ') : 'None'}`,
  ]),
  '',
];
await writeFile(join(artifactDir, 'TRANSACTIONS_QA.md'), markdown.join('\n'), 'utf8');
console.log(`Transactions QA complete for ${fixture.league.id}. Evidence: qa-artifacts/${runId}/TRANSACTIONS_QA.md`);
