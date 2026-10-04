-- Overlap guard for scheduled jobs (live scoring runs every minute, weekly
-- reconciliation every 15 minutes, and either can run longer than its
-- interval).
--
-- The jobs reach Postgres through PostgREST, where every call is its own
-- transaction on a pooled connection, so a session advisory lock cannot be
-- held for the length of a run. A lease row is used instead: a run takes the
-- lease for its job with an expiry, releases it when it ends, and a run that
-- dies without releasing is superseded once the expiry passes.
--
-- scripts/cron-lease.mjs fails open (runs the job, logs a warning) while these
-- functions do not exist, so the code may be deployed before this is applied.

create table if not exists public.cron_job_leases (
  job text primary key,
  holder uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.cron_job_leases enable row level security;
revoke all on table public.cron_job_leases from public, anon, authenticated;
grant select on table public.cron_job_leases to service_role;

-- True when the caller now holds the lease; false when another holder has an
-- unexpired lease on the job.
create or replace function public.acquire_cron_job_lease(
  p_job text,
  p_holder uuid,
  p_ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_acquired boolean;
begin
  if p_job is null or length(btrim(p_job)) = 0 then raise exception 'Job name required'; end if;
  if p_holder is null then raise exception 'Lease holder required'; end if;
  if p_ttl_seconds is null or p_ttl_seconds < 1 or p_ttl_seconds > 3600 then
    raise exception 'Lease duration must be between 1 and 3600 seconds';
  end if;

  insert into public.cron_job_leases as l (job, holder, acquired_at, expires_at)
  values (p_job, p_holder, clock_timestamp(), clock_timestamp() + make_interval(secs => p_ttl_seconds))
  on conflict (job) do update
    set holder = excluded.holder, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at
    where l.expires_at <= clock_timestamp() or l.holder = excluded.holder
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end
$function$;

-- Releases the lease only if the caller still holds it.
create or replace function public.release_cron_job_lease(
  p_job text,
  p_holder uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  delete from public.cron_job_leases where job = p_job and holder = p_holder;
  return found;
end
$function$;

revoke execute on function public.acquire_cron_job_lease(text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_cron_job_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_cron_job_lease(text, uuid, integer) to service_role;
grant execute on function public.release_cron_job_lease(text, uuid) to service_role;
