-- Enforce immutable raw beta feedback at the database layer.
-- Analysis, support routing, and review decisions live in separate tables.

create or replace function public.prevent_beta_feedback_submission_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Raw beta feedback submissions are immutable';
end;
$$;

drop trigger if exists beta_feedback_submissions_immutable_update on public.beta_feedback_submissions;
create trigger beta_feedback_submissions_immutable_update
  before update on public.beta_feedback_submissions
  for each row execute function public.prevent_beta_feedback_submission_changes();

drop trigger if exists beta_feedback_submissions_immutable_delete on public.beta_feedback_submissions;
create trigger beta_feedback_submissions_immutable_delete
  before delete on public.beta_feedback_submissions
  for each row execute function public.prevent_beta_feedback_submission_changes();

revoke execute on function public.prevent_beta_feedback_submission_changes() from public, anon, authenticated;
