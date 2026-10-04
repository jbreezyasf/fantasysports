// This operational module uses the provider's real-time game-stat endpoints.
// @ts-expect-error The repository script is native ESM without TypeScript declarations.
import { runLiveStatsImport } from '../../../../../../scripts/import-balldontlie-nfl-live-stats.mjs';
// @ts-expect-error The repository script is native ESM without TypeScript declarations.
import { withCronLeaseFromEnv } from '../../../../../../scripts/cron-lease.mjs';
import { authorizeCron, cronError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

// Longer than maxDuration, so a run that was killed frees the job soon after.
const LEASE_SECONDS = maxDuration + 30;

export async function GET(request: Request) {
  if (!authorizeCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    const result = await withCronLeaseFromEnv('live-scoring', LEASE_SECONDS, () => runLiveStatsImport());
    return Response.json({ ok: true, job: 'live-scoring', result });
  } catch (error) {
    return cronError('live-scoring', error);
  }
}
