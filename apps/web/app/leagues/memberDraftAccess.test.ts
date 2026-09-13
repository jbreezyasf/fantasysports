import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('league member draft access', () => {
  it('renders a live draft-room entry outside commissioner-only controls', () => {
    const page = readFileSync(join(process.cwd(), 'app/leagues/[leagueId]/page.tsx'), 'utf8');
    const memberEntry = page.indexOf('const frontOfficePrimaryHref');
    const commissionerControls = page.indexOf('{isCommissioner && (');

    expect(memberEntry).toBeGreaterThan(-1);
    expect(memberEntry).toBeLessThan(commissionerControls);
    expect(page).toContain("draft ? `/drafts/${draft.id}`");
    expect(page).toContain("draft?.status==='live'?'The room is live. Make your pick.'");
    expect(page).toContain("frontOfficePrimaryLabel = draftComplete ? 'Free Agency' : 'Draft Room'");
    expect(page).toContain("const draftComplete = draft?.status === 'completed'");
  });
});
