-- PROPOSED, NOT APPLIED. Lives outside supabase/migrations on purpose.
-- This SQL has not been executed against any database. Review, test on a branch database, then
-- move it into supabase/migrations to apply it.
--
-- Backs apps/web/lib/security/rateLimit.ts. Until this exists the app fails open (requests are
-- allowed and a warning is logged), so applying it is what switches rate limiting on.

create table if not exists public.rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);

create index if not exists rate_limit_counters_window_start_idx
  on public.rate_limit_counters (window_start);

-- Only the service role (which bypasses RLS) may touch the counters. No policies are defined,
-- so anon and authenticated clients have no access.
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

-- Atomically counts one hit in the current fixed window and reports whether it is within the
-- limit. Keys are opaque hashes produced by the application; no emails, IPs or user ids are stored.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, hits integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_key is null or p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'rate_limit_hit: invalid arguments';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters as c (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  -- Opportunistic cleanup so the table stays small without a scheduled job.
  if random() < 0.01 then
    delete from public.rate_limit_counters r where r.window_start < now() - interval '1 day';
  end if;

  return query select
    v_hits <= p_limit,
    v_hits,
    greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
