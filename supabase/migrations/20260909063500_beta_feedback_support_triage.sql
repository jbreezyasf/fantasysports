alter table public.beta_feedback_analysis
  add column if not exists support_recommended boolean not null default false,
  add column if not exists support_reason text,
  add column if not exists support_summary text,
  add column if not exists support_response_draft text,
  add column if not exists support_disposition text not null default 'none'
    check (support_disposition in ('none','recommended','send_to_support','resolved'));

create index if not exists beta_feedback_analysis_support_idx
  on public.beta_feedback_analysis(support_disposition, severity desc, analyzed_at desc);

comment on column public.beta_feedback_analysis.support_disposition is
  'Owner-controlled support routing. Analysis may recommend support, but only the Big Exec admin decides to send an item to support staff.';
