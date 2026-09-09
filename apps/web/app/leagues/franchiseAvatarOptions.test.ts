import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const actions = () => readFileSync('app/leagues/actions.ts', 'utf8');
const leaguePage = () => readFileSync('app/leagues/[leagueId]/page.tsx', 'utf8');
const teamPage = () => readFileSync('app/franchises/[franchiseId]/team/page.tsx', 'utf8');
const stadiumPage = () => readFileSync('app/franchises/[franchiseId]/stadium/page.tsx', 'utf8');
const stadiumExperience = () => readFileSync('app/franchises/[franchiseId]/stadium/StadiumLegacyExperience.tsx', 'utf8');
const matchupPage = () => readFileSync('app/matchups/[matchupId]/page.tsx', 'utf8');
const migration = () => readFileSync('../../supabase/migrations/20260909043603_franchise_avatar_options.sql', 'utf8');

describe('franchise avatar options', () => {
  it('stores avatar_key during league creation and invite acceptance', () => {
    expect(actions()).toContain("p_avatar_key: String(formData.get('avatar_key') ?? 'classic')");
    expect(migration()).toContain('add column if not exists avatar_key text not null default');
    expect(migration()).toContain("check (avatar_key in ('classic', 'crown', 'tower', 'orbit'))");
    expect(migration()).toContain('p_avatar_key text default');
  });

  it('reads selected avatar styles into the major franchise identity surfaces', () => {
    expect(leaguePage()).toContain('avatar_key');
    expect(leaguePage()).toContain('avatarKey={franchise.avatar_key}');
    expect(teamPage()).toContain('avatar_key');
    expect(teamPage()).toContain('avatarKey={franchise.avatar_key}');
    expect(stadiumPage()).toContain('avatar_key');
    expect(stadiumExperience()).toContain('avatarKey={franchise.avatarKey}');
    expect(matchupPage()).toContain('avatar_key');
    expect(matchupPage()).toContain('avatarKey={homeFranchise?.avatar_key}');
  });
});
