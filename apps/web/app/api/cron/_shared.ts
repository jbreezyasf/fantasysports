import { timingSafeEqual } from 'node:crypto';

export function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function cronError(job: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[cron:${job}] ${message}`);
  return Response.json({ ok: false, job, error: 'Scheduled job failed. Check Vercel runtime logs.' }, { status: 500 });
}
