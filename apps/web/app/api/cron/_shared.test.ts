import { afterEach, describe, expect, it } from 'vitest';
import { authorizeCron } from './_shared';

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe('authorizeCron', () => {
  it('rejects requests when CRON_SECRET is not configured', () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(new Request('https://example.test', { headers: { authorization: 'Bearer undefined' } }))).toBe(false);
  });

  it('accepts only the exact Vercel cron bearer token', () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    expect(authorizeCron(new Request('https://example.test', { headers: { authorization: 'Bearer cron-test-secret' } }))).toBe(true);
    expect(authorizeCron(new Request('https://example.test', { headers: { authorization: 'Bearer wrong-secret' } }))).toBe(false);
    expect(authorizeCron(new Request('https://example.test'))).toBe(false);
  });
});
