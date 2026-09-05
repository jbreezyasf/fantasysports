import {
  type BigExecCapability,
  type BigExecCapabilityId,
  type CapabilityActionLevel,
  type CapabilityAudience,
  getBigExecCapability
} from '../executive/capabilities';
import { type ExecutiveFeatureFlags, resolveExecutiveFeatureFlags } from '../executive/featureFlags';
import { type EntitlementSupabase, isExecutiveLeague } from '../executive/entitlements';

/**
 * BE-GM-105 — central Standard/Pro+ capability enforcement.
 *
 * This module is the single place that decides whether an Assistant GM intent is
 * Standard, accessibility, Pro+, commissioner-only, or unsupported. UI components,
 * server actions, and the gateway must consume a decision from here instead of
 * running their own entitlement or payment checks.
 */

export type AssistantGmIntentClass =
  | 'standard'
  | 'accessibility'
  | 'pro_plus'
  | 'commissioner_only'
  | 'unsupported';

export type AssistantGmIntentId =
  | 'education.explain_rule'
  | 'roster.read_lineup'
  | 'roster.read_bench'
  | 'roster.injured_players'
  | 'roster.plays_tonight'
  | 'roster.empty_lineup_spots'
  | 'matchup.score'
  | 'matchup.am_i_winning'
  | 'matchup.left_to_play'
  | 'matchup.projection'
  | 'standings.my_standing'
  | 'standings.first_place'
  | 'players.player_details'
  | 'players.compare_players'
  | 'players.best_available'
  | 'players.available_by_position'
  | 'draft.available_players'
  | 'draft.best_position_available'
  | 'draft.next_pick'
  | 'draft.position_need'
  | 'draft.recent_picks'
  | 'draft.verify_player_available'
  | 'waiver.faab_balance'
  | 'waiver.pending_claims'
  | 'waiver.recommend_add'
  | 'waiver.best_available'
  | 'commissioner.invitation_state'
  | 'accessibility.voice_input'
  | 'accessibility.spoken_output'
  | 'accessibility.typed_fallback'
  | 'accessibility.confirm_transaction'
  | 'accessibility.invite_email_readback'
  | 'pro_plus.draft_war_room'
  | 'pro_plus.lineup_review'
  | 'pro_plus.waiver_strategist'
  | 'pro_plus.trade_advisor'
  | 'pro_plus.opponent_scout'
  | 'pro_plus.front_office_brief'
  | 'pro_plus.season_planner'
  | 'pro_plus.scenario_simulator'
  | 'pro_plus.franchise_memory'
  | 'pro_plus.personality'
  | 'actions.lineup_commit'
  | 'actions.draft_commit'
  | 'actions.waiver_commit'
  | 'actions.invitation_commit'
  | 'actions.trade_commit';

/**
 * Intent -> capability mapping. Intent ids are namespaced because bare intent
 * names collide across modules (for example `best_available` exists in both the
 * waiver and player-search intent sets).
 */
export const assistantGmIntentCapabilities: Record<AssistantGmIntentId, BigExecCapabilityId> = {
  'education.explain_rule': 'rules.education.read',

  'roster.read_lineup': 'lineup.read',
  'roster.read_bench': 'roster.read',
  'roster.injured_players': 'roster.read',
  'roster.plays_tonight': 'lineup.read',
  'roster.empty_lineup_spots': 'lineup.read',

  'matchup.score': 'matchup.read',
  'matchup.am_i_winning': 'matchup.read',
  'matchup.left_to_play': 'matchup.read',
  'matchup.projection': 'matchup.read',
  'standings.my_standing': 'standings.read',
  'standings.first_place': 'standings.read',

  'players.player_details': 'players.search.read',
  'players.compare_players': 'players.search.read',
  'players.best_available': 'players.search.read',
  'players.available_by_position': 'players.search.read',

  'draft.available_players': 'draft.read',
  'draft.best_position_available': 'draft.read',
  'draft.next_pick': 'draft.read',
  'draft.position_need': 'draft.read',
  'draft.recent_picks': 'draft.read',
  'draft.verify_player_available': 'draft.read',

  'waiver.faab_balance': 'waivers.read',
  'waiver.pending_claims': 'waivers.read',
  'waiver.recommend_add': 'waivers.read',
  'waiver.best_available': 'waivers.read',

  'commissioner.invitation_state': 'invitations.read',

  'accessibility.voice_input': 'accessibility.voice_input',
  'accessibility.spoken_output': 'accessibility.spoken_output',
  'accessibility.typed_fallback': 'accessibility.typed_fallback',
  'accessibility.confirm_transaction': 'accessibility.confirm_transactions',
  'accessibility.invite_email_readback': 'accessibility.invite_email_readback',

  'pro_plus.draft_war_room': 'pro_plus.draft_war_room',
  'pro_plus.lineup_review': 'pro_plus.lineup_review',
  'pro_plus.waiver_strategist': 'pro_plus.waiver_strategist',
  'pro_plus.trade_advisor': 'pro_plus.trade_advisor',
  'pro_plus.opponent_scout': 'pro_plus.opponent_scout',
  'pro_plus.front_office_brief': 'pro_plus.front_office_brief',
  'pro_plus.season_planner': 'pro_plus.season_planner',
  'pro_plus.scenario_simulator': 'pro_plus.scenario_simulator',
  'pro_plus.franchise_memory': 'pro_plus.franchise_memory',
  'pro_plus.personality': 'pro_plus.personality',

  'actions.lineup_commit': 'actions.lineup.commit',
  'actions.draft_commit': 'actions.draft.commit',
  'actions.waiver_commit': 'actions.waiver.commit',
  'actions.invitation_commit': 'actions.invitation.commit',
  'actions.trade_commit': 'actions.trade.commit'
};

