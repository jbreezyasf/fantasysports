import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync('app/dashboard/page.tsx', 'utf8');

describe('dashboard access queries', () => {
  it('loads pending invitations without nesting fantasy_leagues for non-members', () => {
    const dashboard = source();

    expect(dashboard).toContain("from('league_invites').select('id,invite_token,email,status,expires_at')");
    expect(dashboard).toContain(".eq('email', userEmail)");
    expect(dashboard).toContain("rpc('get_public_league_invite'");
    expect(dashboard).not.toContain("from('league_invites').select('id,invite_token,email,status,expires_at,fantasy_leagues(name)'");
  });

  it('loads leagues through the current user membership boundary', () => {
    const dashboard = source();

    expect(dashboard).toContain("from('league_members')");
    expect(dashboard).toContain(".eq('user_id', user.id)");
    expect(dashboard).not.toContain("from('fantasy_leagues').select('id,name,created_at");
  });
});
