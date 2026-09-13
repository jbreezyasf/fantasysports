// This operational module remains executable from npm while also powering Vercel Cron.
// @ts-expect-error The repository script is native ESM without TypeScript declarations.
import { runWeeklyStatsImport } from '../../../../../../scripts/import-balldontlie-nfl-weekly-stats.mjs';
import { authorizeCron, cronError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

export async function GET(request: Request) {
  if (!authorizeCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    const result = await runWeeklyStatsImport();
    return Response.json({ ok: true, job: 'live-scoring', result });
  } catch (error) {
    return cronError('live-scoring', error);
  }
}
