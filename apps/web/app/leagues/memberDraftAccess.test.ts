import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('league member draft access', () => {
  it('renders a live draft-room entry outside commissioner-only controls', () => {
    const page = readFileSync(join(process.cwd(), 'app/leagues/[leagueId]/page.tsx'), 'utf8');
    const memberEntry = page.indexOf('{draft && !isCommissioner && !draftComplete && (');
    const commissionerControls = page.indexOf('{isCommissioner && (');

    expect(memberEntry).toBeGreaterThan(-1);
    expect(memberEntry).toBeLessThan(commissionerControls);
    expect(page).toContain("draft.status === 'live' ? 'Enter Live Draft' : 'Enter Draft Room'");
    expect(page).toContain('href={`/drafts/${draft.id}`}');
    expect(page).toContain("const draftComplete = draft?.status === 'completed'");
  });
});
