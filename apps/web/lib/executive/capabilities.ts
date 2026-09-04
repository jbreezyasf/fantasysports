export type CapabilityTier = 'free_standard' | 'free_accessibility' | 'executive_pro_plus';
export type CapabilityAudience = 'league_member' | 'manager' | 'commissioner' | 'ops_staff';
export type CapabilityActionLevel = 'read' | 'prepare' | 'commit';
export type CapabilityReleasePhase = 'beta' | 'post_beta';

export type BigExecCapability = {
  id: string;
  label: string;
  tier: CapabilityTier;
  audience: CapabilityAudience;
  action: CapabilityActionLevel;
  releasePhase: CapabilityReleasePhase;
  requiresExecutive: boolean;
  assistantGmToolAllowed: boolean;
};

const standard = {
  tier: 'free_standard',
  requiresExecutive: false,
  releasePhase: 'beta'
} satisfies Partial<BigExecCapability>;

const accessibility = {
  tier: 'free_accessibility',
  requiresExecutive: false,
  releasePhase: 'beta'
} satisfies Partial<BigExecCapability>;

const proPlus = {
  tier: 'executive_pro_plus',
  requiresExecutive: true,
  releasePhase: 'beta'
} satisfies Partial<BigExecCapability>;

export const bigExecCapabilities = [
  { ...standard, id: 'rules.education.read', label: 'Explain Big Exec rules and fantasy concepts', audience: 'league_member', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'roster.read', label: 'Read authorized roster state', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'lineup.read', label: 'Read authorized lineup state', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'matchup.read', label: 'Read authorized matchup state', audience: 'league_member', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'standings.read', label: 'Read league standings', audience: 'league_member', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'players.search.read', label: 'Search and compare players with availability context', audience: 'league_member', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'draft.read', label: 'Read draft state and available draft players', audience: 'league_member', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'waivers.read', label: 'Read waiver state and waiver rules', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...standard, id: 'invitations.read', label: 'Read league invitation state', audience: 'commissioner', action: 'read', assistantGmToolAllowed: true },

  { ...accessibility, id: 'accessibility.keyboard', label: 'Keyboard access to core gameplay', audience: 'league_member', action: 'read', assistantGmToolAllowed: false },
  { ...accessibility, id: 'accessibility.screen_reader', label: 'Screen-reader labels, roles, and state announcements', audience: 'league_member', action: 'read', assistantGmToolAllowed: false },
  { ...accessibility, id: 'accessibility.voice_input', label: 'Speech-to-text as alternate input', audience: 'league_member', action: 'prepare', assistantGmToolAllowed: true },
  { ...accessibility, id: 'accessibility.spoken_output', label: 'Spoken output and visible transcript for supported core tasks', audience: 'league_member', action: 'read', assistantGmToolAllowed: true },
  { ...accessibility, id: 'accessibility.typed_fallback', label: 'Typed fallback for voice flows', audience: 'league_member', action: 'prepare', assistantGmToolAllowed: true },
  { ...accessibility, id: 'accessibility.confirm_transactions', label: 'Accessible confirmation for consequential actions', audience: 'manager', action: 'prepare', assistantGmToolAllowed: true },
  { ...accessibility, id: 'accessibility.invite_email_readback', label: 'Phonetic invitation email readback and correction', audience: 'commissioner', action: 'prepare', assistantGmToolAllowed: true },

  { ...proPlus, id: 'pro_plus.draft_war_room', label: 'Executive Draft War Room recommendations', audience: 'manager', action: 'prepare', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.lineup_review', label: 'Full lineup review and prioritized recommendations', audience: 'manager', action: 'prepare', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.waiver_strategist', label: 'Waiver target ranking and contingency planning', audience: 'manager', action: 'prepare', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.trade_advisor', label: 'Trade analysis and counteroffer suggestions', audience: 'manager', action: 'prepare', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.opponent_scout', label: 'Opponent scouting report', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.front_office_brief', label: 'Proactive Front Office brief', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.season_planner', label: 'Season planner and playoff preparation', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.scenario_simulator', label: 'Supported scenario simulator', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.franchise_memory', label: 'Authorized franchise memory over Big Exec history', audience: 'manager', action: 'read', assistantGmToolAllowed: true },
  { ...proPlus, id: 'pro_plus.personality', label: 'Configurable Assistant GM Pro+ personality layer', audience: 'manager', action: 'read', assistantGmToolAllowed: true },

  { id: 'actions.lineup.commit', label: 'Commit confirmed lineup action through canonical lineup RPC', tier: 'free_standard', audience: 'manager', action: 'commit', releasePhase: 'beta', requiresExecutive: false, assistantGmToolAllowed: true },
  { id: 'actions.draft.commit', label: 'Commit confirmed draft pick through canonical draft RPC', tier: 'free_standard', audience: 'manager', action: 'commit', releasePhase: 'beta', requiresExecutive: false, assistantGmToolAllowed: true },
  { id: 'actions.waiver.commit', label: 'Commit confirmed waiver claim through canonical waiver RPC', tier: 'free_standard', audience: 'manager', action: 'commit', releasePhase: 'beta', requiresExecutive: false, assistantGmToolAllowed: true },
  { id: 'actions.invitation.commit', label: 'Commit confirmed league invitation through canonical invite flow', tier: 'free_accessibility', audience: 'commissioner', action: 'commit', releasePhase: 'beta', requiresExecutive: false, assistantGmToolAllowed: true },
  { id: 'actions.trade.commit', label: 'Commit confirmed trade action', tier: 'free_standard', audience: 'manager', action: 'commit', releasePhase: 'post_beta', requiresExecutive: false, assistantGmToolAllowed: true },

  { id: 'payments.executive_checkout.commit', label: 'Start Executive League Season Pass checkout', tier: 'executive_pro_plus', audience: 'commissioner', action: 'commit', releasePhase: 'beta', requiresExecutive: false, assistantGmToolAllowed: false },
  { id: 'ops.assistant_gm_usage.read', label: 'Read Assistant GM usage and cost metrics', tier: 'executive_pro_plus', audience: 'ops_staff', action: 'read', releasePhase: 'beta', requiresExecutive: false, assistantGmToolAllowed: false }
] as const satisfies readonly BigExecCapability[];

export type BigExecCapabilityId = typeof bigExecCapabilities[number]['id'];

export type CapabilityContext = {
  isExecutiveLeague: boolean;
  audience: CapabilityAudience;
};

export function getBigExecCapability(id: BigExecCapabilityId) {
  return bigExecCapabilities.find(capability => capability.id === id) ?? null;
}

export function isFreeAccessibilityCapability(capability: BigExecCapability) {
  return capability.tier === 'free_accessibility' && capability.requiresExecutive === false;
}

export function requiresExecutiveEntitlement(id: BigExecCapabilityId) {
  const capability = getBigExecCapability(id);
  return capability?.requiresExecutive ?? false;
}

export function canUseCapability(id: BigExecCapabilityId, context: CapabilityContext) {
  const capability = getBigExecCapability(id);
  if (!capability) return false;
  if (capability.audience !== 'league_member' && capability.audience !== context.audience) return false;
  return !capability.requiresExecutive || context.isExecutiveLeague;
}

