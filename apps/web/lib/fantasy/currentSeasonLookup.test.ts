import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Multi-season league lookup invariant.
 *
 * A Big Exec league accumulates one `league_seasons` row per season. Selecting a
 * league's season by `league_id` alone with `.maybeSingle()` therefore returns an
 * error once a league has more than one season, the caller sees `null`, and the
 * page either 404s or silently drops data.
 *
 * This already shipped twice: the Free Agency page 404'd for the six-season QA
 * league, and the Trade Center, Schedule, Locker Room, League HQ, and mobile nav
 * all carried the same defect. Any query filtering `league_seasons` by
 * `league_id` for a single row must also pin `is_current`.
 */
function sourceFiles() {
  const output = execSync(
    "grep -rln \"from('league_seasons')\" app lib || true",
    { cwd: process.cwd(), encoding: 'utf8' }
  );
  return output.split('\n').filter(name => name && !name.includes('.test.'));
}

describe('current-season lookup invariant', () => {
  it('finds league_seasons queries to check', () => {
    expect(sourceFiles().length).toBeGreaterThan(0);
  });

  it('never selects a single league_seasons row by league_id without pinning is_current', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!line.includes("from('league_seasons')")) return;
        const singleRow = line.includes('maybeSingle') || /\.single\(\)/.test(line);
        if (!singleRow) return;
        // Selecting by the season's own id is unambiguous and needs no filter.
        const byLeagueId = /\.eq\(\s*'league_id'/.test(line);
        if (!byLeagueId) return;
        if (/\.eq\(\s*'is_current'\s*,\s*true\s*\)/.test(line)) return;
        offenders.push(`${file}:${index + 1}`);
      });
    }

    expect(
      offenders,
      'these queries return null for any league with more than one season'
    ).toEqual([]);
  });
});
