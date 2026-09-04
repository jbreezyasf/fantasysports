import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA fixture ids are recreated by `npm run qa:league:reset`, so every league,
 * season, franchise, and draft uuid changes. Ids recorded in `qa-artifacts/**`
 * and `docs/GATE_STATUS.md` are a historical record of the run that produced
 * them, not reusable handles.
 *
 * Pointing a script or a browser at an id copied from a past artifact silently
 * 404s, which looks like a broken product rather than a stale id. These guards
 * keep QA tooling resolving ids live through `scripts/qa-fixture.mjs`.
 */
const scriptsDir = join(process.cwd(), '..', '..', 'scripts');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function scriptFiles() {
  return readdirSync(scriptsDir).filter(name => name.endsWith('.mjs'));
}

describe('QA tooling resolves fixture ids instead of hard-coding them', () => {
  it('has QA scripts to check', () => {
    expect(scriptFiles().length).toBeGreaterThan(0);
  });

  it('contains no hard-coded uuid in any QA script', () => {
    const offenders = scriptFiles()
      .map(name => {
        const lines = readFileSync(join(scriptsDir, name), 'utf8').split('\n');
        const hits = lines
          .map((line, index) => ({ line, number: index + 1 }))
          .filter(entry => UUID.test(entry.line));
        return { name, hits };
      })
      .filter(entry => entry.hits.length > 0);

    expect(
      offenders.map(entry => `${entry.name}: ${entry.hits.map(hit => `line ${hit.number}`).join(', ')}`),
      'QA scripts must resolve ids via scripts/qa-fixture.mjs, never embed a uuid'
    ).toEqual([]);
  });

  it('exposes a live resolver and a CLI for current ids', () => {
    const resolver = readFileSync(join(scriptsDir, 'qa-fixture.mjs'), 'utf8');

    expect(resolver).toContain('export async function resolveQaFixture');
    expect(resolver).toContain('QA_LEAGUE_NAME');
    // Lookups must be by stable name, not a remembered id.
    expect(resolver).toContain(".eq('name', QA_LEAGUE_NAME)");
    expect(resolver).toContain(".eq('is_current', true)");
  });

  it('keeps the QA id CLI wired into package scripts', () => {
    const rootPackage = JSON.parse(readFileSync(join(process.cwd(), '..', '..', 'package.json'), 'utf8'));

    expect(rootPackage.scripts['qa:ids']).toBe('node scripts/qa-fixture.mjs');
  });
});
