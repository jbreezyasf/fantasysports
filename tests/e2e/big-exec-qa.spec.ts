import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const QA_LEAGUE_NAME = 'BIG EXEC QA 10-MANAGER HISTORY LAB';
const ACTORS = [
  'Commissioner',
  'Manager01',
  'Manager02',
  'Manager03',
  'Manager04',
  'Manager05',
  'Manager06',
  'Manager07',
  'Manager08',
  'Manager09',
] as const;

type Actor = (typeof ACTORS)[number];
type EvidenceResult = 'PASS' | 'FAIL' | 'NEEDS HUMAN REVIEW' | 'BLOCKED';
type ConsoleEntry = { type: string; text: string };
type NetworkEntry = { url: string; status?: number; method?: string };
type EvidenceIssue = { id: string; actor: Actor; pageName: string; type: 'console' | 'network'; detail: string };
type FixtureState = {
  league_id: string;
  current_season_id: string;
  current_draft_id: string | null;
  current_draft_status: string | null;
  actors: Array<{ label: Actor; role: string; franchise_id: string; franchise: string; season_franchise_id: string }>;
  fantasy_history: Array<Record<string, unknown>>;
  real_nfl_coverage: Array<Record<string, unknown>>;
};

const runId = process.env.QA_RUN_ID || `${new Date().toISOString().slice(0, 10)}_10-manager-regression`;
const artifactDir = join(process.cwd(), 'qa-artifacts', runId);
const screenshotsDir = join(artifactDir, 'screenshots');
const partsDir = join(artifactDir, '.parts');

class Evidence {
  private entries: string[] = [];
  private failures: string[] = [];
  private issues: EvidenceIssue[] = [];
  private screenshotCount = 0;
  private counts = { passed: 0, failed: 0, blocked: 0 };

  constructor(private readonly viewportLabel: string, private readonly projectName: string) {
    mkdirSync(screenshotsDir, { recursive: true });
    mkdirSync(partsDir, { recursive: true });
  }

  async capture(args: {
    id: string;
    actor: Actor;
    pageName: string;
    page: Page;
    expected: string;
    actual: string;
    result: EvidenceResult;
    consoleEntries: ConsoleEntry[];
    networkEntries: NetworkEntry[];
    dbEvidence: string;
    notes?: string;
    filename: string;
  }) {
    const screenshot = `screenshots/${args.filename}`;
    await args.page.screenshot({ path: join(artifactDir, screenshot), fullPage: true });
    this.screenshotCount += 1;
    if (args.result === 'PASS') this.counts.passed += 1;
    if (args.result === 'FAIL') this.counts.failed += 1;
    if (args.result === 'BLOCKED') this.counts.blocked += 1;
    const consoleErrors = args.consoleEntries.filter((entry) => ['error', 'warning'].includes(entry.type));
    const networkErrors = args.networkEntries;
    if (args.result !== 'PASS') this.failures.push(`${args.id} ${args.actor} ${args.pageName}: ${args.result}`);
    for (const entry of consoleErrors) this.issues.push({ id: args.id, actor: args.actor, pageName: args.pageName, type: 'console', detail: `${entry.type}: ${entry.text}` });
    for (const entry of networkErrors) this.issues.push({ id: args.id, actor: args.actor, pageName: args.pageName, type: 'network', detail: `${entry.method || 'GET'} ${entry.status || 'FAILED'} ${entry.url}` });
    this.entries.push([
      `## ${args.id}`,
      `- Actor: ${args.actor}`,
      `- Page: ${args.pageName}`,
      `- Route: ${args.page.url()}`,
      `- Viewport: ${this.viewportLabel}`,
      `- Expected: ${args.expected}`,
      `- Actual: ${args.actual}`,
      `- Result: ${args.result}`,
      `- Screenshot: ${screenshot}`,
      `- Console errors: ${formatConsole(args.consoleEntries)}`,
      `- Failed network requests: ${formatNetwork(args.networkEntries)}`,
      `- Important database/API evidence: ${args.dbEvidence}`,
      `- Notes: ${args.notes || 'None'}`,
      '',
    ].join('\n'));
  }

