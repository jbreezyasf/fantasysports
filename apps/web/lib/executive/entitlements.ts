export const EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE = 'big_exec_executive_league_season_pass';

export type ExecutiveEntitlementStatus = 'pending_payment' | 'active' | 'expired' | 'refunded' | 'revoked' | 'disputed';

export type LeagueSeasonEntitlement = {
  id: string;
  league_id: string;
  league_season_id: string;
  competition_season_id: string;
  sport_code: string;
  season_year: number;
  product_code: string;
  status: ExecutiveEntitlementStatus;
  purchaser_user_id: string;
  stripe_customer_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_event_id?: string | null;
  activated_at?: string | null;
  expires_at?: string | null;
  refunded_at?: string | null;
  revoked_at?: string | null;
  disputed_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type QueryResult<T> = { data: T | null; error?: { message?: string } | null };
type QueryBuilder = {
  select: (columns?: string) => QueryBuilder;
  insert: (values: Record<string, unknown>) => QueryBuilder;
  update: (values: Record<string, unknown>) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: (column: string, options?: Record<string, unknown>) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  maybeSingle: <T>() => Promise<QueryResult<T>>;
  then: <TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
};

export type EntitlementSupabase = {
  from: (table: string) => QueryBuilder;
};

type LeagueSeasonRow = { id: string; league_id: string; competition_season_id: string };
type LeagueMemberRow = { id?: string; role?: string | null };

export type EntitlementReadResult =
  | { ok: true; isExecutive: true; reason: 'active'; entitlement: LeagueSeasonEntitlement }
  | { ok: true; isExecutive: false; reason: 'not_entitled' | 'inactive_status'; entitlement: LeagueSeasonEntitlement | null }
  | { ok: false; reason: 'not_found' | 'unauthorized' | 'data_error'; message: string };

async function readOne<T>(query: Promise<QueryResult<T>>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? 'Database read failed');
  return data;
}

async function execute<T = unknown>(query: PromiseLike<QueryResult<unknown>>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? 'Database write failed');
  return data as T | null;
}

async function requireLeagueSeasonMembership(supabase: EntitlementSupabase, leagueSeasonId: string, userId: string) {
  const season = await readOne<LeagueSeasonRow>(
    supabase.from('league_seasons').select('id,league_id,competition_season_id').eq('id', leagueSeasonId).maybeSingle()
  );
  if (!season) return { ok: false as const, reason: 'not_found' as const, message: 'League season not found.' };

  const member = await readOne<LeagueMemberRow>(
    supabase.from('league_members').select('id,role').eq('league_id', season.league_id).eq('user_id', userId).maybeSingle()
  );
  if (!member) return { ok: false as const, reason: 'unauthorized' as const, message: 'User is not a member of this league.' };
  return { ok: true as const, season, member };
}

export async function getLeagueSeasonEntitlement(input: {
  supabase: EntitlementSupabase;
  leagueSeasonId: string;
  userId: string;
  productCode?: string;
}): Promise<EntitlementReadResult> {
  try {
    const access = await requireLeagueSeasonMembership(input.supabase, input.leagueSeasonId, input.userId);
    if (!access.ok) return access;

    const entitlement = await readOne<LeagueSeasonEntitlement>(
      input.supabase
        .from('league_season_entitlements')
        .select('*')
        .eq('league_season_id', input.leagueSeasonId)
        .eq('product_code', input.productCode ?? EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE)
        .in('status', ['pending_payment', 'active', 'expired', 'refunded', 'revoked', 'disputed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (!entitlement) return { ok: true, isExecutive: false, reason: 'not_entitled', entitlement: null };
    if (entitlement.status !== 'active') return { ok: true, isExecutive: false, reason: 'inactive_status', entitlement };
    return { ok: true, isExecutive: true, reason: 'active', entitlement };
  } catch (error) {
    return { ok: false, reason: 'data_error', message: error instanceof Error ? error.message : 'Entitlement lookup failed.' };
  }
}

export async function isExecutiveLeague(input: {
  supabase: EntitlementSupabase;
  leagueSeasonId: string;
  userId: string;
  productCode?: string;
}) {
  const result = await getLeagueSeasonEntitlement(input);
  return result.ok ? result.isExecutive : false;
}

export async function activateExecutiveEntitlement(input: {
  supabase: EntitlementSupabase;
  actor: 'service_role' | 'authenticated' | 'anon';
  leagueId: string;
  leagueSeasonId: string;
  competitionSeasonId: string;
  sportCode: string;
  seasonYear: number;
  purchaserUserId: string;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId?: string | null;
  stripeEventId: string;
  activatedAt?: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (input.actor !== 'service_role') {
    return { ok: false as const, reason: 'service_role_required' as const, message: 'Only verified server fulfillment may activate Executive entitlement.' };
  }

  const existing = await readOne<LeagueSeasonEntitlement>(
    input.supabase
      .from('league_season_entitlements')
      .select('*')
      .eq('stripe_checkout_session_id', input.stripeCheckoutSessionId)
      .maybeSingle()
  );
  if (existing) return { ok: true as const, reason: 'already_recorded' as const, entitlement: existing };

  const now = input.activatedAt ?? new Date().toISOString();
  const entitlement = await execute<LeagueSeasonEntitlement>(
    input.supabase
      .from('league_season_entitlements')
      .insert({
        league_id: input.leagueId,
        league_season_id: input.leagueSeasonId,
        competition_season_id: input.competitionSeasonId,
        sport_code: input.sportCode,
        season_year: input.seasonYear,
        product_code: EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE,
        status: 'active',
        purchaser_user_id: input.purchaserUserId,
        stripe_customer_id: input.stripeCustomerId ?? null,
        stripe_checkout_session_id: input.stripeCheckoutSessionId,
        stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
        stripe_event_id: input.stripeEventId,
        activated_at: now,
        expires_at: input.expiresAt ?? null,
        metadata: input.metadata ?? {}
      })
      .select('*')
      .maybeSingle()
  );

  return { ok: true as const, reason: 'activated' as const, entitlement };
}

export async function revokeExecutiveEntitlement(input: {
  supabase: EntitlementSupabase;
  actor: 'service_role' | 'authenticated' | 'anon';
  entitlementId: string;
  revokedAt?: string;
  metadata?: Record<string, unknown>;
}) {
  if (input.actor !== 'service_role') {
    return { ok: false as const, reason: 'service_role_required' as const, message: 'Only server-side fulfillment may revoke Executive entitlement.' };
  }

  const entitlement = await execute<LeagueSeasonEntitlement>(
    input.supabase
      .from('league_season_entitlements')
      .update({
        status: 'revoked',
        revoked_at: input.revokedAt ?? new Date().toISOString(),
        metadata: input.metadata ?? {}
      })
      .eq('id', input.entitlementId)
      .select('*')
      .maybeSingle()
  );

  return { ok: true as const, reason: 'revoked' as const, entitlement };
}

export async function expireExecutiveEntitlements(input: {
  supabase: EntitlementSupabase;
  actor: 'service_role' | 'authenticated' | 'anon';
  now?: string;
}) {
  if (input.actor !== 'service_role') {
    return { ok: false as const, reason: 'service_role_required' as const, message: 'Only server-side jobs may expire Executive entitlements.' };
  }

  const expired = await execute<LeagueSeasonEntitlement[]>(
    input.supabase
      .from('league_season_entitlements')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lte('expires_at', input.now ?? new Date().toISOString())
      .select('*')
  );

  return { ok: true as const, reason: 'expired' as const, entitlements: expired ?? [] };
}

