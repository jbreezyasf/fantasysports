import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), 'app', relativePath), 'utf8');
}

describe('League HQ information hierarchy', () => {
  it('keeps pending invitations visible and moves historical email records into collapsed details', () => {
    const page = source('leagues/[leagueId]/page.tsx');

    expect(page).toContain('INVITATIONS NEEDING ACTION');
    expect(page).toContain('<details className="inviteHistory">');
    expect(page).toContain('Invitation history');
    expect(page).not.toContain('Pending and historical league invitations');
  });

  it('uses the guided draft clock selector', () => {
    const page = source('leagues/[leagueId]/page.tsx');
    const fields = source('leagues/[leagueId]/DraftSettingsFields.tsx');

    expect(page).toContain('<DraftSettingsFields franchiseCount={memberCount}/>');
    expect(fields).toContain('const [pickSeconds, setPickSeconds] = useState(60)');
    expect(fields).toContain("seconds === 60 ? ' — Recommended' : ''");
    expect(fields).toContain('if every clock expires');
  });

  it('turns Draft Room into Free Agency and keeps the four Front Office destinations', () => {
    const page = source('leagues/[leagueId]/page.tsx');

    expect(page).toContain("frontOfficePrimaryLabel = draftComplete ? 'Free Agency' : 'Draft Room'");
    expect(page).toContain('frontOfficeActionGrid');
    expect(page).toContain('<strong>Locker Room</strong>');
    expect(page).toContain('<strong>Trade Room</strong>');
    expect(page).toContain('<strong>League News</strong>');
    expect(page).toContain('href={`/leagues/${leagueId}/trades`}');
    expect(page).toContain('<details className="frontOfficeSecondary">');
  });
});
