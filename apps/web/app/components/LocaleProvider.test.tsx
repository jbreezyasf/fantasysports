import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageToggle, LocaleProvider, translateMessage } from './LocaleProvider';

describe('Big Exec locale controls', () => {
  it('renders an accessible English and Spanish selector', () => {
    const html = renderToStaticMarkup(<LocaleProvider><LanguageToggle /></LocaleProvider>);
    expect(html).toContain('aria-label="Language"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('lang="es-419"');
  });
  it('includes public, account, and gameplay Spanish copy',()=>{
    expect(translateMessage('Run the franchise.')).toBe('Dirige la franquicia.');
    expect(translateMessage('Create your account.')).toBe('Crea tu cuenta.');
    expect(translateMessage('Submit Claim')).toBe('Enviar Reclamo');
    expect(translateMessage('League News')).toBe('Noticias de la Liga');
  });
});
