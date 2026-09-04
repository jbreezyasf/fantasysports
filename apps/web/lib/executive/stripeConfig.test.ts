import { describe, expect, it } from 'vitest';
import {
  EXECUTIVE_LEAGUE_SEASON_PASS_LOOKUP_KEY,
  executiveStripeConfigStatus,
  resolveExecutiveStripeConfig
} from './stripeConfig';

describe('Executive Stripe config contract', () => {
  it('reports missing server secrets without inventing values', () => {
    expect(resolveExecutiveStripeConfig({})).toEqual({
      ok: false,
      productCode: 'big_exec_executive_league_season_pass',
      missing: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
      priceLookupKey: EXECUTIVE_LEAGUE_SEASON_PASS_LOOKUP_KEY,
      priceId: null
    });
  });

  it('accepts server-provided secrets and optional environment-specific price id', () => {
    expect(resolveExecutiveStripeConfig({
      STRIPE_SECRET_KEY: 'sk_test_real_from_env',
      STRIPE_WEBHOOK_SECRET: 'whsec_real_from_env',
      BIG_EXEC_EXECUTIVE_STRIPE_PRICE_ID: 'price_env_specific',
      BIG_EXEC_EXECUTIVE_STRIPE_PRICE_LOOKUP_KEY: 'executive_league_99_usd_one_time'
    })).toMatchObject({
      ok: true,
      productCode: 'big_exec_executive_league_season_pass',
      priceLookupKey: EXECUTIVE_LEAGUE_SEASON_PASS_LOOKUP_KEY,
      priceId: 'price_env_specific'
    });
  });

  it('exposes only sanitized configuration status', () => {
    const config = resolveExecutiveStripeConfig({
      STRIPE_SECRET_KEY: 'sk_live_do_not_log',
      STRIPE_WEBHOOK_SECRET: 'whsec_do_not_log',
      BIG_EXEC_EXECUTIVE_STRIPE_PRICE_ID: 'price_123'
    });

    expect(executiveStripeConfigStatus(config)).toEqual({
      ok: true,
      productCode: 'big_exec_executive_league_season_pass',
      priceLookupKey: EXECUTIVE_LEAGUE_SEASON_PASS_LOOKUP_KEY,
      priceIdConfigured: true
    });
    expect(JSON.stringify(executiveStripeConfigStatus(config))).not.toContain('sk_live_do_not_log');
    expect(JSON.stringify(executiveStripeConfigStatus(config))).not.toContain('whsec_do_not_log');
  });
});

