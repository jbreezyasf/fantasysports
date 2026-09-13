import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), 'app', relativePath), 'utf8');
}

describe('draft room lifecycle', () => {
  it('lets the on-clock manager draft an available queued asset', () => {
    const page = source('drafts/[draftId]/page.tsx');
    const pool = source('drafts/[draftId]/DraftPlayerPool.tsx');

    expect(page).toContain("canDraft={userOnClock&&draft.status==='live'}");
    expect(pool).toContain('className="queueDraftReview"');
    expect(pool).toContain('action={makeDraftPick}');
    expect(pool).toContain('disabled={!canDraft}');
    expect(pool).toContain('>Confirm</button>');
  });

  it('shows the Big Exec letter and season actions after the draft', () => {
    const page = source('drafts/[draftId]/page.tsx');

    expect(page).toContain("draft.status==='completed'&&<section className=\"draftCompletionLetter\"");
    expect(page).toContain('Congratulations, Franchise Managers.');
    expect(page).toContain('get ready for some football');
    expect(page).toContain('Enter Trade Room');
  });
});
