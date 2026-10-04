-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260916092635, name threads_controlled_scheduler. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create table if not exists public.social_scheduler_cohorts (
  cohort_id text primary key,
  platform text not null,
  account_reference text not null,
  status text not null default 'prepared',
  scheduler_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.social_scheduler_cohort_items (
  cohort_id text not null references public.social_scheduler_cohorts(cohort_id) on delete cascade,
  content_artifact_id text not null,
  source_tab text not null,
  source_row_reference text not null,
  source_row_number integer not null,
  approved_copy_hash text not null,
  approved_copy_source text not null,
  origin text not null,
  scheduled_local_datetime text not null,
  scheduled_at_utc timestamptz not null,
  platform text not null,
  account_reference text not null,
  timezone text not null,
  status text not null default 'prepared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (cohort_id, content_artifact_id)
);

create table if not exists public.social_publication_jobs (
  publishing_job_id text primary key,
  cohort_id text not null references public.social_scheduler_cohorts(cohort_id),
  content_artifact_id text not null,
  platform text not null,
  account_reference text not null,
  scheduled_at_utc timestamptz not null,
  approved_copy_hash text not null,
  state text not null default 'prepared',
  attempt_count integer not null default 0,
  provider text not null default 'native_threads',
  provider_job_id text,
  platform_post_id text,
  post_url text,
  last_error text,
  irreversible_request_started_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (cohort_id, content_artifact_id)
);

create table if not exists public.social_publication_registrations (
  publication_id text primary key,
  publishing_job_id text not null unique references public.social_publication_jobs(publishing_job_id),
  content_artifact_id text not null,
  platform text not null,
  account_reference text not null,
  provider text not null default 'native_threads',
  platform_post_id text not null,
  post_url text,
  requested_schedule_at_utc timestamptz not null,
  published_at timestamptz not null,
  approved_copy_hash text not null,
  actually_published_copy text,
  origin text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (platform, account_reference, content_artifact_id),
  unique (provider, platform_post_id)
);

create table if not exists public.social_scheduler_events (
  id bigserial primary key,
  event_time timestamptz not null default now(),
  cohort_id text,
  publishing_job_id text,
  content_artifact_id text,
  event_type text not null,
  normalized_status text not null,
  safe_account_reference text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_social_scheduler_items_due
  on public.social_scheduler_cohort_items (cohort_id, scheduled_at_utc, status);

create index if not exists idx_social_publication_jobs_due
  on public.social_publication_jobs (cohort_id, scheduled_at_utc, state);

create index if not exists idx_social_scheduler_events_lookup
  on public.social_scheduler_events (cohort_id, content_artifact_id, event_time desc);

alter table public.social_scheduler_cohorts enable row level security;
alter table public.social_scheduler_cohort_items enable row level security;
alter table public.social_publication_jobs enable row level security;
alter table public.social_publication_registrations enable row level security;
alter table public.social_scheduler_events enable row level security;

revoke all on public.social_scheduler_cohorts from anon, authenticated;
revoke all on public.social_scheduler_cohort_items from anon, authenticated;
revoke all on public.social_publication_jobs from anon, authenticated;
revoke all on public.social_publication_registrations from anon, authenticated;
revoke all on public.social_scheduler_events from anon, authenticated;

grant all on public.social_scheduler_cohorts to service_role;
grant all on public.social_scheduler_cohort_items to service_role;
grant all on public.social_publication_jobs to service_role;
grant all on public.social_publication_registrations to service_role;
grant all on public.social_scheduler_events to service_role;
grant usage, select on sequence public.social_scheduler_events_id_seq to service_role;

insert into public.social_scheduler_cohorts (
  cohort_id,
  platform,
  account_reference,
  status,
  scheduler_enabled,
  metadata
) values (
  'CONTROLLED-COHORT-001',
  'THREADS',
  '28694172263511154',
  'prepared',
  false,
  '{"account_username":"iamjuanitabrazziel","timezone":"America/Chicago","source":"Phase 7F-B live Sheet read","sheet_publishing_mode":"DRY_RUN","threads_live_publishing_enabled":false}'::jsonb
) on conflict (cohort_id) do update set
  platform = excluded.platform,
  account_reference = excluded.account_reference,
  status = excluded.status,
  scheduler_enabled = false,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.social_scheduler_cohort_items (
  cohort_id,
  content_artifact_id,
  source_tab,
  source_row_reference,
  source_row_number,
  approved_copy_hash,
  approved_copy_source,
  origin,
  scheduled_local_datetime,
  scheduled_at_utc,
  platform,
  account_reference,
  timezone,
  status,
  metadata
) values
  ('CONTROLLED-COHORT-001','C01-THR-SEP2026-20260916-R005-P004','Threads - Sep 16-30','Threads - Sep 16-30!R5',5,'<REDACTED>','Human Final','HUMAN_EDITED_FACTORY','2026-09-16 17:00 America/Chicago','2026-09-16T22:00:00+00:00','THREADS','28694172263511154','America/Chicago','prepared','{"topic":"Meetings with no owner"}'::jsonb),
  ('CONTROLLED-COHORT-001','C01-THR-SEP2026-20260916-R006-P005','Threads - Sep 16-30','Threads - Sep 16-30!R6',6,'<REDACTED>','Factory Draft','FACTORY','2026-09-16 11:00 America/Chicago','2026-09-16T16:00:00+00:00','THREADS','28694172263511154','America/Chicago','prepared','{"topic":"Workflow pet peeves"}'::jsonb),
  ('CONTROLLED-COHORT-001','C01-THR-SEP2026-20260916-R008-P007','Threads - Sep 16-30','Threads - Sep 16-30!R8',8,'<REDACTED>','Factory Draft','FACTORY','2026-09-16 09:00 America/Chicago','2026-09-16T14:00:00+00:00','THREADS','28694172263511154','America/Chicago','prepared','{"topic":"Diagnosis before implementation"}'::jsonb),
  ('CONTROLLED-COHORT-001','C01-THR-SEP2026-20260916-R010-P001','Threads - Sep 16-30','Threads - Sep 16-30!R10',10,'<REDACTED>','Factory Draft','FACTORY','2026-09-16 13:00 America/Chicago','2026-09-16T18:00:00+00:00','THREADS','28694172263511154','America/Chicago','prepared','{"topic":"Sports execution"}'::jsonb),
  ('CONTROLLED-COHORT-001','C01-THR-SEP2026-20260917-R012-P003','Threads - Sep 16-30','Threads - Sep 16-30!R12',12,'<REDACTED>','Factory Draft','FACTORY','2026-09-17 09:00 America/Chicago','2026-09-17T14:00:00+00:00','THREADS','28694172263511154','America/Chicago','prepared','{"topic":"Overbuilt tools"}'::jsonb),
  ('CONTROLLED-COHORT-001','C01-THR-SEP2026-20260917-R016-P007','Threads - Sep 16-30','Threads - Sep 16-30!R16',16,'<REDACTED>','Factory Draft','FACTORY','2026-09-17 13:00 America/Chicago','2026-09-17T18:00:00+00:00','THREADS','28694172263511154','America/Chicago','prepared','{"topic":"Human-owned judgment"}'::jsonb)
on conflict (cohort_id, content_artifact_id) do update set
  source_tab = excluded.source_tab,
  source_row_reference = excluded.source_row_reference,
  source_row_number = excluded.source_row_number,
  approved_copy_hash = excluded.approved_copy_hash,
  approved_copy_source = excluded.approved_copy_source,
  origin = excluded.origin,
  scheduled_local_datetime = excluded.scheduled_local_datetime,
  scheduled_at_utc = excluded.scheduled_at_utc,
  platform = excluded.platform,
  account_reference = excluded.account_reference,
  timezone = excluded.timezone,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

notify pgrst, 'reload schema';
