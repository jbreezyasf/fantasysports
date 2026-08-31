import { defineConfig, devices } from '@playwright/test';

const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'qa-artifacts/playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.QA_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
});
