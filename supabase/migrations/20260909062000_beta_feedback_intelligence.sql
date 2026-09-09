-- Big Exec beta feedback intelligence
-- Raw player feedback is immutable evidence. AI/heuristic interpretation is stored separately.

create table if not exists public.beta_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  task_area text not null check (task_area in (
    'create_join_league','invite_people','draft','lineup','matchup_score','waivers','trade',
    'assistant_gm','standings','locker_room','accessibility','other'
  )),
  outcome text not null check (outcome in ('easy_success','confusing_success','partial','failed')),
  ease_rating smallint not null check (ease_rating between 1 and 5),
  happened text not null,
  expected text not null,
  frustration text,
  liked text,
  improvement text,
  missing_capability text,
  churn_risk text not null check (churn_risk in ('definitely','maybe','probably_not','no')),
  disappointment text not null check (disappointment in ('very','somewhat','not')),
  nps_score smallint not null check (nps_score between 0 and 10),
  page_path text,
  client_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.beta_feedback_submissions is
  'Immutable raw beta-player feedback. Never overwrite user wording with analysis.';

create table if not exists public.beta_feedback_analysis (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.beta_feedback_submissions(id) on delete cascade,
  category text not null check (category in (
    'bug','ux_confusion','accessibility','performance','missing_feature','feature_request',
    'data_scoring','assistant_gm','positive','other'
  )),
  problem_statement text not null,
  user_requested_solution text,
  proposed_action text not null,
  severity smallint not null check (severity between 1 and 5),
  churn_risk_score smallint not null check (churn_risk_score between 1 and 5),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  feature_candidate boolean not null default false,
  cluster_key text not null,
  cluster_count integer not null default 1 check (cluster_count > 0),
  review_status text not null default 'pending' check (review_status in ('pending','approved','denied','deferred','investigate')),
  implementation_proposal jsonb,
  analysis_version text not null default 'heuristic-v1',
  analyzed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists beta_feedback_analysis_review_status_idx
  on public.beta_feedback_analysis(review_status, severity desc, churn_risk_score desc, analyzed_at desc);
create index if not exists beta_feedback_analysis_cluster_key_idx
  on public.beta_feedback_analysis(cluster_key);

create table if not exists public.beta_feedback_review_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.beta_feedback_analysis(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  previous_status text,
  new_status text not null check (new_status in ('pending','approved','denied','deferred','investigate')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.beta_feedback_submissions enable row level security;
alter table public.beta_feedback_analysis enable row level security;
alter table public.beta_feedback_review_events enable row level security;

-- No direct anon/authenticated policies by design. Reads/writes happen through server-side
-- actions after explicit membership/admin authorization. Service role bypasses RLS.
revoke all on public.beta_feedback_submissions from anon, authenticated;
revoke all on public.beta_feedback_analysis from anon, authenticated;
revoke all on public.beta_feedback_review_events from anon, authenticated;
