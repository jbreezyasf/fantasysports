#!/usr/bin/env node
/**
 * Completes the current QA draft entirely by autopick, fast.
 *
 * The unattended cron advances one pick per minute, so a full 150-pick autopick
 * draft takes ~150 minutes. For verifying autopick *selection* (not the clock),
 * this forces each deadline into the past and invokes the same
 * process_expired_draft_picks RPC the cron calls. Selection logic is identical;
 * only the waiting is removed. Deadline forcing goes through the linked
 * Supabase CLI exactly as scripts/qa-full-draft.mjs does.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnv, signInQaActor, resolveQaFixture } from './qa-fixture.mjs';

loadLocalEnv();

async function runLinkedSql(sql) {
  const dir = await mkdtemp(join(tmpdir(), 'big-exec-autopick-'));
  const file = join(dir, 'q.sql');
  try {
    await writeFile(file, sql, 'utf8');
    const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--file', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`linked sql failed: ${result.stderr || result.stdout}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const commissioner = await signInQaActor('Commissioner');
const fixture = await resolveQaFixture(commissioner);
if (!fixture.draft) throw new Error('No QA draft. Run: npm run qa:league:reset');
const draftId = fixture.draft.id;

const { data: before } = await commissioner.from('drafts').select('status').eq('id', draftId).maybeSingle();
if (before.status !== 'live') {
  const { error } = await commissioner.rpc('start_draft', { p_draft_id: draftId });
  if (error) throw new Error(`start_draft failed: ${error.message}`);
}

const startedAt = Date.now();
for (let round = 0; round < 200; round += 1) {
  const { data: draft } = await commissioner.from('drafts').select('status,current_pick').eq('id', draftId).maybeSingle();
  if (draft.status === 'completed') break;
  await runLinkedSql(`update public.drafts set current_pick_deadline_at = now() - interval '5 seconds' where id = '${draftId}'::uuid;`);
  const { data, error } = await commissioner.rpc('process_expired_draft_picks', { p_draft_id: draftId, p_limit: 20 });
  if (error) throw new Error(`process_expired_draft_picks failed at pick ${draft.current_pick}: ${error.message}`);
  if (round % 10 === 0) console.log(`pick ${draft.current_pick} processed=${data?.processed ?? '?'}`);
}

const { data: final } = await commissioner.from('drafts').select('status').eq('id', draftId).maybeSingle();
console.log(`draft status=${final.status} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
if (final.status !== 'completed') process.exitCode = 1;
