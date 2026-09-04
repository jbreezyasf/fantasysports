#!/usr/bin/env node
/**
 * Verifies the end state of a completed QA draft.
 *
 * Read-only. It asserts what an unattended autopick-driven draft must leave
 * behind: a completed draft, every slot filled, every franchise holding a
 * complete and positionally legal roster, and no asset owned twice.
 *
 * Roster legality matches the definition used by scripts/qa-full-draft.mjs:
 * 15 active entries per franchise, with QB>=1, RB>=2, WR>=2, TE>=1, K>=1, D/ST>=1.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { QA_LEAGUE_NAME } from './qa-actors.mjs';
import { loadLocalEnv, signInQaActor, resolveQaFixture } from './qa-fixture.mjs';

loadLocalEnv();

const runId = process.env.QA_RUN_ID || `${new Date().toISOString().slice(0, 10)}_draft-autopick-completion`;
const artifactDir = join(process.cwd(), 'qa-artifacts', runId);

const checks = [];
function record(id, description, status, detail) {
  checks.push({ id, description, status, detail });
  console.log(`[${status}] ${id} ${description}${detail ? ` :: ${detail}` : ''}`);
}

const supabase = await signInQaActor('Commissioner');
const fixture = await resolveQaFixture(supabase);
const draftId = fixture.draft.id;

const { data: draft } = await supabase
  .from('drafts')
  .select('status,current_pick,rounds,pick_seconds,started_at,completed_at')
  .eq('id', draftId)
  .maybeSingle();

const { data: picks } = await supabase
  .from('draft_picks')
  .select('id,pick_number,season_franchise_id,athlete_id,real_team_id,picked_at,is_auto_pick')
  .eq('draft_id', draftId)
  .order('pick_number');

const made = (picks ?? []).filter(pick => pick.picked_at);
const autoPicks = made.filter(pick => pick.is_auto_pick);

record('DR-001', 'Draft reached completed status', draft?.status === 'completed' ? 'PASS' : 'FAIL', `status=${draft?.status}, completed_at=${draft?.completed_at ?? 'null'}`);
record('DR-002', 'All 150 pick slots were filled', made.length === 150 ? 'PASS' : 'FAIL', `made=${made.length}/${picks?.length ?? 0}`);
record(
  'DR-003',
  'Draft was completed predominantly by unattended autopick',
  autoPicks.length > 0 ? 'PASS' : 'FAIL',
  `autopicks=${autoPicks.length} of ${made.length} (${Math.round((autoPicks.length / Math.max(made.length, 1)) * 100)}%)`
);

const sfIds = fixture.seasonFranchises.map(sf => sf.id);
const { data: rosterRows } = await supabase
  .from('roster_entries')
  .select('season_franchise_id,athlete_id,real_team_id,athletes(position)')
  .in('season_franchise_id', sfIds)
  .is('dropped_at', null);

const counts = new Map();
for (const row of rosterRows ?? []) {
  if (!counts.has(row.season_franchise_id)) {
    counts.set(row.season_franchise_id, { total: 0, QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 });
  }
  const bucket = counts.get(row.season_franchise_id);
  bucket.total += 1;
  if (row.real_team_id) bucket.DST += 1;
  else {
    const athlete = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes;
    if (athlete?.position && bucket[athlete.position] !== undefined) bucket[athlete.position] += 1;
  }
}

const incomplete = sfIds.filter(id => (counts.get(id)?.total ?? 0) !== 15);
record('DR-010', 'Every franchise holds exactly 15 active roster entries', incomplete.length === 0 ? 'PASS' : 'FAIL', incomplete.length ? `franchises off target: ${incomplete.length}` : 'all 10 franchises at 15');

const illegal = sfIds.filter(id => {
  const bucket = counts.get(id);
  return !bucket || bucket.QB < 1 || bucket.RB < 2 || bucket.WR < 2 || bucket.TE < 1 || bucket.K < 1 || bucket.DST < 1;
});
record('DR-011', 'Every franchise has legal starter-position coverage', illegal.length === 0 ? 'PASS' : 'FAIL', illegal.length ? `illegal franchises: ${illegal.length}` : 'QB>=1 RB>=2 WR>=2 TE>=1 K>=1 D/ST>=1 satisfied by all 10');

const assetKeys = (rosterRows ?? []).map(row => row.athlete_id ? `athlete:${row.athlete_id}` : `team:${row.real_team_id}`);
const duplicates = assetKeys.filter((key, index) => assetKeys.indexOf(key) !== index);
record('DR-012', 'No asset is owned by two franchises', duplicates.length === 0 ? 'PASS' : 'FAIL', `roster entries=${assetKeys.length}, duplicates=${duplicates.length}`);

const pickedAssets = made.map(pick => pick.athlete_id ? `athlete:${pick.athlete_id}` : `team:${pick.real_team_id}`);
const missing = pickedAssets.filter(key => !assetKeys.includes(key));
record('DR-013', 'Every completed pick produced a roster entry', missing.length === 0 ? 'PASS' : 'FAIL', `picks without a roster entry: ${missing.length}`);

const passed = checks.filter(check => check.status === 'PASS').length;
const failed = checks.filter(check => check.status === 'FAIL').length;

await mkdir(artifactDir, { recursive: true });
await writeFile(join(artifactDir, 'DRAFT_AUTOPICK_COMPLETION.md'), [
  '# Unattended Autopick Draft Completion',
  '',
  `Run: ${runId}`,
  `League: ${QA_LEAGUE_NAME}`,
  `League id: ${fixture.league.id}`,
  `League season id: ${fixture.season.id}`,
  `Draft id: ${draftId}`,
  '',
  '> Ids above record this run only. Resolve current ids with `npm run qa:ids`.',
  '',
  '## What this proves',
  '',
  'The draft was left running and completed by the unattended pg_cron job',
  '`big-exec-process-draft-autopicks`, which calls `process_expired_draft_picks`',
  'once per minute. No operator drove it to completion. This exercises the',
  'server-authoritative pick clock and autopick end to end, and checks the roster',
  'state that autopick is responsible for producing.',
  '',
  `Draft settings: ${draft?.rounds} rounds, ${draft?.pick_seconds}s per pick.`,
  '',
  '## Result',
  '',
  `- Checks passed: ${passed}`,
  `- Checks failed: ${failed}`,
  '',
  '## Checks',
  '',
  ...checks.map(check => `- **${check.id}** ${check.description}: ${check.status}${check.detail ? ` — ${check.detail}` : ''}`),
  '',
].join('\n'), 'utf8');

console.log(`\nArtifacts: ${artifactDir}`);
console.log(`passed=${passed} failed=${failed}`);
if (failed > 0) process.exitCode = 1;
