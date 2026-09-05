import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Hydration regression guards.
 *
 * These are source assertions, not runtime hydration tests. This workspace has no
 * DOM hydration harness, and a hydration mismatch only manifests when the server
 * render and the first client render disagree. Guarding the two patterns that
 * caused it is the coverage available here.
 */
function source(relativePath: string) {
  return readFileSync(join(process.cwd(), 'app', relativePath), 'utf8');
}

describe('draft client components avoid hydration mismatches', () => {
  it('does not seed DraftClock time state from Date.now during render', () => {
    const clock = source('drafts/[draftId]/DraftClock.tsx');

    // Date.now() in a useState initializer runs on the server and again on the
    // client, producing two different countdowns for the same markup.
    expect(clock).not.toMatch(/useState\(\s*\(\)\s*=>\s*Date\.now\(\)\s*\)/);
    expect(clock).toContain('useState<number | null>(null)');
    expect(clock).toContain('setNow(Date.now())');
  });

  it('keeps the DraftClock accessible countdown label', () => {
    expect(source('drafts/[draftId]/DraftClock.tsx')).toContain('aria-label={`${totalSeconds} seconds remaining`}');
  });

  it('submits expired picks automatically once the server deadline has passed', () => {
    const clock = source('drafts/[draftId]/DraftClock.tsx');
    const page = source('drafts/[draftId]/page.tsx');

    expect(clock).toContain('requestSubmit()');
    expect(clock).toContain('submittedDeadline === deadlineAt');
    expect(page).toContain('processExpiredAction={processExpiredDraftPick}');
  });

  it('formats draft ranking dates with an explicit locale and time zone', () => {
    const pool = source('drafts/[draftId]/DraftPlayerPool.tsx');

    // An undefined locale resolves differently on server and client.
    expect(pool).not.toContain('toLocaleDateString(undefined');
    expect(pool).toContain("toLocaleDateString('en-US'");
    expect(pool).toContain("timeZone:'UTC'");
  });
});
