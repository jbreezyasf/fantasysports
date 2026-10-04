import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Overlap guard for scheduled jobs. See
// supabase/migrations/20261003050000_cron_job_leases.sql.
//
// - Lease taken: the job runs, and the lease is released when it ends.
// - Lease held by another run that has not expired: the job is skipped.
// - Lease cannot be checked (functions not applied yet, database error): the
//   job RUNS and a warning is logged. Scoring without a guard is how the jobs
//   ran before this existed; not scoring at all would be worse.
//
// ttlSeconds must be longer than the longest a run can take, so the lease of a
// run that was killed expires soon after instead of blocking the job.
export async function withCronLease({ db, job, ttlSeconds, holder = randomUUID(), log = console }, run) {
  let held = false;
  try {
    const { data, error } = await db.rpc('acquire_cron_job_lease', { p_job: job, p_holder: holder, p_ttl_seconds: ttlSeconds });
    if (error) throw new Error(error.message);
    if (data === false) {
      log.warn(JSON.stringify({ job, warning: 'cron-run-skipped-previous-run-still-active' }));
      return { skipped: true, reason: 'previous run still holds the lease', job };
    }
    if (data !== true) throw new Error(`unexpected lease response: ${JSON.stringify(data)}`);
    held = true;
  } catch (error) {
    log.warn(JSON.stringify({ job, warning: 'cron-lease-unavailable-running-unguarded', message: error instanceof Error ? error.message : String(error) }));
  }
  try {
    return await run();
  } finally {
    if (held) {
      try {
        const { error } = await db.rpc('release_cron_job_lease', { p_job: job, p_holder: holder });
        if (error) throw new Error(error.message);
      } catch (error) {
        log.warn(JSON.stringify({ job, warning: 'cron-lease-release-failed', message: error instanceof Error ? error.message : String(error), expiresInSeconds: ttlSeconds }));
      }
    }
  }
}

// Used by the cron routes. Uses the same bindings as the jobs themselves; when
// the database key is missing the job is run directly so it reports that
// missing binding in its own words.
export async function withCronLeaseFromEnv(job, ttlSeconds, run) {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://njjiqdqhmcbxblwhfade.supabase.co';
  const dbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbKey) return run();
  const db = createClient(dbUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return withCronLease({ db, job, ttlSeconds }, run);
}
