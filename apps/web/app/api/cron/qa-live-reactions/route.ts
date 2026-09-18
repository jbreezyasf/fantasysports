// @ts-expect-error The operational stress-season module is native ESM.
import { runLiveQaReactions } from '../../../../../../scripts/stress-season/live-reactions.mjs';
import { authorizeCron, cronError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!authorizeCron(request)) return new Response('Unauthorized', { status: 401 });
  try {
    return Response.json({ ok: true, job: 'qa-live-reactions', result: await runLiveQaReactions() });
  } catch (error) {
    return cronError('qa-live-reactions', error);
  }
}