  writeSummary(fixture: FixtureState) {
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(partsDir, `${this.projectName}.json`), JSON.stringify({
      entries: this.entries,
      failures: this.failures,
      issues: this.issues,
      screenshotCount: this.screenshotCount,
      counts: this.counts,
    }, null, 2), 'utf8');
    const parts = readdirSync(partsDir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => JSON.parse(readFileSync(join(partsDir, file), 'utf8')) as { entries: string[]; failures: string[]; issues?: EvidenceIssue[]; screenshotCount: number; counts: { passed: number; failed: number; blocked: number } });
    const allEntries = parts.flatMap((part) => part.entries);
    const allFailures = parts.flatMap((part) => part.failures);
    const allIssues = parts.flatMap((part) => part.issues || []);
    const screenshotCount = parts.reduce((sum, part) => sum + part.screenshotCount, 0);
    const counts = parts.reduce((total, part) => ({
      passed: total.passed + part.counts.passed,
      failed: total.failed + part.counts.failed,
      blocked: total.blocked + part.counts.blocked,
    }), { passed: 0, failed: 0, blocked: 0 });

    writeFileSync(join(artifactDir, 'EVIDENCE.md'), `# Big Exec QA Evidence\n\nRun: ${runId}\n\n${allEntries.join('\n')}`, 'utf8');
    writeFileSync(join(artifactDir, 'REVIEW_INDEX.md'), [
      `# Review Index`,
      ``,
      `Run: ${runId}`,
      ``,
      `## Failures / Review`,
      allFailures.length ? allFailures.map((failure) => `- ${failure}`).join('\n') : '- None recorded by this automation pass.',
      ``,
      `## Console / Network Issues`,
      allIssues.length ? allIssues.map((issue) => `- ${issue.id} ${issue.actor} ${issue.pageName}: ${issue.type} issue recorded; see EVIDENCE.md for exact text.`).join('\n') : '- None recorded.',
      ``,
      `## Front Office`,
      ...allEntries.filter((entry) => entry.includes('Page: Front Office')).map(embedLine),
      ``,
      `## League`,
      ...allEntries.filter((entry) => entry.includes('Page: League')).map(embedLine),
      ``,
      `## Draft Room`,
      ...allEntries.filter((entry) => entry.includes('Page: Draft Room')).map(embedLine),
      ``,
      `## Free Agency`,
      ...allEntries.filter((entry) => entry.includes('Page: Free Agency')).map(embedLine),
      ``,
      `## Trade Room`,
      ...allEntries.filter((entry) => entry.includes('Page: Trade Room')).map(embedLine),
      ``,
      `## Stadium / Owner's Office`,
      ...allEntries.filter((entry) => entry.includes('Page: Stadium')).map(embedLine),
      ``,
      `## History & Legacy`,
      ...allEntries.filter((entry) => entry.includes('Page: History')).map(embedLine),
      ``,
    ].join('\n'), 'utf8');
    writeFileSync(join(artifactDir, 'SUMMARY.md'), [
      `# QA Summary`,
      ``,
      `Run: ${runId}`,
      `QA league ID: ${fixture.league_id}`,
      `Current season ID: ${fixture.current_season_id}`,
      `Current draft ID: ${fixture.current_draft_id || 'None'}`,
      `Current draft status: ${fixture.current_draft_status || 'None'}`,
      `Screenshots captured: ${screenshotCount}`,
      ``,
      `## Tests Run`,
      `- Passed evidence checks: ${counts.passed}`,
      `- Failed evidence checks: ${counts.failed}`,
      `- Blocked evidence checks: ${counts.blocked}`,
      ``,
      `## Actors`,
      ...fixture.actors.map((actor) => `- ${actor.label}: ${actor.role}, ${actor.franchise}, franchise ${actor.franchise_id}`),
      ``,
      `## Historical Fantasy Coverage`,
      ...fixture.fantasy_history.map((row) => `- ${row.season_year}: seasons=${row.season_exists}, franchises=${row.franchises}, standings=${row.standings}, matchups=${row.matchups}, rivalries=${row.rivalries}, championships=${row.championships}, achievements=${row.achievements}`),
      ``,
      `## Real NFL Historical Coverage`,
      ...fixture.real_nfl_coverage.map((row) => `- ${row.season_year}: games=${row.games}, finals=${row.finals}, scored_games=${row.scored_games}, athlete_stat_rows=${row.athlete_stat_rows}, source=production real_games/athlete_game_stats`),
      ``,
      `## Failures / Human Review`,
      allFailures.length ? allFailures.map((failure) => `- ${failure}`).join('\n') : '- None recorded by this automation pass.',
      ``,
      `## Console Errors`,
      allIssues.filter((issue) => issue.type === 'console').length ? allIssues.filter((issue) => issue.type === 'console').map((issue) => `- ${issue.id} ${issue.actor} ${issue.pageName}: ${issue.detail.slice(0, 300).replaceAll('\n', ' ')}${issue.detail.length > 300 ? '...' : ''}`).join('\n') : '- None',
      ``,
      `## Network Failures`,
      allIssues.filter((issue) => issue.type === 'network').length ? allIssues.filter((issue) => issue.type === 'network').map((issue) => `- ${issue.id} ${issue.actor} ${issue.pageName}: ${issue.detail}`).join('\n') : '- None',
      ``,
    ].join('\n'), 'utf8');
  }
}

