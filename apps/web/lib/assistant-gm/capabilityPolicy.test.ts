import { describe, expect, it, vi } from 'vitest';
import {
  assistantGmIntentCapabilities,
  assistantGmIntentIds,
  classifyAssistantGmIntent,
  createAssistantGmPolicySession,
  describeAssistantGmUpgradePrompt,
  evaluateAssistantGmIntent,
  type AssistantGmLeagueScope
} from './capabilityPolicy';
import { getBigExecCapability } from '../executive/capabilities';
import type { ExecutiveFeatureFlags } from '../executive/featureFlags';

const flagsOn: ExecutiveFeatureFlags = {
  assistant_gm: true,
  assistant_gm_pro_plus: true,
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

const manager = {
  userId: 'user-1',
  audience: 'manager',
  flags: flagsOn
} as const;

describe('Assistant GM capability policy', () => {
  it('maps every declared intent to a real capability', () => {
    for (const intentId of assistantGmIntentIds) {
      const capabilityId = assistantGmIntentCapabilities[intentId];
      expect(getBigExecCapability(capabilityId), `${intentId} -> ${capabilityId}`).not.toBeNull();
    }
  });

  it('classifies intents as standard, accessibility, Pro+, commissioner-only, or unsupported', () => {
    expect(classifyAssistantGmIntent('roster.read_lineup')).toBe('standard');
    expect(classifyAssistantGmIntent('accessibility.spoken_output')).toBe('accessibility');
    expect(classifyAssistantGmIntent('pro_plus.waiver_strategist')).toBe('pro_plus');
    expect(classifyAssistantGmIntent('commissioner.invitation_state')).toBe('commissioner_only');
    expect(classifyAssistantGmIntent('pro_plus.invent_new_power')).toBe('unsupported');
  });

  it('allows standard intents in a Free league', () => {
    const decision = evaluateAssistantGmIntent('matchup.score', { ...manager, isExecutiveLeague: false });

    expect(decision).toMatchObject({ allowed: true, intentClass: 'standard', mode: 'standard', upgradeRequired: false });
  });

  it('denies Pro+ intents without an entitlement and marks the upgrade path', () => {
    const decision = evaluateAssistantGmIntent('pro_plus.trade_advisor', { ...manager, isExecutiveLeague: false });

    expect(decision).toMatchObject({
      allowed: false,
      intentClass: 'pro_plus',
      reason: 'entitlement_required',
      upgradeRequired: true
    });
    expect(describeAssistantGmUpgradePrompt(decision)).toMatchObject({ show: true, surface: 'executive_checkout' });
  });

  it('allows Pro+ intents in an Executive league', () => {
    const decision = evaluateAssistantGmIntent('pro_plus.trade_advisor', { ...manager, isExecutiveLeague: true });

    expect(decision).toMatchObject({ allowed: true, intentClass: 'pro_plus', mode: 'pro_plus' });
    expect(describeAssistantGmUpgradePrompt(decision).show).toBe(false);
  });

  it('keeps accessibility intents free of entitlement, payment, and master-switch gating', () => {
    const accessibilityIntents = [
      'accessibility.voice_input',
      'accessibility.spoken_output',
      'accessibility.typed_fallback',
      'accessibility.confirm_transaction'
    ] as const;

    for (const intentId of accessibilityIntents) {
      const decision = evaluateAssistantGmIntent(intentId, {
        ...manager,
        isExecutiveLeague: false,
        flags: { ...flagsOn, assistant_gm: false, assistant_gm_pro_plus: false }
      });

      expect(decision, intentId).toMatchObject({ allowed: true, intentClass: 'accessibility', mode: 'standard' });
      expect(describeAssistantGmUpgradePrompt(decision).show, intentId).toBe(false);
    }
  });

  it('denies commissioner-only intents to managers without offering an upgrade', () => {
    const decision = evaluateAssistantGmIntent('commissioner.invitation_state', { ...manager, isExecutiveLeague: true });

    expect(decision).toMatchObject({
      allowed: false,
      intentClass: 'commissioner_only',
      reason: 'audience_denied',
      upgradeRequired: false
    });
    expect(describeAssistantGmUpgradePrompt(decision).show).toBe(false);
  });

  it('allows commissioner-only intents for the commissioner', () => {
    const decision = evaluateAssistantGmIntent('commissioner.invitation_state', {
      ...manager,
      audience: 'commissioner',
      isExecutiveLeague: false
    });

    expect(decision).toMatchObject({ allowed: true, intentClass: 'commissioner_only' });
  });

  it('requires authentication and rejects unknown intents', () => {
    expect(evaluateAssistantGmIntent('matchup.score', { ...manager, userId: null, isExecutiveLeague: false }))
      .toMatchObject({ allowed: false, reason: 'unauthenticated' });

    expect(evaluateAssistantGmIntent('roster.sell_the_team', { ...manager, isExecutiveLeague: true }))
      .toMatchObject({ allowed: false, reason: 'unknown_intent', intentClass: 'unsupported' });
  });

  it('honors kill switches for standard and Pro+ separately', () => {
    expect(evaluateAssistantGmIntent('matchup.score', {
      ...manager,
      isExecutiveLeague: true,
      flags: { ...flagsOn, assistant_gm: false }
    })).toMatchObject({ allowed: false, reason: 'feature_disabled', upgradeRequired: false });

    expect(evaluateAssistantGmIntent('pro_plus.lineup_review', {
      ...manager,
      isExecutiveLeague: true,
      flags: { ...flagsOn, assistant_gm_pro_plus: false }
    })).toMatchObject({ allowed: false, reason: 'feature_disabled', upgradeRequired: false });
  });

  it('holds post-beta capabilities back during the beta', () => {
    expect(evaluateAssistantGmIntent('actions.trade_commit', { ...manager, isExecutiveLeague: true }))
      .toMatchObject({ allowed: false, reason: 'not_released' });

    expect(evaluateAssistantGmIntent('actions.trade_commit', {
      ...manager,
      isExecutiveLeague: true,
      releasePhase: 'post_beta'
    })).toMatchObject({ allowed: true });
  });
});

describe('Assistant GM policy session across leagues', () => {
  const freeLeague: AssistantGmLeagueScope = {
    leagueId: 'league-free',
    leagueSeasonId: 'season-free',
    audience: 'manager'
  };
  const executiveLeague: AssistantGmLeagueScope = {
    leagueId: 'league-exec',
    leagueSeasonId: 'season-exec',
    audience: 'manager'
  };

  function session(resolveExecutive = vi.fn(async (scope: AssistantGmLeagueScope) => scope.leagueSeasonId === 'season-exec')) {
    return {
      resolveExecutive,
      policy: createAssistantGmPolicySession({
        supabase: {} as never,
        userId: 'user-1',
        flags: flagsOn,
        resolveExecutive
      })
    };
  }

  it('grants Pro+ in the Executive league and denies it in the Free league in the same session', async () => {
    const { policy } = session();

    await expect(policy.evaluate('pro_plus.lineup_review', executiveLeague)).resolves.toMatchObject({
      allowed: true,
      mode: 'pro_plus'
    });
    await expect(policy.evaluate('pro_plus.lineup_review', freeLeague)).resolves.toMatchObject({
      allowed: false,
      reason: 'entitlement_required',
      upgradeRequired: true
    });
  });

  it('does not leak Executive access back to the Free league after returning to it', async () => {
    const { policy } = session();

    await policy.evaluate('pro_plus.opponent_scout', freeLeague);
    await policy.evaluate('pro_plus.opponent_scout', executiveLeague);

    await expect(policy.evaluate('pro_plus.opponent_scout', freeLeague)).resolves.toMatchObject({
      allowed: false,
      reason: 'entitlement_required'
    });
  });

  it('re-resolves entitlement per league scope instead of caching one session-wide value', async () => {
    const { policy, resolveExecutive } = session();

    await policy.evaluate('pro_plus.season_planner', freeLeague);
    await policy.evaluate('pro_plus.season_planner', executiveLeague);

    expect(resolveExecutive).toHaveBeenCalledTimes(2);
    expect(resolveExecutive.mock.calls.map(([scope]) => scope.leagueSeasonId)).toEqual(['season-free', 'season-exec']);
  });

  it('reflects an entitlement activated mid-session without a new session', async () => {
    let entitled = false;
    const { policy } = session(vi.fn(async () => entitled));

    await expect(policy.evaluate('pro_plus.draft_war_room', executiveLeague)).resolves.toMatchObject({ allowed: false });

    entitled = true;

    await expect(policy.evaluate('pro_plus.draft_war_room', executiveLeague)).resolves.toMatchObject({
      allowed: true,
      mode: 'pro_plus'
    });
  });

  it('keeps standard and accessibility intents working in both leagues', async () => {
    const { policy } = session();

    for (const scope of [freeLeague, executiveLeague]) {
      await expect(policy.evaluate('roster.read_lineup', scope)).resolves.toMatchObject({ allowed: true, mode: 'standard' });
      await expect(policy.evaluate('accessibility.typed_fallback', scope)).resolves.toMatchObject({
        allowed: true,
        intentClass: 'accessibility'
      });
    }
  });

  it('never resolves entitlement for an unauthenticated session', async () => {
    const resolveExecutive = vi.fn(async () => true);
    const policy = createAssistantGmPolicySession({
      supabase: {} as never,
      userId: null,
      flags: flagsOn,
      resolveExecutive
    });

    await expect(policy.evaluate('pro_plus.lineup_review', executiveLeague)).resolves.toMatchObject({
      allowed: false,
      reason: 'unauthenticated'
    });
    expect(resolveExecutive).not.toHaveBeenCalled();
  });
});
