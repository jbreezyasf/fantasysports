import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The operational scripts are native ESM outside the web TypeScript project.
// These guards keep the production cron defaults explicit and reviewable.
const repoRoot = resolve(process.cwd(), '../..');

describe('weekly automation production configuration', () => {
  it('lets the protected production cron run QA participation without a manual switch', () => {
    const source = readFileSync(
      resolve(repoRoot, 'scripts/stress-season/weekly-participation.mjs'),
      'utf8',
    );

    expect(source).toContain("env.VERCEL_ENV==='production'");
    expect(source).toContain("leagueId!==STRESS_LEAGUE_ID");
  });

  it('uses the known public project URL when the weekly cron lacks the public binding', () => {
    const source = readFileSync(
      resolve(repoRoot, 'scripts/import-balldontlie-nfl-weekly-stats.mjs'),
      'utf8',
    );

    expect(source).toContain(
      "process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://njjiqdqhmcbxblwhfade.supabase.co'",
    );
    expect(source).not.toContain("!dbUrl && 'NEXT_PUBLIC_SUPABASE_URL'");
  });
});
