import { EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE } from './entitlements';

export const EXECUTIVE_LEAGUE_SEASON_PASS_LOOKUP_KEY = 'executive_league_99_usd_one_time';

export type ExecutiveStripeConfig =
  | {
      ok: true;
      productCode: typeof EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE;
      priceLookupKey: string;
      priceId: string | null;
      secretKey: string;
      webhookSecret: string;
    }
  | {
      ok: false;
      productCode: typeof EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE;
      missing: string[];
      priceLookupKey: string | null;
      priceId: string | null;
    };

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function resolveExecutiveStripeConfig(env: Record<string, string | undefined> = process.env): ExecutiveStripeConfig {
  const secretKey = clean(env.STRIPE_SECRET_KEY);
  const webhookSecret = clean(env.STRIPE_WEBHOOK_SECRET);
  const priceLookupKey = clean(env.BIG_EXEC_EXECUTIVE_STRIPE_PRICE_LOOKUP_KEY) ?? EXECUTIVE_LEAGUE_SEASON_PASS_LOOKUP_KEY;
  const priceId = clean(env.BIG_EXEC_EXECUTIVE_STRIPE_PRICE_ID);
  const missing: string[] = [];
  if (!secretKey) missing.push('STRIPE_SECRET_KEY');
  if (!webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');

  if (missing.length || !secretKey || !webhookSecret) {
    return {
      ok: false,
      productCode: EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE,
      missing,
      priceLookupKey,
      priceId
    };
  }

  return {
    ok: true,
    productCode: EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE,
    priceLookupKey,
    priceId,
    secretKey,
    webhookSecret
  };
}

export function executiveStripeConfigStatus(config: ExecutiveStripeConfig) {
  return config.ok
    ? { ok: true as const, productCode: config.productCode, priceLookupKey: config.priceLookupKey, priceIdConfigured: Boolean(config.priceId) }
    : { ok: false as const, productCode: config.productCode, missing: config.missing, priceLookupKey: config.priceLookupKey, priceIdConfigured: Boolean(config.priceId) };
}