function embedLine(entry: string) {
  const id = entry.match(/^## (.+)$/m)?.[1] || 'Evidence';
  const actor = entry.match(/Actor: (.+)$/m)?.[1] || 'Actor';
  const result = entry.match(/Result: (.+)$/m)?.[1] || 'UNKNOWN';
  const screenshot = entry.match(/Screenshot: (.+)$/m)?.[1] || '';
  const page = entry.match(/Page: (.+)$/m)?.[1] || 'Page';
  return `### ${id} · ${actor} · ${result}\n![${id}](${screenshot})\n${page} visual capture.`;
}

function formatConsole(entries: ConsoleEntry[]) {
  const errors = entries.filter((entry) => ['error', 'warning'].includes(entry.type));
  return errors.length ? errors.map((entry) => `${entry.type}: ${entry.text}`).join(' | ') : 'None';
}

function formatNetwork(entries: NetworkEntry[]) {
  return entries.length ? entries.map((entry) => `${entry.method || 'GET'} ${entry.status || 'FAILED'} ${entry.url}`).join(' | ') : 'None';
}

function queryFixture(): FixtureState {
  const sql = `
with league as (
  select id from public.fantasy_leagues where name='${QA_LEAGUE_NAME}' order by created_at desc limit 1
),
current_season as (
  select ls.id from public.league_seasons ls join league l on l.id=ls.league_id where ls.is_current = true limit 1
),
actor_rows as (
  select
    case when lm.role::text='commissioner' then 'Commissioner' else 'Manager' || lpad((sf.draft_position - 1)::text, 2, '0') end as label,
    lm.role::text as role,
    f.id as franchise_id,
    f.name as franchise,
    sf.id as season_franchise_id
  from league l
  join public.league_members lm on lm.league_id=l.id
  join public.franchise_owners fo on fo.user_id=lm.user_id and fo.ends_on is null
  join public.franchises f on f.id=fo.franchise_id and f.league_id=l.id
  join public.season_franchises sf on sf.franchise_id=f.id
  join current_season cs on cs.id=sf.league_season_id
),
fantasy_history as (
  select
    cs.season_year,
    count(distinct ls.id) as season_exists,
    count(distinct sf.id) as franchises,
    count(distinct st.season_franchise_id) as standings,
    count(distinct m.id) as matchups,
    (select count(*) from public.rivalries r join league l on l.id=r.league_id) as rivalries,
    count(distinct c.id) as championships,
    count(distinct fa.id) as achievements
  from league l
  join public.league_seasons ls on ls.league_id=l.id
  join public.competition_seasons cs on cs.id=ls.competition_season_id
  left join public.season_franchises sf on sf.league_season_id=ls.id
  left join public.standings st on st.league_season_id=ls.id and st.season_franchise_id=sf.id
  left join public.matchups m on m.league_season_id=ls.id
  left join public.championships c on c.league_season_id=ls.id
  left join public.franchise_achievements fa on fa.league_season_id=ls.id
  where cs.season_year between 2021 and 2025
  group by cs.season_year
),
real_coverage as (
  select
    y as season_year,
    count(distinct rg.id) as games,
    count(distinct rg.id) filter (where rg.state='final') as finals,
    count(distinct rg.id) filter (where rg.home_score is not null and rg.away_score is not null) as scored_games,
    count(ags.id) as athlete_stat_rows
  from generate_series(2021,2025) y
  left join public.competition_seasons cs on cs.season_year=y and cs.competition_id=(select competition_id from public.competitions where code='pro_football' limit 1)
  left join public.real_games rg on rg.competition_season_id=cs.id
  left join public.athlete_game_stats ags on ags.game_id=rg.id
  group by y
)
select jsonb_build_object(
  'league_id', (select id from league),
  'current_season_id', (select id from current_season),
  'current_draft_id', (select id from public.drafts where league_season_id=(select id from current_season) limit 1),
  'current_draft_status', (select status from public.drafts where league_season_id=(select id from current_season) limit 1),
  'actors', (select jsonb_agg(to_jsonb(actor_rows) order by label) from actor_rows),
  'fantasy_history', (select jsonb_agg(to_jsonb(fantasy_history) order by season_year) from fantasy_history),
  'real_nfl_coverage', (select jsonb_agg(to_jsonb(real_coverage) order by season_year) from real_coverage)
) as state;`;
  const output = execFileSync('npx', ['supabase', 'db', 'query', '--linked', sql], { cwd: process.cwd(), encoding: 'utf8' });
  const parsed = JSON.parse(output.slice(output.indexOf('{')));
  return parsed.rows[0].state as FixtureState;
}

async function actorPage(browser: Browser, actor: Actor) {
  const storageState = join(process.cwd(), '.auth', `${actor}.json`);
  if (!existsSync(storageState)) throw new Error(`Missing ${storageState}. Run QA_AUTH_PASSWORD=... npm run qa:auth:save first.`);
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  const consoleEntries: ConsoleEntry[] = [];
  const networkEntries: NetworkEntry[] = [];
  page.on('console', (message) => consoleEntries.push({ type: message.type(), text: message.text() }));
  page.on('response', (response) => {
    if (response.status() >= 400) networkEntries.push({ url: response.url(), status: response.status(), method: response.request().method() });
  });
  page.on('requestfailed', (request) => networkEntries.push({ url: request.url(), method: request.method() }));
  return { context, page, consoleEntries, networkEntries };
}

test.describe.serial('Big Exec 10-manager QA harness', () => {
  test.skip(ACTORS.some((actor) => !existsSync(join(process.cwd(), '.auth', `${actor}.json`))), 'Missing saved auth states. Run QA_AUTH_PASSWORD=... npm run qa:auth:save first.');

  let fixture: FixtureState;
  let browser: Browser;
  let evidence: Evidence;

  test.beforeAll(async ({}, workerInfo) => {
    fixture = queryFixture();
    expect(fixture.actors).toHaveLength(10);
    expect(fixture.fantasy_history).toHaveLength(5);
    browser = await chromium.launch();
    evidence = new Evidence(`${workerInfo.project.name.includes('mobile') ? '390x844 mobile' : '1440x900 desktop'}`, workerInfo.project.name);
  });

  test.afterAll(async () => {
    await browser?.close();
    evidence?.writeSummary(fixture);
  });

  test('captures authenticated product surfaces for all ten actors', async ({}, testInfo) => {
    let index = 1;
    for (const actor of ACTORS) {
      const { context, page, consoleEntries, networkEntries } = await actorPage(browser, actor);
      const actorState = fixture.actors.find((row) => row.label === actor);
      expect(actorState).toBeTruthy();
      await page.goto(`/leagues/${fixture.league_id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(QA_LEAGUE_NAME)).toBeVisible();
      await evidence.capture({
        id: `${testInfo.project.name.includes('mobile') ? 'UX-FO-M' : 'UX-FO-D'}-${String(index).padStart(3, '0')}`,
        actor,
        pageName: 'Front Office',
        page,
        expected: 'Authenticated manager lands in the QA league and sees their role/franchise context.',
        actual: await page.locator('body').innerText({ timeout: 5_000 }).then((text) => text.slice(0, 500)),
        result: 'NEEDS HUMAN REVIEW',
        consoleEntries,
        networkEntries,
        dbEvidence: `league=${fixture.league_id}; franchise=${actorState?.franchise}; role=${actorState?.role}`,
        notes: 'Automation captured the page. Canonical left-rail/drawer must be visually reviewed against UX_UI_PAGE_SPEC.',
        filename: `${String(index).padStart(2, '0')}-${actor.toLowerCase()}-league-${testInfo.project.name}.png`,
      });
      await context.close();
      index += 1;
    }
  });

  test('proves commissioner vs regular-manager draft permission smoke', async ({}, testInfo) => {
    test.skip(!fixture.current_draft_id, 'No current QA draft exists.');
    test.skip(fixture.current_draft_status !== 'pre_draft', `Current QA draft is ${fixture.current_draft_status}; start-control smoke requires pre_draft state.`);
    const commissioner = await actorPage(browser, 'Commissioner');
    await commissioner.page.goto(`/drafts/${fixture.current_draft_id}`, { waitUntil: 'domcontentloaded' });
    await expect(commissioner.page.getByRole('button', { name: /start draft/i })).toBeVisible();
    await evidence.capture({
      id: `${testInfo.project.name.includes('mobile') ? 'PERM-DRAFT-M' : 'PERM-DRAFT-D'}-001`,
      actor: 'Commissioner',
      pageName: 'Draft Room',
      page: commissioner.page,
      expected: 'Commissioner sees the Start Draft control.',
      actual: 'Start Draft button was visible.',
      result: 'PASS',
      consoleEntries: commissioner.consoleEntries,
      networkEntries: commissioner.networkEntries,
      dbEvidence: `draft=${fixture.current_draft_id}; role=commissioner`,
      filename: `10-commissioner-draft-started-${testInfo.project.name}.png`,
    });
    await commissioner.context.close();

    const manager = await actorPage(browser, 'Manager01');
    await manager.page.goto(`/drafts/${fixture.current_draft_id}`, { waitUntil: 'domcontentloaded' });
    await expect(manager.page.getByRole('button', { name: /start draft/i })).toHaveCount(0);
    await evidence.capture({
      id: `${testInfo.project.name.includes('mobile') ? 'PERM-DRAFT-M' : 'PERM-DRAFT-D'}-002`,
      actor: 'Manager01',
      pageName: 'Draft Room',
      page: manager.page,
      expected: 'Regular manager must not see commissioner-only Start Draft control.',
      actual: 'Start Draft button count was 0.',
      result: 'PASS',
      consoleEntries: manager.consoleEntries,
      networkEntries: manager.networkEntries,
      dbEvidence: `draft=${fixture.current_draft_id}; role=manager`,
      filename: `11-manager01-draft-no-commissioner-control-${testInfo.project.name}.png`,
    });
    await manager.context.close();
  });
});
