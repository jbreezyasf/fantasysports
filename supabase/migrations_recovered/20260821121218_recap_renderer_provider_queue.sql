-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260821121218, name recap_renderer_provider_queue. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.recap_renders
  add column if not exists renderer_provider text not null default 'self_hosted',
  add column if not exists provider_job_id text,
  add column if not exists worker_id text,
  add column if not exists attempts integer not null default 0,
  add column if not exists started_at timestamptz;

alter table public.recap_renders drop constraint if exists recap_renders_renderer_provider_check;
alter table public.recap_renders add constraint recap_renders_renderer_provider_check check (renderer_provider in ('self_hosted','managed'));

create or replace function public.claim_recap_render(p_worker_id text, p_provider text default 'self_hosted')
returns public.recap_renders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.recap_renders;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_job
  from public.recap_renders
  where status = 'pending' and renderer_provider = p_provider
  order by created_at
  for update skip locked
  limit 1;
  if v_job.id is null then return null; end if;
  update public.recap_renders
  set status='rendering', worker_id=p_worker_id, started_at=now(), attempts=attempts+1, error_message=null
  where id=v_job.id
  returning * into v_job;
  return v_job;
end;
$$;

create or replace function public.complete_recap_render(p_render_id uuid, p_storage_key text, p_bytes bigint, p_duration_ms integer, p_provider_job_id text default null)
returns public.recap_renders
language plpgsql
security definer
set search_path = public
as $$
declare v_job public.recap_renders;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  update public.recap_renders set status='ready', storage_key=p_storage_key, bytes=p_bytes, duration_ms=p_duration_ms,
    provider_job_id=coalesce(p_provider_job_id,provider_job_id), completed_at=now(), error_message=null
  where id=p_render_id returning * into v_job;
  return v_job;
end;
$$;

create or replace function public.fail_recap_render(p_render_id uuid, p_error text)
returns public.recap_renders
language plpgsql
security definer
set search_path = public
as $$
declare v_job public.recap_renders;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  update public.recap_renders set status=case when attempts < 3 then 'pending' else 'failed' end,
    error_message=left(p_error,2000), worker_id=null
  where id=p_render_id returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.claim_recap_render(text,text) from public, anon, authenticated;
revoke all on function public.complete_recap_render(uuid,text,bigint,integer,text) from public, anon, authenticated;
revoke all on function public.fail_recap_render(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_recap_render(text,text) to service_role;
grant execute on function public.complete_recap_render(uuid,text,bigint,integer,text) to service_role;
grant execute on function public.fail_recap_render(uuid,text) to service_role;
