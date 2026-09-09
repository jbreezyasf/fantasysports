import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260909070139_immutable_beta_feedback_submissions.sql'),
  'utf8'
);

describe('beta feedback migration contract', () => {
  it('enforces immutable raw beta feedback submissions', () => {
    expect(migration).toContain('Raw beta feedback submissions are immutable');
    expect(migration).toContain('before update on public.beta_feedback_submissions');
    expect(migration).toContain('before delete on public.beta_feedback_submissions');
    expect(migration).toContain('revoke execute on function public.prevent_beta_feedback_submission_changes() from public, anon, authenticated');
  });
});
