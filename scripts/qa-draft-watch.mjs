#!/usr/bin/env node
/**
 * Watches the current QA draft until it completes, then reports final state.
 * Read-only: it never writes, it only observes the unattended autopick cron.
 */
import { loadLocalEnv, signInQaActor, resolveQaFixture } from './qa-fixture.mjs';

loadLocalEnv();
const supabase = await signInQaActor('Commissioner');
const fixture = await resolveQaFixture(supabase);
const draftId = fixture.draft.id;

const deadlineMs = Date.now() + 75 * 60 * 1000;
let last = -1;

while (Date.now() < deadlineMs) {
  const { data: draft } = await supabase
    .from('drafts')
    .select('status,current_pick,current_pick_deadline_at')
    .eq('id', draftId)
    .maybeSingle();
  const { data: picks } = await supabase
    .from('draft_picks')
    .select('id,is_auto_pick')
    .eq('draft_id', draftId)
    .not('picked_at', 'is', null);

  const made = picks?.length ?? 0;
  const auto = (picks ?? []).filter(p => p.is_auto_pick).length;
  if (made !== last) {
    console.log(`${new Date().toISOString()} status=${draft?.status} made=${made}/150 auto=${auto} pick=${draft?.current_pick}`);
    last = made;
  }
  if (draft?.status === 'completed' || made >= 150) {
    console.log(`DRAFT FINISHED status=${draft?.status} made=${made} auto=${auto}`);
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 30_000));
}
console.log('WATCH TIMEOUT: draft did not complete inside 75 minutes');
process.exit(2);
