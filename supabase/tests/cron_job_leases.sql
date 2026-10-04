-- Executable test for 20261003050000_cron_job_leases.sql.
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_test -f supabase/tests/cron_job_leases.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

\ir ../migrations/20261003050000_cron_job_leases.sql

create function pg_temp.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAILED: %', p_label; end if;
  raise info 'ok - %', p_label;
end $$;

\set run1 '''00000000-0000-0000-0000-000000000001'''
\set run2 '''00000000-0000-0000-0000-000000000002'''

select pg_temp.expect(public.acquire_cron_job_lease('live-scoring', :run1, 830), 'first run takes the lease');
select pg_temp.expect(not public.acquire_cron_job_lease('live-scoring', :run2, 830), 'an overlapping run is refused');
select pg_temp.expect((select holder = :run1 from public.cron_job_leases where job = 'live-scoring'), 'the refused run did not disturb the lease');
select pg_temp.expect(public.acquire_cron_job_lease('weekly-scoring-reconciliation', :run2, 830), 'a different job has its own lease');
select pg_temp.expect(not public.release_cron_job_lease('live-scoring', :run2), 'a run cannot release a lease it does not hold');
select pg_temp.expect(public.release_cron_job_lease('live-scoring', :run1), 'the holder releases its lease');
select pg_temp.expect(public.acquire_cron_job_lease('live-scoring', :run2, 830), 'the next run takes the lease after release');

-- A run that died without releasing: its lease is superseded once it expires.
update public.cron_job_leases set expires_at = clock_timestamp() - interval '1 second' where job = 'live-scoring';
select pg_temp.expect(public.acquire_cron_job_lease('live-scoring', :run1, 830), 'an expired lease is taken over');
select pg_temp.expect((select holder = :run1 and expires_at > clock_timestamp() + interval '820 seconds' from public.cron_job_leases where job = 'live-scoring'), 'the takeover records the new holder and expiry');

do $$ begin
  perform public.acquire_cron_job_lease('live-scoring', gen_random_uuid(), 0);
  raise exception 'FAILED: a zero-second lease was accepted';
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
  raise info 'ok - an out-of-range lease duration is rejected';
end $$;

select pg_temp.expect(
  has_function_privilege('service_role', 'public.acquire_cron_job_lease(text, uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.acquire_cron_job_lease(text, uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.acquire_cron_job_lease(text, uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.release_cron_job_lease(text, uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.cron_job_leases', 'select'),
  'only the service role can use leases');

\echo ALL CRON JOB LEASE TESTS PASSED
