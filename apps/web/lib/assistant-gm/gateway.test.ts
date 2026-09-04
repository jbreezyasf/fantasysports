import { describe, expect, it, vi } from 'vitest';
import { createAssistantGmGateway } from './gateway';
import { EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE } from '../executive/entitlements';
import type { AssistantGmToolResponse } from './tools';

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown; op: 'eq' } | { column: string; value: unknown[]; op: 'in' };

class FakeQuery {
  private filters: Filter[] = [];

  constructor(private rows: Row[]) {}

  select() { return this; }
  insert() { return this; }
  update() { return this; }
  order() { return this; }
  limit() { return this; }
  lte() { return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, value, op: 'eq' }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ column, value, op: 'in' }); return this; }

  private matches(row: Row) {
    return this.filters.every(filter => filter.op === 'in' ? filter.value.includes(row[filter.column]) : row[filter.column] === filter.value);
  }

  async maybeSingle<T>() {
    return { data: (this.rows.find(row => this.matches(row)) ?? null) as T | null, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve({ data: this.rows.filter(row => this.matches(row)), error: null }).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(entitled = false) {
  return {
    from(table: string) {
      const tables: Record<string, Row[]> = {
        league_seasons: [{ id: 'season-1', league_id: 'league-1', competition_season_id: 'competition-season-1' }],
        league_members: [{ id: 'member-1', league_id: 'league-1', user_id: 'user-1', role: 'manager' }],
        league_season_entitlements: entitled ? [{
          id: 'entitlement-1',
          league_id: 'league-1',
          league_season_id: 'season-1',
          competition_season_id: 'competition-season-1',
          product_code: EXECUTIVE_LEAGUE_SEASON_PASS_PRODUCT_CODE,
          status: 'active'
        }] : []
      };
      return new FakeQuery(tables[table] ?? []);
    }
  };
}

const assistantOn = {
  assistant_gm: true,
  assistant_gm_pro_plus: false,
  assistant_gm_voice_input: true,
  assistant_gm_cloud_tts: false,
  assistant_gm_proactive_briefs: false,
  assistant_gm_write_tools: false,
  assistant_gm_draft_actions: false,
  assistant_gm_lineup_actions: false,
  assistant_gm_waiver_actions: false,
  executive_checkout: false,
  accessibility_spoken_updates: true
};

describe('Assistant GM gateway', () => {
  it('requires authentication before any tool work', async () => {
    const toolRunner = vi.fn();
    const gateway = createAssistantGmGateway({ supabase: fakeSupabase() as any, flags: assistantOn, toolRunner });

    await expect(gateway.handle({
      userId: null,
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'roster.read'
    })).resolves.toMatchObject({ ok: false, code: 'unauthenticated' });
    expect(toolRunner).not.toHaveBeenCalled();
  });

  it('denies standard Assistant GM when the master switch is off', async () => {
    const recordUsage = vi.fn();
    const gateway = createAssistantGmGateway({ supabase: fakeSupabase() as any, flags: { ...assistantOn, assistant_gm: false }, recordUsage });

    await expect(gateway.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'roster.read'
    })).resolves.toMatchObject({ ok: false, code: 'feature_disabled' });
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied', capabilityId: 'roster.read' }));
  });

  it('does not require the Assistant GM master switch for free accessibility capability checks', async () => {
    const gateway = createAssistantGmGateway({ supabase: fakeSupabase() as any, flags: { ...assistantOn, assistant_gm: false } });

    await expect(gateway.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'league_member',
      capabilityId: 'accessibility.spoken_output'
    })).resolves.toMatchObject({ ok: true, mode: 'standard' });
  });

  it('requires both the Pro+ flag and active Executive entitlement for Pro+ capabilities', async () => {
    const noFlag = createAssistantGmGateway({ supabase: fakeSupabase(true) as any, flags: assistantOn });
    await expect(noFlag.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'pro_plus.waiver_strategist'
    })).resolves.toMatchObject({ ok: false, code: 'feature_disabled' });

    const noEntitlement = createAssistantGmGateway({ supabase: fakeSupabase(false) as any, flags: { ...assistantOn, assistant_gm_pro_plus: true } });
    await expect(noEntitlement.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'pro_plus.waiver_strategist'
    })).resolves.toMatchObject({ ok: false, code: 'entitlement_required' });
  });

  it('calls declared same-league read tools and records usage', async () => {
    const response: AssistantGmToolResponse = { ok: true, tool: 'getLeague', data: { league: { id: 'league-1' } } };
    const toolRunner = vi.fn().mockResolvedValue(response);
    const recordUsage = vi.fn();
    const gateway = createAssistantGmGateway({ supabase: fakeSupabase() as any, flags: assistantOn, toolRunner, recordUsage });

    const result = await gateway.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'league_member',
      capabilityId: 'rules.education.read',
      toolRequests: [{ tool: 'getLeague', leagueId: 'league-1' }]
    });

    expect(result).toMatchObject({ ok: true, providerRoute: 'deterministic_tools', toolResponses: [response] });
    expect(toolRunner).toHaveBeenCalledOnce();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', toolCount: 1 }));
  });

  it('defers policy to the central capability policy and never upsells a role denial', async () => {
    const gateway = createAssistantGmGateway({ supabase: fakeSupabase(true) as any, flags: { ...assistantOn, assistant_gm_pro_plus: true } });

    const result = await gateway.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'invitations.read'
    });

    expect(result).toMatchObject({ ok: false, code: 'unsupported_capability' });
    expect(result.ok === false && result.policy).toMatchObject({
      intentClass: 'commissioner_only',
      reason: 'audience_denied',
      upgradeRequired: false
    });
  });

  it('holds post-beta capabilities back during the beta', async () => {
    const gateway = createAssistantGmGateway({ supabase: fakeSupabase(true) as any, flags: assistantOn });

    await expect(gateway.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'manager',
      capabilityId: 'actions.trade.commit'
    })).resolves.toMatchObject({ ok: false, code: 'unsupported_capability' });
  });

  it('rejects tools outside the current league boundary', async () => {
    const toolRunner = vi.fn();
    const gateway = createAssistantGmGateway({ supabase: fakeSupabase() as any, flags: assistantOn, toolRunner });

    await expect(gateway.handle({
      userId: 'user-1',
      leagueId: 'league-1',
      leagueSeasonId: 'season-1',
      audience: 'league_member',
      capabilityId: 'rules.education.read',
      toolRequests: [{ tool: 'getLeague', leagueId: 'league-2' }]
    })).resolves.toMatchObject({ ok: false, code: 'unauthorized_tool' });
    expect(toolRunner).not.toHaveBeenCalled();
  });
});

