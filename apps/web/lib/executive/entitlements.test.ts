import { describe, expect, it } from 'vitest';
import {
  EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE,
  activateExecutiveEntitlement,
  expireExecutiveEntitlements,
  getLeagueSeasonEntitlement,
  isExecutiveLeague,
  revokeExecutiveEntitlement,
  type EntitlementSupabase
} from './entitlements';

type Row = Record<string, any>;

function createMockSupabase(seed: Record<string, Row[]>): EntitlementSupabase & { rows: Record<string, Row[]> } {
  const rows = structuredClone(seed);

  function from(table: string) {
    let insertValue: Row | null = null;
    let updateValue: Row | null = null;
    const filters: Array<(row: Row) => boolean> = [];
    let max: number | null = null;

    const builder = {
      select: () => builder,
      insert: (value: Row) => {
        insertValue = value;
        return builder;
      },
      update: (value: Row) => {
        updateValue = value;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push(row => row[column] === value);
        return builder;
      },
      lte: (column: string, value: unknown) => {
        filters.push(row => row[column] != null && String(row[column]) <= String(value));
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push(row => values.includes(row[column]));
        return builder;
      },
      order: () => builder,
      limit: (count: number) => {
        max = count;
        return builder;
      },
      maybeSingle: async <T>() => {
        if (insertValue) {
          const row = { id: `${table}-${rows[table].length + 1}`, ...insertValue };
          rows[table].push(row);
          return { data: row as T, error: null };
        }
        const matched = rows[table].filter(row => filters.every(filter => filter(row)));
        if (updateValue) {
          const row = matched[0] ? Object.assign(matched[0], updateValue) : null;
          return { data: row as T | null, error: null };
        }
        return { data: (matched[0] ?? null) as T | null, error: null };
      },
      then: async (onfulfilled?: ((value: { data: Row[]; error: null }) => unknown) | null) => {
        const matched = rows[table].filter(row => filters.every(filter => filter(row)));
        const data = updateValue ? matched.map(row => Object.assign(row, updateValue)) : matched;
        const value = { data: max == null ? data : data.slice(0, max), error: null };
        return onfulfilled ? onfulfilled(value) : value;
      }
    };

    return builder;
  }

  return { from: from as EntitlementSupabase['from'], rows };
}

function seed() {
  return {
    league_seasons: [{ id: 'season-1', league_id: 'league-1', competition_season_id: 'competition-season-1' }],
    league_members: [{ id: 'member-1', league_id: 'league-1', user_id: 'user-1', role: 'manager' }],
    league_season_entitlements: [{
      id: 'entitlement-1',
      league_id: 'league-1',
      league_season_id: 'season-1',
      competition_season_id: 'competition-season-1',
      sport_code: 'pro_football',
      season_year: 2026,
      product_code: EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE,
      status: 'active',
      purchaser_user_id: 'commissioner-1',
      stripe_checkout_session_id: 'cs_1',
      stripe_event_id: 'evt_1',
      activated_at: '2026-09-02T00:00:00.000Z'
    }]
  };
}

describe('Executive entitlement service', () => {
  it('returns active Executive entitlement for an authorized league member', async () => {
    const supabase = createMockSupabase(seed());

    await expect(isExecutiveLeague({ supabase, leagueSeasonId: 'season-1', userId: 'user-1' })).resolves.toBe(true);
  });

  it('denies cross-league entitlement reads before checking entitlement state', async () => {
    const supabase = createMockSupabase(seed());

    const result = await getLeagueSeasonEntitlement({ supabase, leagueSeasonId: 'season-1', userId: 'stranger' });

    expect(result).toMatchObject({ ok: false, reason: 'unauthorized' });
  });

  it('does not treat inactive statuses as Executive access', async () => {
    const data = seed();
    data.league_season_entitlements[0].status = 'refunded';
    const supabase = createMockSupabase(data);

    const result = await getLeagueSeasonEntitlement({ supabase, leagueSeasonId: 'season-1', userId: 'user-1' });

    expect(result).toMatchObject({ ok: true, isExecutive: false, reason: 'inactive_status' });
  });

  it('requires service role activation from verified server fulfillment', async () => {
    const supabase = createMockSupabase({ ...seed(), league_season_entitlements: [] });

    const result = await activateExecutiveEntitlement({
      supabase,
      actor: 'authenticated',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      competitionSeasonId: 'competition-season-1',
      sportCode: 'pro_football',
      seasonYear: 2026,
      purchaserUserId: 'commissioner-1',
      stripeCheckoutSessionId: 'cs_new',
      stripeEventId: 'evt_new'
    });

    expect(result).toMatchObject({ ok: false, reason: 'service_role_required' });
    expect(supabase.rows.league_season_entitlements).toHaveLength(0);
  });

  it('activates idempotently by Stripe checkout session', async () => {
    const supabase = createMockSupabase(seed());

    const result = await activateExecutiveEntitlement({
      supabase,
      actor: 'service_role',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      competitionSeasonId: 'competition-season-1',
      sportCode: 'pro_football',
      seasonYear: 2026,
      purchaserUserId: 'commissioner-1',
      stripeCheckoutSessionId: 'cs_1',
      stripeEventId: 'evt_retry'
    });

    expect(result).toMatchObject({ ok: true, reason: 'already_recorded' });
    expect(supabase.rows.league_season_entitlements).toHaveLength(1);
  });

  it('revokes and expires only from service role paths', async () => {
    const supabase = createMockSupabase(seed());

    await expect(revokeExecutiveEntitlement({ supabase, actor: 'anon', entitlementId: 'entitlement-1' })).resolves.toMatchObject({
      ok: false,
      reason: 'service_role_required'
    });

    await expect(revokeExecutiveEntitlement({ supabase, actor: 'service_role', entitlementId: 'entitlement-1', revokedAt: '2026-09-03T00:00:00.000Z' })).resolves.toMatchObject({
      ok: true,
      reason: 'revoked'
    });

    supabase.rows.league_season_entitlements[0].status = 'active';
    supabase.rows.league_season_entitlements[0].expires_at = '2026-09-01T00:00:00.000Z';

    await expect(expireExecutiveEntitlements({ supabase, actor: 'service_role', now: '2026-09-02T00:00:00.000Z' })).resolves.toMatchObject({
      ok: true,
      reason: 'expired'
    });
    expect(supabase.rows.league_season_entitlements[0].status).toBe('expired');
  });
});
