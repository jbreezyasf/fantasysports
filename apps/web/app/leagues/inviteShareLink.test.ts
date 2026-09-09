import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const leagueActions = () => readFileSync('app/leagues/actions.ts', 'utf8');
const leaguePage = () => readFileSync('app/leagues/[leagueId]/page.tsx', 'utf8');
const invitePage = () => readFileSync('app/invite/[token]/page.tsx', 'utf8');

describe('league share invite links', () => {
  it('exposes a commissioner share-link action separate from email delivery', () => {
    expect(leagueActions()).toContain('createLeagueShareInvite');
    expect(leagueActions()).toContain("rpc('create_league_share_invite'");
    expect(leaguePage()).toContain('Create Share Link');
  });

  it('lets share invites bypass exact-email matching before franchise claim', () => {
    const source = invitePage();

    expect(source).toContain("rpc('get_public_league_invite_v2'");
    expect(source).toContain("inviteKind !== 'share' && !inviteMatchesUser");
  });

  it('binds share invites to the signed-in account before using the canonical accept RPC', () => {
    const source = leagueActions();
    const claimIndex = source.indexOf("rpc('claim_share_league_invite'");
    const acceptIndex = source.indexOf("rpc('accept_league_invite'");

    expect(claimIndex).toBeGreaterThan(-1);
    expect(acceptIndex).toBeGreaterThan(claimIndex);
  });
});
