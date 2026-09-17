import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PwaInstallPrompt, { isInstallPromptDismissed } from './PwaInstallPrompt';

describe('PWA install prompt', () => {
  it('keeps a dismissal quiet for seven days and allows a later reminder', () => {
    const now = Date.UTC(2026, 8, 17);
    expect(isInstallPromptDismissed(String(now - 6 * 24 * 60 * 60 * 1000), now)).toBe(true);
    expect(isInstallPromptDismissed(String(now - 8 * 24 * 60 * 60 * 1000), now)).toBe(false);
    expect(isInstallPromptDismissed(null, now)).toBe(false);
  });

  it('does not flash an install card during server rendering', () => {
    expect(renderToStaticMarkup(<PwaInstallPrompt />)).toBe('');
  });
});
