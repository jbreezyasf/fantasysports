import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageToggle, LocaleProvider } from './LocaleProvider';

describe('Big Exec locale controls', () => {
  it('renders an accessible English and Spanish selector', () => {
    const html = renderToStaticMarkup(<LocaleProvider><LanguageToggle /></LocaleProvider>);
    expect(html).toContain('aria-label="Language"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('lang="es-419"');
  });
});
