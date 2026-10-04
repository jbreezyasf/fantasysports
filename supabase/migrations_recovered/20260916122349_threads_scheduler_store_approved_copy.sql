-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260916122349, name threads_scheduler_store_approved_copy. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.social_scheduler_cohort_items
  add column if not exists approved_copy_text text;

update public.social_scheduler_cohort_items
set approved_copy_text = case content_artifact_id
  when 'C01-THR-SEP2026-20260916-R005-P004' then 'Which meeting is worse: An email meeting or a meeting where everybody knows the problem and nobody wants to say his name?'
  when 'C01-THR-SEP2026-20260916-R006-P005' then 'What is a tiny business habit that tells you the whole process is held together with tape?

I''ll start: every answer lives in one person''s head.'
  when 'C01-THR-SEP2026-20260916-R008-P007' then 'Before I build anything with AI, I want to know three things:

What problem does it solve?
Who uses it?
What happens when it breaks?

That third question tells on everybody.'
  when 'C01-THR-SEP2026-20260916-R010-P001' then 'Sports will humble every vague strategy.

You can talk culture all day. Somebody still has to box out.'
  when 'C01-THR-SEP2026-20260917-R012-P003' then 'If the thing already exists, works, and costs less than your custom build, the question is not "can we build it?"

The question is why are we doing all this.'
  when 'C01-THR-SEP2026-20260917-R016-P007' then 'My rule: AI can draft, sort, remind, summarize, and prepare.

A human still owns judgment, accountability, relationship, and the final call.'
  else approved_copy_text
end,
updated_at = now()
where cohort_id = 'CONTROLLED-COHORT-001';

notify pgrst, 'reload schema';
