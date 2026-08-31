#!/usr/bin/env node
import { access, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import nextEnv from '@next/env';
import { QA_ACTORS } from './qa-actors.mjs';

nextEnv.loadEnvConfig(process.cwd());

const appUrl = (process.env.QA_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const password = process.env.QA_AUTH_PASSWORD;

if (!password) {
  console.error('QA_AUTH_PASSWORD is required to save QA browser storage state. Do not commit it.');
  process.exit(1);
}

await mkdir('.auth', { recursive: true });

const browser = await chromium.launch();
try {
  for (const actor of QA_ACTORS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${appUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email address').fill(actor.email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /enter the front office/i }).click();
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    const path = `.auth/${actor.label}.json`;
    await context.storageState({ path });
    await context.close();
    await access(path);
    console.log(`Saved ${actor.label} storage state`);
  }
} finally {
  await browser.close();
}
