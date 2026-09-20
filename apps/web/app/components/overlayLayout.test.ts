import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(process.cwd(), 'app');

describe('competitive shell collision contract', () => {
  it('keeps language settings in normal flow inside More', () => {
    const css = readFileSync(resolve(appRoot, 'product-shell.css'), 'utf8');
    expect(css).toContain('.languageToggle{position:static;left:auto;bottom:auto');
  });

  it('keeps install suggestions in document flow', () => {
    const css = readFileSync(resolve(appRoot, 'globals.css'), 'utf8');
    expect(css).toContain('.pwaInstallPrompt{position:relative');
  });

  it('expands score detail rows in flow on mobile', () => {
    const css = readFileSync(resolve(appRoot, 'product-shell.css'), 'utf8');
    expect(css).toContain('.scoreBreakdownGrid{position:static!important');
  });
});
