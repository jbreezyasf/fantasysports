import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PasswordField from './PasswordField';

describe('PasswordField', () => {
  it('renders a password input with an explicit show control', () => {
    const html = renderToStaticMarkup(<PasswordField autoComplete="new-password" describedBy="password-help" />);

    expect(html).toContain('name="password"');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('aria-describedby="password-help"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-pressed="false"');
  });
});