export type AssistantGmPolicyDenialReason =
  | 'unauthenticated'
  | 'unknown_intent'
  | 'feature_disabled'
  | 'entitlement_required'
  | 'audience_denied'
  | 'not_released';

export type AssistantGmPolicyContext = {
  userId?: string | null;
  audience: CapabilityAudience;
  /** Resolved server-side for the league-season in scope. Never client-supplied. */
  isExecutiveLeague: boolean;
  flags?: ExecutiveFeatureFlags;
  releasePhase?: 'beta' | 'post_beta';
};

export type AssistantGmPolicyDecision =
  | {
      allowed: true;
      intentId: string;
      capabilityId: BigExecCapabilityId;
      intentClass: Exclude<AssistantGmIntentClass, 'unsupported'>;
      mode: 'standard' | 'pro_plus';
      action: CapabilityActionLevel;
      requiresExecutive: boolean;
      upgradeRequired: false;
    }
  | {
      allowed: false;
      intentId: string;
      capabilityId: BigExecCapabilityId | null;
      intentClass: AssistantGmIntentClass;
      reason: AssistantGmPolicyDenialReason;
      message: string;
      /** True only when an Executive purchase is the actual remedy. */
      upgradeRequired: boolean;
    };

export function classifyAssistantGmIntent(intentId: string): AssistantGmIntentClass {
  const capabilityId = assistantGmIntentCapabilities[intentId as AssistantGmIntentId];
  if (!capabilityId) return 'unsupported';

  const capability = getBigExecCapability(capabilityId);
  if (!capability) return 'unsupported';

  return capabilityClass(capability);
}

function capabilityClass(capability: BigExecCapability): Exclude<AssistantGmIntentClass, 'unsupported'> {
  if (capability.tier === 'free_accessibility') {
    return capability.audience === 'commissioner' ? 'commissioner_only' : 'accessibility';
  }
  if (capability.requiresExecutive) return 'pro_plus';
  if (capability.audience === 'commissioner') return 'commissioner_only';
  return 'standard';
}

/**
 * Accessibility capabilities must stay usable when the Assistant GM master switch
 * or Executive entitlement is absent. Payment state can never gate them.
 */
function isFreeAccessibilityTier(capability: BigExecCapability) {
  return capability.tier === 'free_accessibility';
}

export function evaluateAssistantGmIntent(
  intentId: string,
  context: AssistantGmPolicyContext
): AssistantGmPolicyDecision {
  const capabilityId = assistantGmIntentCapabilities[intentId as AssistantGmIntentId] ?? null;
  return evaluateCapability(intentId, capabilityId, context);
}

/**
 * Capability-level entry point for callers that already hold a capability id
 * (the Assistant GM gateway). It runs the exact same policy as intent evaluation
 * so entitlement and payment rules exist in one place only.
 */
export function evaluateAssistantGmCapability(
  capabilityId: BigExecCapabilityId,
  context: AssistantGmPolicyContext
): AssistantGmPolicyDecision {
  return evaluateCapability(capabilityId, capabilityId, context);
}

