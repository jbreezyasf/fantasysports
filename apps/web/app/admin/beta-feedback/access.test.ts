import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, 'page.tsx'), 'utf8');
const actions = readFileSync(join(here, 'actions.ts'), 'utf8');

describe('beta feedback admin boundary', () => {
  it('requires the dedicated owner/admin check on both reads and writes', () => {
    expect(page).toContain('isBetaFeedbackAdmin(user.email)');
    expect(actions).toContain('isBetaFeedbackAdmin(user.email)');
  });

  it('does not grant access based on commissioner role', () => {
    expect(page).not.toContain("eq('role','commissioner')");
    expect(page).not.toContain("eq('role', 'commissioner')");
    expect(actions).not.toContain("eq('role','commissioner')");
    expect(actions).not.toContain("eq('role', 'commissioner')");
  });

  it('keeps product approval separate from deployment', () => {
    expect(page).toContain('It does not deploy code or automatically add a feature');
  });
});
