#!/usr/bin/env node
/**
 * Gate 1 realtime + reconnect draft QA.
 *
 * The 2026-08-30 full-draft runs proved picking, autopick, duplicate rejection,
 * pause/resume, undo, and legal rosters, but drove every pick through RPC in a
 * single process. Two Gate 1 criteria were left unproven:
 *
 *   - realtime pick propagation between concurrently connected clients;
 *   - reconnect/recovery after a dropped draft-room connection.
 *
 * This run opens real browser clients and proves both.
 *
 * The draft room subscribes to postgres_changes AND keeps a 15s polling
 * fallback, so a propagation assertion that allowed 15s would pass on polling
 * alone. Realtime propagation is therefore asserted inside REALTIME_BUDGET_MS,
 * comfortably under that fallback. Reconnect recovery is allowed the longer
 * budget, because recovery through the fallback is legitimate recovery.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { QA_ACTORS, QA_LEAGUE_NAME } from './qa-actors.mjs';
import { loadLocalEnv, signInQaActor, resolveQaFixture, qaSupabaseConfig } from './qa-fixture.mjs';

loadLocalEnv();

const REALTIME_BUDGET_MS = 8_000;
const PROPAGATION_CEILING_MS = 60_000;
const RECONNECT_BUDGET_MS = 45_000;
const POLLING_FALLBACK_MS = 15_000;

const { appUrl } = qaSupabaseConfig();
const runId = process.env.QA_RUN_ID || `${new Date().toISOString().slice(0, 10)}_draft-realtime`;
const artifactDir = join(process.cwd(), 'qa-artifacts', runId);
const screenshotDir = join(artifactDir, 'screenshots');

const checks = [];
function record(id, description, status, detail) {
  checks.push({ id, description, status, detail });
  console.log(`[${status}] ${id} ${description}${detail ? ` :: ${detail}` : ''}`);
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });

  // --- sign in every actor -------------------------------------------------
  const sessions = new Map();
  for (const actor of QA_ACTORS) {
    sessions.set(actor.label, await signInQaActor(actor.label));
  }
  const commissioner = sessions.get('Commissioner');

  // --- resolve ids live; never reuse an id from a previous run --------------
  const fixture = await resolveQaFixture(commissioner);
  if (!fixture.draft) throw new Error('QA league has no draft. Run: npm run qa:league:reset');
  const draftId = fixture.draft.id;
  const draftUrl = `${appUrl}/drafts/${draftId}`;

  const { data: sfs, error: sfError } = await commissioner
    .from('season_franchises')
    .select('id,franchise_id,draft_position,franchises(name,abbreviation)')
    .eq('league_season_id', fixture.season.id)
    .order('draft_position');
  if (sfError || !sfs?.length) throw new Error(`Season franchises failed: ${sfError?.message}`);

  const { data: athletes, error: poolError } = await commissioner
    .from('athletes')
    .select('id,display_name,position')
    .eq('active', true)
    .in('position', ['QB', 'RB', 'WR', 'TE'])
    .order('display_name')
    .limit(500);
  if (poolError || !athletes?.length) throw new Error(`Draft pool failed: ${poolError?.message}`);

  const { data: takenRows } = await commissioner
    .from('draft_picks')
    .select('athlete_id')
    .eq('draft_id', draftId)
    .not('athlete_id', 'is', null);
  const taken = new Set((takenRows ?? []).map(row => row.athlete_id));
  const available = athletes.filter(athlete => !taken.has(athlete.id));

  const actorForSf = seasonFranchiseId => {
    const sf = sfs.find(row => row.id === seasonFranchiseId);
    if (!sf) throw new Error(`No actor for season franchise ${seasonFranchiseId}`);
    return QA_ACTORS[sf.draft_position - 1].label;
  };

  async function currentSlot() {
    const { data: draft } = await commissioner
      .from('drafts')
      .select('status,current_pick,current_pick_deadline_at')
      .eq('id', draftId)
      .maybeSingle();
    const { data: slot } = await commissioner
      .from('draft_picks')
      .select('pick_number,round_number,round_pick,season_franchise_id')
      .eq('draft_id', draftId)
      .eq('pick_number', draft.current_pick)
      .maybeSingle();
    return { draft, slot };
  }

  /**
   * The server rejects a pick once the deadline has passed ("Pick clock
   * expired"), which is correct behavior but makes this script order-dependent
   * if a slot goes stale between steps. Advance through any expired slot using
   * the same commissioner RPC the product uses, then return a live slot.
   */
  async function freshSlot() {
    // Deadlines chain forward from the previous deadline rather than from now, so a
    // draft left idle needs many advances to catch up. pick_seconds is 30, so 60
    // attempts covers roughly 30 minutes of idle time.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const state = await currentSlot();
      if (state.draft.status !== 'live') throw new Error(`Draft is ${state.draft.status}, expected live`);
      const deadline = state.draft.current_pick_deadline_at ? new Date(state.draft.current_pick_deadline_at).getTime() : null;
      // Require enough runway that the pick cannot expire mid-assertion.
      if (deadline && deadline - Date.now() > 15_000) return state.slot;
      const { error } = await commissioner.rpc('process_expired_draft_picks', { p_draft_id: draftId, p_limit: 1 });
      if (error) throw new Error(`process_expired_draft_picks failed: ${error.message}`);
    }
    throw new Error('Could not obtain a draft slot with sufficient clock runway');
  }

  // --- start the draft -----------------------------------------------------
  const before = await currentSlot();
  if (before.draft.status !== 'live') {
    const { error } = await commissioner.rpc('start_draft', { p_draft_id: draftId });
    if (error) throw new Error(`start_draft failed: ${error.message}`);
  }
  const started = await currentSlot();
  record('RT-000', 'Draft is live for realtime observation', started.draft.status === 'live' ? 'PASS' : 'FAIL', `status=${started.draft.status}`);

  // --- open two concurrent observers ---------------------------------------
  const browser = await chromium.launch();
  const observers = [];
  for (const [label, actor, viewport] of [
    ['commissioner-desktop', 'Commissioner', { width: 1440, height: 900 }],
    ['manager-mobile', 'Manager05', { width: 390, height: 844 }],
  ]) {
    const storageState = join(process.cwd(), '.auth', `${actor}.json`);
    if (!existsSync(storageState)) throw new Error(`Missing auth state for ${actor}. Run: npm run qa:auth:save`);
    const context = await browser.newContext({ storageState, viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
    await page.goto(draftUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    observers.push({ label, actor, context, page, consoleErrors });
  }

  // Live-state hydration evidence. DraftClock only renders while the draft is
  // live, so this is the first run that exercises it at all.
  await observers[0].page.waitForTimeout(3_000);
  const liveHydration = observers.flatMap(o => o.consoleErrors).filter(text => /hydrat|didn't match|did not match/i.test(text));
  record(
    'RT-001',
    'Live draft room renders with no hydration mismatch (DraftClock present)',
    liveHydration.length === 0 ? 'PASS' : 'FAIL',
    liveHydration.length ? liveHydration[0].slice(0, 200) : 'no hydration warnings on either client'
  );
  const clockVisible = await observers[0].page.locator('.draftClock').count();
  record('RT-002', 'Server-authoritative clock is rendered in the live draft room', clockVisible > 0 ? 'PASS' : 'FAIL', `draftClock nodes=${clockVisible}`);

  // Viewport, not fullPage: the draft room renders the whole player pool inline,
  // so a fullPage capture is ~45,000px tall and unreviewable.
  await observers[0].page.screenshot({ path: join(screenshotDir, '01-live-draft-commissioner-desktop.png') });
  await observers[1].page.screenshot({ path: join(screenshotDir, '02-live-draft-manager-mobile.png') });

  // --- realtime propagation -------------------------------------------------
  async function makePick(slot) {
    const actorLabel = actorForSf(slot.season_franchise_id);
    const asset = available.shift();
    if (!asset) throw new Error('Draft pool exhausted');
    const { error } = await sessions.get(actorLabel).rpc('make_draft_pick', {
      p_draft_id: draftId,
      p_athlete_id: asset.id,
      p_real_team_id: null,
      p_auto: false,
    });
    if (error) throw new Error(`make_draft_pick by ${actorLabel} failed: ${error.message}`);
    return { actorLabel, asset };
  }

  /**
   * Waits for the pick to appear in the RECENT PICKS list.
   *
   * Deliberately not a page-wide text search: the drafted athlete's name is
   * already rendered in the available-player pool before the pick is made, so a
   * text search matches instantly and passes without proving anything. Only the
   * recent-picks entry is created by the pick itself.
   */
  async function waitForPick(page, assetName, budgetMs) {
    const startedAt = Date.now();
    const entry = page.locator(`article[aria-label*="selected ${assetName}"]`);
    try {
      await entry.first().waitFor({ state: 'attached', timeout: budgetMs });
      return Date.now() - startedAt;
    } catch {
      const labels = await page
        .locator('section[aria-labelledby="recent-picks-heading"] article')
        .evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
      console.log(`      [diag] looking for "selected ${assetName}"; recent-picks entries on page: ${JSON.stringify(labels)}`);
      return null;
    }
  }

  const slotOne = await freshSlot();
  const pickOne = await makePick(slotOne);

  // Measure to a generous ceiling, then judge against the strict budget. A pick
  // that lands at 25s is working-but-too-slow, which is a different finding from
  // a pick that never lands at all.
  const propagation = await Promise.all(
    observers.map(async observer => ({
      label: observer.label,
      ms: await waitForPick(observer.page, pickOne.asset.display_name, PROPAGATION_CEILING_MS),
    }))
  );
  const arrived = propagation.every(entry => entry.ms !== null);
  const propagated = arrived && propagation.every(entry => entry.ms < REALTIME_BUDGET_MS);
  record(
    'RT-010',
    `Pick propagates to both connected clients without reload inside ${REALTIME_BUDGET_MS}ms`,
    propagated ? 'PASS' : (arrived ? 'SLOW' : 'FAIL'),
    propagation.map(entry => `${entry.label}=${entry.ms === null ? 'TIMEOUT' : `${entry.ms}ms`}`).join(', ')
  );
  record(
    'RT-011',
    `Propagation beat the ${POLLING_FALLBACK_MS}ms polling fallback, proving realtime rather than polling`,
    arrived && propagation.every(entry => entry.ms < POLLING_FALLBACK_MS) ? 'PASS' : 'FAIL',
    `picked ${pickOne.asset.display_name} as ${pickOne.actorLabel}`
  );

  await observers[0].page.screenshot({ path: join(screenshotDir, '03-after-realtime-pick-desktop.png') });

  // --- reconnect / recovery -------------------------------------------------
  const offline = observers[1];
  await offline.context.setOffline(true);
  record('RT-020', 'Observer connection dropped', 'PASS', `${offline.label} offline`);

  const slotTwo = await freshSlot();
  const pickTwo = await makePick(slotTwo);

  const missedWhileOffline = await waitForPick(offline.page, pickTwo.asset.display_name, 4_000);
  record(
    'RT-021',
    'Offline client does not receive the pick made while disconnected',
    missedWhileOffline === null ? 'PASS' : 'FAIL',
    missedWhileOffline === null ? 'still stale, as expected' : `unexpectedly saw it in ${missedWhileOffline}ms`
  );

  const offlineState = await offline.page.evaluate(() => ({
    url: location.pathname,
    h1: document.querySelector('h1')?.textContent?.trim().slice(0, 60) ?? null,
    recentSection: Boolean(document.querySelector('section[aria-labelledby="recent-picks-heading"]')),
    emptyCopy: document.body.innerText.includes('No picks have been made yet'),
    bodyLength: document.body.innerText.length,
  }));
  record('RT-021b', 'Offline client DOM state while disconnected', 'INFO', JSON.stringify(offlineState));

  await offline.context.setOffline(false);
  const recovered = await waitForPick(offline.page, pickTwo.asset.display_name, RECONNECT_BUDGET_MS);
  record(
    'RT-022',
    `Reconnected client recovers the missed pick inside ${RECONNECT_BUDGET_MS}ms`,
    recovered !== null ? 'PASS' : 'FAIL',
    recovered === null ? 'TIMEOUT' : `recovered in ${recovered}ms`
  );

  const stillOnline = observers[0];
  const onlineSawTwo = await waitForPick(stillOnline.page, pickTwo.asset.display_name, REALTIME_BUDGET_MS);
  record(
    'RT-023',
    'Continuously connected client received the second pick in realtime',
    onlineSawTwo !== null ? 'PASS' : 'FAIL',
    onlineSawTwo === null ? 'TIMEOUT' : `${onlineSawTwo}ms`
  );

  await offline.page.screenshot({ path: join(screenshotDir, '04-after-reconnect-mobile.png') });
  // Recent-picks region, which is where recovery is actually visible.
  const recentPicks = offline.page.locator('section[aria-labelledby="recent-picks-heading"]');
  if (await recentPicks.count()) {
    await recentPicks.first().screenshot({ path: join(screenshotDir, '05-recent-picks-after-reconnect.png') });
  }

  // --- database truth ------------------------------------------------------
  const { data: madePicks } = await commissioner
    .from('draft_picks')
    .select('pick_number,athlete_id')
    .eq('draft_id', draftId)
    .not('picked_at', 'is', null);
  record('RT-030', 'Both picks are recorded as authoritative draft state', (madePicks?.length ?? 0) >= 2 ? 'PASS' : 'FAIL', `made picks=${madePicks?.length ?? 0}`);

  const allConsole = observers.flatMap(o => o.consoleErrors);
  const hydrationAll = allConsole.filter(text => /hydrat|didn't match|did not match/i.test(text));
  record('RT-031', 'No hydration warning across the entire live session', hydrationAll.length === 0 ? 'PASS' : 'FAIL', `console errors=${allConsole.length}, hydration=${hydrationAll.length}`);

  await browser.close();

  // --- artifacts -----------------------------------------------------------
  const passed = checks.filter(check => check.status === 'PASS').length;
  const failed = checks.filter(check => check.status === 'FAIL').length;
  const slow = checks.filter(check => check.status === 'SLOW').length;
  const report = [
    '# Draft Realtime and Reconnect QA',
    '',
    `Run: ${runId}`,
    `League: ${QA_LEAGUE_NAME}`,
    `League id: ${fixture.league.id}`,
    `League season id: ${fixture.season.id}`,
    `Draft id: ${draftId}`,
    `App under test: ${appUrl}`,
    '',
    '> Ids above are a record of this run only. They are recreated by the next',
    '> `npm run qa:league:reset`. Resolve current ids with `npm run qa:ids`.',
    '',
    '## Purpose',
    '',
    'Closes the two Gate 1 criteria the 2026-08-30 full-draft runs left unproven:',
    'realtime pick propagation between concurrent clients, and reconnect/recovery.',
    '',
    `Realtime budget: ${REALTIME_BUDGET_MS}ms, deliberately under the draft room's`,
    `${POLLING_FALLBACK_MS}ms polling fallback so a pass cannot be satisfied by polling.`,
    '',
    '## Result',
    '',
    `- Checks passed: ${passed}`,
    `- Checks failed: ${failed}`,
    `- Checks working but over budget (SLOW): ${slow}`,
    '',
    '## Checks',
    '',
    ...checks.map(check => `- **${check.id}** ${check.description}: ${check.status}${check.detail ? ` — ${check.detail}` : ''}`),
    '',
    '## Screenshots',
    '',
    '- screenshots/01-live-draft-commissioner-desktop.png',
    '- screenshots/02-live-draft-manager-mobile.png',
    '- screenshots/03-after-realtime-pick-desktop.png',
    '- screenshots/04-after-reconnect-mobile.png',
    '- screenshots/05-recent-picks-after-reconnect.png',
    '',
  ].join('\n');
  await writeFile(join(artifactDir, 'DRAFT_REALTIME_QA.md'), report, 'utf8');

  console.log(`\nArtifacts: ${artifactDir}`);
  console.log(`passed=${passed} failed=${failed} slow=${slow}`);
  if (failed > 0) process.exitCode = 1;
}

await main();