function evaluateCapability(
  intentId: string,
  capabilityId: BigExecCapabilityId | null,
  context: AssistantGmPolicyContext
): AssistantGmPolicyDecision {
  const flags = context.flags ?? resolveExecutiveFeatureFlags();
  const capability = capabilityId ? getBigExecCapability(capabilityId) : null;

  if (!capabilityId || !capability) {
    return {
      allowed: false,
      intentId,
      capabilityId: null,
      intentClass: 'unsupported',
      reason: 'unknown_intent',
      message: 'Assistant GM does not support that request yet.',
      upgradeRequired: false
    };
  }

  const intentClass = capabilityClass(capability);

  if (!context.userId) {
    return {
      allowed: false,
      intentId,
      capabilityId,
      intentClass,
      reason: 'unauthenticated',
      message: 'Sign in before using Assistant GM.',
      upgradeRequired: false
    };
  }

  // Master switch. Free accessibility capabilities are deliberately exempt.
  if (!flags.assistant_gm && !isFreeAccessibilityTier(capability)) {
    return {
      allowed: false,
      intentId,
      capabilityId,
      intentClass,
      reason: 'feature_disabled',
      message: 'Assistant GM is currently disabled.',
      upgradeRequired: false
    };
  }

  if (capability.requiresExecutive && !flags.assistant_gm_pro_plus) {
    return {
      allowed: false,
      intentId,
      capabilityId,
      intentClass,
      reason: 'feature_disabled',
      message: 'Assistant GM Pro+ is currently disabled.',
      upgradeRequired: false
    };
  }

  // Audience is checked before entitlement so a manager is never shown an
  // Executive upgrade prompt for a commissioner-only intent they still could not run.
  if (capability.audience !== 'league_member' && capability.audience !== context.audience) {
    return {
      allowed: false,
      intentId,
      capabilityId,
      intentClass,
      reason: 'audience_denied',
      message:
        capability.audience === 'commissioner'
          ? 'Only the league commissioner can use that Assistant GM capability.'
          : 'That Assistant GM capability is not available for this role.',
      upgradeRequired: false
    };
  }

  if (capability.requiresExecutive && !context.isExecutiveLeague) {
    return {
      allowed: false,
      intentId,
      capabilityId,
      intentClass,
      reason: 'entitlement_required',
      message: 'Assistant GM Pro+ requires an active Executive league-season entitlement.',
      upgradeRequired: true
    };
  }

  if (capability.releasePhase === 'post_beta' && (context.releasePhase ?? 'beta') === 'beta') {
    return {
      allowed: false,
      intentId,
      capabilityId,
      intentClass,
      reason: 'not_released',
      message: 'That Assistant GM capability is not available during the Big Exec beta.',
      upgradeRequired: false
    };
  }

  return {
    allowed: true,
    intentId,
    capabilityId,
    intentClass,
    mode: capability.requiresExecutive ? 'pro_plus' : 'standard',
    action: capability.action,
    requiresExecutive: capability.requiresExecutive,
    upgradeRequired: false
  };
}

export type AssistantGmUpgradePrompt = {
  show: boolean;
  headline: string;
  body: string;
  /** Where the single Executive purchase surface lives. UI must not build its own. */
  surface: 'executive_checkout' | null;
};

/**
 * Single source of upgrade copy. UI components render this from a decision rather
 * than testing entitlement or payment state themselves.
 */
export function describeAssistantGmUpgradePrompt(decision: AssistantGmPolicyDecision): AssistantGmUpgradePrompt {
  if (decision.allowed || !decision.upgradeRequired) {
    return { show: false, headline: '', body: '', surface: null };
  }

  return {
    show: true,
    headline: 'Executive League Season Pass required',
    body: 'Assistant GM Pro+ is included with the Executive League Season Pass for this league season.',
    surface: 'executive_checkout'
  };
}

export type AssistantGmLeagueScope = {
  leagueId: string;
  leagueSeasonId: string;
  audience: CapabilityAudience;
};

export type AssistantGmPolicySession = {
  /**
   * Evaluates an intent for one league scope. Entitlement is resolved per
   * league-season on every call, so a manager switching between a Free league and
   * an Executive league inside the same session never inherits the other league's
   * access.
   */
  evaluate: (intentId: string, scope: AssistantGmLeagueScope) => Promise<AssistantGmPolicyDecision>;
};

/**
 * Session-scoped policy resolver. It deliberately keys any lookup by
 * league-season id and never holds a single session-wide entitlement value.
 */
export function createAssistantGmPolicySession(input: {
  supabase: EntitlementSupabase;
  userId?: string | null;
  flags?: ExecutiveFeatureFlags;
  releasePhase?: 'beta' | 'post_beta';
  resolveExecutive?: (scope: AssistantGmLeagueScope) => Promise<boolean>;
}): AssistantGmPolicySession {
  const flags = input.flags ?? resolveExecutiveFeatureFlags();

  const resolveExecutive =
    input.resolveExecutive ??
    (async (scope: AssistantGmLeagueScope) =>
      input.userId
        ? isExecutiveLeague({
            supabase: input.supabase,
            leagueSeasonId: scope.leagueSeasonId,
            userId: input.userId
          })
        : false);

  return {
    async evaluate(intentId, scope) {
      if (!input.userId) {
        return evaluateAssistantGmIntent(intentId, {
          userId: null,
          audience: scope.audience,
          isExecutiveLeague: false,
          flags,
          releasePhase: input.releasePhase
        });
      }

      const executive = await resolveExecutive(scope);

      return evaluateAssistantGmIntent(intentId, {
        userId: input.userId,
        audience: scope.audience,
        isExecutiveLeague: executive,
        flags,
        releasePhase: input.releasePhase
      });
    }
  };
}

export const assistantGmIntentIds = Object.keys(assistantGmIntentCapabilities) as AssistantGmIntentId[];
