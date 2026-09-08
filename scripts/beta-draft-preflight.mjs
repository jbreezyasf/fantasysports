#!/usr/bin/env node
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

nextEnv.loadEnvConfig(process.cwd());

const args = new Map(process.argv.slice(2).map((arg) => {
  const match = /^--([^=]+)=(.*)$/.exec(arg);
  return match ? [match[1], match[2]] : [arg.replace(/^--/, ''), 'true'];
}));

const leagueId = args.get('league');
const expectedManagers = Number(args.get('expected-managers') ?? 10);
const expectedFranchises = Number(args.get('expected-franchises') ?? expectedManagers);
const expectedSeason = Number(args.get('season') ?? 2026);

if (!leagueId) {
  console.error('Usage: npm run beta:draft:preflight -- --league=<league-id>');
  console.log('BETA DRAFT PREFLIGHT: FAIL');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const checks = [];
function check(scope, label, status, detail, blocksDraft = status === 'FAIL') {
  checks.push({ scope, label, status, detail, blocksDraft });
  console.log(`[${status}] ${scope} - ${label}${detail ? ` :: ${detail}` : ''}`);
}

async function runLinkedReadSql(sql) {
  const dir = await mkdtemp(join(tmpdir(), 'big-exec-preflight-'));
  const file = join(dir, 'query.sql');
  try {
    await writeFile(file, sql, 'utf8');
    const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--file', file], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) return { ok: false, text: result.stderr || result.stdout };
    return { ok: true, text: result.stdout };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const { data: league, error: leagueError } = await supabase
  .from('fantasy_leagues')
  .select('id,name,max_franchises,draft_min_franchises')
  .eq('id', leagueId)
  .maybeSingle();

if (leagueError || !league) {
  check('League', 'league exists', 'FAIL', leagueError?.message ?? 'league not found');
} else {
  check('League', 'league exists', 'PASS', `max_franchises=${league.max_franchises ?? 'null'}`);
}

const { data: seasons } = await supabase
  .from('league_seasons')
  .select('id,status,is_current,competition_season_id,roster_config,trade_deadline_at,waiver_period_hours')
  .eq('league_id', leagueId);
const currentSeasons = (seasons ?? []).filter((season) => season.is_current);
check('League', 'current league season exists and is unique', currentSeasons.length === 1 ? 'PASS' : 'FAIL', `current_count=${currentSeasons.length}`);
const currentSeason = currentSeasons[0] ?? null;

let competitionSeason = null;
if (currentSeason) {
  const { data } = await supabase
    .from('competition_seasons')
    .select('id,season_year,competition_id')
    .eq('id', currentSeason.competition_season_id)
    .maybeSingle();
  competitionSeason = data;
}
check('League', `correct current competition season = ${expectedSeason}`, competitionSeason?.season_year === expectedSeason ? 'PASS' : 'FAIL', `season_year=${competitionSeason?.season_year ?? 'missing'}`);

const [{ data: members }, { data: franchises }, { data: seasonFranchises }] = await Promise.all([
  supabase.from('league_members').select('league_id,user_id,role').eq('league_id', leagueId),
  supabase.from('franchises').select('id,league_id,name').eq('league_id', leagueId),
  currentSeason
    ? supabase.from('season_franchises').select('id,franchise_id,draft_position').eq('league_season_id', currentSeason.id)
    : Promise.resolve({ data: [] }),
]);

const memberCount = members?.length ?? 0;
const franchiseCount = franchises?.length ?? 0;
const seasonFranchiseCount = seasonFranchises?.length ?? 0;
check('League', 'league has expected number of members', memberCount === expectedManagers ? 'PASS' : 'FAIL', `members=${memberCount}, expected=${expectedManagers}`);
check('League', 'league has expected number of franchises', franchiseCount === expectedFranchises ? 'PASS' : 'FAIL', `franchises=${franchiseCount}, expected=${expectedFranchises}`);
check('League', 'all required seats are occupied', memberCount >= expectedManagers && seasonFranchiseCount >= expectedFranchises ? 'PASS' : 'FAIL', `members=${memberCount}, season_franchises=${seasonFranchiseCount}`);
const franchiseIds = new Set((franchises ?? []).map((row) => row.id));
const invalidSf = (seasonFranchises ?? []).filter((row) => !franchiseIds.has(row.franchise_id));
check('League', 'every member/franchise relationship is valid', invalidSf.length === 0 && memberCount === franchiseCount ? 'PASS' : 'FAIL', `invalid_season_franchises=${invalidSf.length}, member_franchise_delta=${memberCount - franchiseCount}`);

const { data: drafts } = currentSeason
  ? await supabase.from('drafts').select('id,status,rounds,pick_seconds,current_pick,current_pick_deadline_at,starts_at,started_at').eq('league_season_id', currentSeason.id)
  : { data: [] };
const draft = drafts?.[0] ?? null;
check('Draft', 'draft exists', drafts?.length === 1 ? 'PASS' : 'FAIL', `draft_count=${drafts?.length ?? 0}`);
check('Draft', 'draft has not accidentally begun', draft && !draft.started_at && draft.status !== 'live' && draft.status !== 'completed' ? 'PASS' : 'FAIL', `status=${draft?.status ?? 'missing'}, started_at=${draft?.started_at ?? 'null'}`);
check('Draft', '15 rounds configured', draft?.rounds === 15 ? 'PASS' : 'FAIL', `rounds=${draft?.rounds ?? 'missing'}`);
check('Draft', 'timer is configured', Number(draft?.pick_seconds ?? 0) > 0 ? 'PASS' : 'FAIL', `pick_seconds=${draft?.pick_seconds ?? 'missing'}`);

const { data: picks } = draft
  ? await supabase.from('draft_picks').select('pick_number,round_number,round_pick,season_franchise_id,picked_at,athlete_id,real_team_id').eq('draft_id', draft.id)
  : { data: [] };
const stalePicks = (picks ?? []).filter((pick) => pick.picked_at || pick.athlete_id || pick.real_team_id);
check('Draft', 'draft has no stale picks', stalePicks.length === 0 ? 'PASS' : 'FAIL', `stale_picks=${stalePicks.length}`);
check('Draft', 'expected draft-position count is complete', new Set((seasonFranchises ?? []).map((sf) => sf.draft_position)).size === expectedFranchises ? 'PASS' : 'FAIL', `unique_positions=${new Set((seasonFranchises ?? []).map((sf) => sf.draft_position)).size}`);
const expectedPositions = Array.from({ length: expectedFranchises }, (_, index) => index + 1);
const positions = new Set((seasonFranchises ?? []).map((sf) => sf.draft_position));
check('Draft', 'draft positions are unique', positions.size === seasonFranchiseCount ? 'PASS' : 'FAIL', `positions=${positions.size}, season_franchises=${seasonFranchiseCount}`);
check('Draft', 'expected draft positions are complete', expectedPositions.every((pos) => positions.has(pos)) ? 'PASS' : 'FAIL', `expected=1-${expectedFranchises}`);

const requiredFunctions = ['add_draft_queue_item','remove_draft_queue_item','move_draft_queue_item','process_expired_draft_picks','pause_draft','undo_last_draft_pick'];
const functionCatalog = await runLinkedReadSql(`
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (${requiredFunctions.map((fn) => `'${fn}'`).join(',')});
`);
const cronCatalog = await runLinkedReadSql(`select jobname, active from cron.job where jobname = 'big-exec-process-draft-autopicks';`);
const realtimeCatalog = await runLinkedReadSql(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('drafts','draft_picks','draft_queues');`);
for (const fn of requiredFunctions) {
  check('Draft', `${fn} exists`, functionCatalog.ok && functionCatalog.text.includes(fn) ? 'PASS' : 'FAIL', functionCatalog.ok ? '' : functionCatalog.text.slice(0, 200), fn !== 'remove_draft_queue_item' && fn !== 'move_draft_queue_item');
}

const { error: queueProbeError } = await supabase.from('draft_queues').select('id', { count: 'exact', head: true }).limit(1);
check('Draft', 'draft queue infrastructure exists', queueProbeError ? 'FAIL' : 'PASS', queueProbeError?.message ?? 'draft_queues table is queryable');
check('Draft', 'realtime infrastructure exists', realtimeCatalog.ok && ['drafts','draft_picks','draft_queues'].every((name) => realtimeCatalog.text.includes(name)) ? 'PASS' : 'FAIL', realtimeCatalog.ok ? 'draft tables are in supabase_realtime publication' : realtimeCatalog.text.slice(0, 200));
check('Draft', 'autopick scheduler/function exists', functionCatalog.ok && functionCatalog.text.includes('process_expired_draft_picks') && cronCatalog.ok && cronCatalog.text.includes('big-exec-process-draft-autopicks') ? 'PASS' : 'FAIL', 'process_expired_draft_picks + cron job');
check('Draft', 'pause/resume/correction support exists', functionCatalog.ok && functionCatalog.text.includes('pause_draft') && functionCatalog.text.includes('undo_last_draft_pick') ? 'PASS' : 'FAIL', 'pause_draft + undo_last_draft_pick catalog presence');

const { data: activeAthletes } = await supabase.from('athletes').select('id,position', { count: 'exact' }).eq('active', true).in('position', ['QB','RB','WR','TE','K']).limit(5000);
const posCounts = Object.fromEntries(['QB','RB','WR','TE','K'].map((pos) => [pos, (activeAthletes ?? []).filter((row) => row.position === pos).length]));
check('Player pool', 'eligible player pool is nonempty and healthy', (activeAthletes?.length ?? 0) >= 500 ? 'PASS' : 'FAIL', `eligible=${activeAthletes?.length ?? 0}`);
check('Player pool', 'QB/RB/WR/TE/K coverage is sufficient', posCounts.QB >= 20 && posCounts.RB >= 40 && posCounts.WR >= 50 && posCounts.TE >= 20 && posCounts.K >= 10 ? 'PASS' : 'FAIL', JSON.stringify(posCounts));
const { data: duplicateProviders } = await supabase
  .from('athlete_provider_ids')
  .select('provider,provider_athlete_id,athlete_id')
  .eq('provider', 'sportradar')
  .limit(5000);
const seen = new Map();
for (const row of duplicateProviders ?? []) {
  const key = `${row.provider}:${row.provider_athlete_id}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}
const duplicates = [...seen.values()].filter((count) => count > 1).length;
check('Player pool', 'no duplicated canonical athletes', duplicates === 0 ? 'PASS' : 'FAIL', `duplicate_provider_ids=${duplicates}`);
const { data: values } = await supabase.from('draft_historical_values').select('source,season_year', { count: 'exact' }).limit(5000);
const { count: balldontlieValueCount } = await supabase.from('draft_historical_values').select('id', { count: 'exact', head: true }).eq('source', 'balldontlie');
check('Player pool', 'draft ranking data loads', (values?.length ?? 0) > 0 ? 'PASS' : 'FAIL', `draft_value_rows_sample=${values?.length ?? 0}`);
check('Player pool', 'BALDONTLIE/historical draft-value data loads where expected', Number(balldontlieValueCount ?? 0) > 0 ? 'PASS' : 'WARN', `balldontlie_rows=${balldontlieValueCount ?? 0}`, false);

const { data: invites } = await supabase.from('league_invites').select('status,expires_at,accepted_at').eq('league_id', leagueId);
const now = Date.now();
const inviteCounts = { pending: 0, accepted: 0, expired: 0, invalid: 0 };
for (const invite of invites ?? []) {
  if (invite.status === 'accepted' || invite.accepted_at) inviteCounts.accepted += 1;
  else if (invite.expires_at && new Date(invite.expires_at).getTime() < now) inviteCounts.expired += 1;
  else if (invite.status === 'pending') inviteCounts.pending += 1;
  else inviteCounts.invalid += 1;
}
check('Invitations', 'counts only', 'PASS', JSON.stringify(inviteCounts), false);

const hardFails = checks.filter((item) => item.status === 'FAIL' && item.blocksDraft);
const warnings = checks.filter((item) => item.status === 'WARN');
if (hardFails.length) {
  console.log('Draft blockers:');
  for (const item of hardFails) console.log(`- ${item.scope}: ${item.label}${item.detail ? ` (${item.detail})` : ''}`);
}

const result = hardFails.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS';
console.log(`BETA DRAFT PREFLIGHT: ${result}`);
process.exit(result === 'FAIL' ? 1 : 0);
