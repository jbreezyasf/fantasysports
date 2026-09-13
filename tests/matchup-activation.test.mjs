import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('matchup navigation always has a useful destination', async () => {
  const source = await readFile('apps/web/app/components/BigExecMobileNav.tsx', 'utf8');
  assert.match(source, /find\(matchup=>!matchup\.is_final\)/);
  assert.match(source, /`\/leagues\/\$\{leagueId\}\/schedule`/);
});

test('completed drafts automatically create a schedule', async () => {
  const sql = await readFile('supabase/migrations/20260913175906_auto_schedule_after_draft.sql', 'utf8');
  assert.match(sql, /after update of status on public\.drafts/i);
  assert.match(sql, /for v_week in 1\.\.9 loop/i);
  assert.match(sql, /matchups', 45/i);
});

test('live score UI refreshes without requiring a button press', async () => {
  const source = await readFile('apps/web/app/matchups/[matchupId]/MatchupLiveRefresh.tsx', 'utf8');
  assert.match(source, /REFRESH_MS = 30_000/);
  assert.match(source, /router\.refresh\(\)/);
});
