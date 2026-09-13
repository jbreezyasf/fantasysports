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

  it('replaces primary draft information with the Trade Room after completion', () => {
    const page = source('leagues/[leagueId]/page.tsx');

    expect(page).toContain('draftComplete ? <article className="leagueStatCard featured tradeRoomCard"');
    expect(page).toContain('MAKE THE NEXT MOVE');
    expect(page).toContain('href={`/leagues/${leagueId}/trades`}');
    expect(page).toContain("draft && !isCommissioner && !draftComplete");
  });
});
