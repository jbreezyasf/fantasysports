import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**', 'coverage/**'] },

  // next/core-web-vitals: Next + React + React Hooks rules.
  // next/typescript: typescript-eslint "recommended".
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // eslint-plugin-jsx-a11y "recommended". Accessibility is a product requirement. The plugin
  // itself is already registered by next/core-web-vitals, so only the rule set is added here.
  { files: ['**/*.{jsx,tsx}'], rules: jsxA11y.flatConfigs.recommended.rules },

  // Existing violations on main when lint was introduced (2026-10-03). These are set to "warn"
  // so CI fails on new errors only, without rewriting application code. Fix the code, then
  // move each rule back to "error". Counts are the number of violations at introduction.
  {
    rules: {
      // 13, all in test files (gateway.test.ts, serverAudience.test.ts, entitlements.test.ts).
      '@typescript-eslint/no-explicit-any': 'warn',
      // 6: plain <a href="/"> links. Switching to <Link> changes navigation behaviour.
      '@next/next/no-html-link-for-pages': 'warn',
      // 1: app/drafts/[draftId]/page.tsx. Accessibility follow-up.
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
      // 1: app/leagues/[leagueId]/page.tsx. Accessibility follow-up.
      'jsx-a11y/no-interactive-element-to-noninteractive-role': 'warn',
      // 1: recap <video> has no captions track (app/recaps/[recapId]/page.tsx). Accessibility follow-up.
      'jsx-a11y/media-has-caption': 'warn',
      // Underscore-prefixed names are the codebase's convention for intentionally unused values.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }]
    }
  }
];

export default config;
