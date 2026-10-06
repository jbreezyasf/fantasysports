// Daily stat-correction pass. Re-imports the current week and the two weeks
// before it (STAT_CORRECTION_WEEKS) and corrects matchups that are already
// final when a total changed: see system_correct_final_matchups in
// supabase/migrations/20261005010000_final_matchup_stat_corrections.sql.
// @ts-expect-error The repository script is native ESM without TypeScript declarations.
import { runWeeklyStatsImport } from '../../../../../../scripts/import-balldontlie-nfl-weekly-stats.mjs';
// @ts-expect-error The repository script is native ESM without TypeScript declarations.
import { withCronLeaseFromEnv } from '../../../../../../scripts/cron-lease.mjs';
import { authorizeCron, cronError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const LEASE_SECONDS = maxDuration + 30;

export async function GET(request: Request) {
  if (!authorizeCron(request)) return new Response('Unauthorized', { status: 401 });
  try {
    // The same lease as the 15-minute scoring job: both call the same provider
    // under one rate limit, so they must never run at the same time.
    const result = await withCronLeaseFromEnv('weekly-scoring-reconciliation', LEASE_SECONDS, () => runWeeklyStatsImport({ mode: 'corrections' }));
    return Response.json({ ok: true, job: 'stat-corrections', result });
  } catch (error) {
    return cronError('stat-corrections', error);
  }
}
