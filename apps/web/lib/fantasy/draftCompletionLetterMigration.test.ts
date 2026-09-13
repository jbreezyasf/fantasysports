import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('draft completion letter migration', () => {
  it('posts one league feed letter on the completed transition', () => {
    const migration = readFileSync(join(process.cwd(), '../../supabase/migrations/20260913100734_draft_completion_letter.sql'), 'utf8');

    expect(migration).toContain('after update of status on public.drafts');
    expect(migration).toContain("new.status = 'completed'");
    expect(migration).toContain("event.event_type = 'draft_completed'");
    expect(migration).toContain("event.payload->>'draft_id' = new.id::text");
    expect(migration).toContain('Dear Franchise Managers');
    expect(migration).toContain('get ready for some football');
  });
});
