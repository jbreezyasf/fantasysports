// These operational modules remain executable from npm while also powering Vercel Cron.
// @ts-expect-error The repository scripts are native ESM without TypeScript declarations.
import { runMarketImport } from '../../../../../../scripts/import-balldontlie-nfl-market-values.mjs';
// @ts-expect-error The repository scripts are native ESM without TypeScript declarations.
import { runProviderRankingHealth } from '../../../../../../scripts/provider-ranking-health.mjs';
import { authorizeCron, cronError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

export async function GET(request: Request) {
  if (!authorizeCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    const imported = await runMarketImport();
    const health = await runProviderRankingHealth();
    return Response.json({ ok: true, job: 'provider-rankings', imported, health });
  } catch (error) {
    return cronError('provider-rankings', error);
  }
}
