import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(process.cwd(), 'app');

describe('fixed control layout', () => {
  it('keeps language controls away from top-right account actions', () => {
    const css = readFileSync(resolve(appRoot, 'product-shell.css'), 'utf8');
    expect(css).toContain('.languageToggle{position:fixed;left:14px;bottom:14px');
    expect(css).toContain('bottom:calc(var(--mobile-nav-height,72px) + 12px)');
    expect(css).not.toMatch(/\.languageToggle\{[^}]*right:14px;top:14px/);
  });

  it('stacks the temporary PWA prompt above the language control', () => {
    const css = readFileSync(resolve(appRoot, 'globals.css'), 'utf8');
    expect(css).toContain('bottom:76px');
    expect(css).toContain('bottom:calc(var(--mobile-nav-height,72px) + 64px)');
  });
});
