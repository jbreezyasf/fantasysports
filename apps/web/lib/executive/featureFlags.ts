export type ExecutiveFeatureFlag =
  | 'assistant_gm'
  | 'assistant_gm_pro_plus'
  | 'assistant_gm_voice_input'
  | 'assistant_gm_cloud_tts'
  | 'assistant_gm_proactive_briefs'
  | 'assistant_gm_write_tools'
  | 'assistant_gm_draft_actions'
  | 'assistant_gm_lineup_actions'
  | 'assistant_gm_waiver_actions'
  | 'executive_checkout'
  | 'accessibility_spoken_updates';

export type ExecutiveFeatureFlags = Record<ExecutiveFeatureFlag, boolean>;

export const executiveFeatureFlagEnv: Record<ExecutiveFeatureFlag, string> = {
  assistant_gm: 'BIG_EXEC_ASSISTANT_GM',
  assistant_gm_pro_plus: 'BIG_EXEC_ASSISTANT_GM_PRO_PLUS',
  assistant_gm_voice_input: 'BIG_EXEC_ASSISTANT_GM_VOICE_INPUT',
  assistant_gm_cloud_tts: 'BIG_EXEC_ASSISTANT_GM_CLOUD_TTS',
  assistant_gm_proactive_briefs: 'BIG_EXEC_ASSISTANT_GM_PROACTIVE_BRIEFS',
  assistant_gm_write_tools: 'BIG_EXEC_ASSISTANT_GM_WRITE_TOOLS',
  assistant_gm_draft_actions: 'BIG_EXEC_ASSISTANT_GM_DRAFT_ACTIONS',
  assistant_gm_lineup_actions: 'BIG_EXEC_ASSISTANT_GM_LINEUP_ACTIONS',
  assistant_gm_waiver_actions: 'BIG_EXEC_ASSISTANT_GM_WAIVER_ACTIONS',
  executive_checkout: 'BIG_EXEC_EXECUTIVE_CHECKOUT',
  accessibility_spoken_updates: 'BIG_EXEC_ACCESSIBILITY_SPOKEN_UPDATES'
};

function enabled(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export function resolveExecutiveFeatureFlags(env: Record<string, string | undefined> = process.env): ExecutiveFeatureFlags {
  const raw = Object.fromEntries(
    Object.entries(executiveFeatureFlagEnv).map(([flag, envName]) => [flag, enabled(env[envName])])
  ) as ExecutiveFeatureFlags;

  return {
    assistant_gm: raw.assistant_gm,
    assistant_gm_pro_plus: raw.assistant_gm && raw.assistant_gm_pro_plus,
    assistant_gm_voice_input: raw.assistant_gm && raw.assistant_gm_voice_input,
    assistant_gm_cloud_tts: raw.assistant_gm && raw.assistant_gm_cloud_tts,
    assistant_gm_proactive_briefs: raw.assistant_gm && raw.assistant_gm_pro_plus && raw.assistant_gm_proactive_briefs,
    assistant_gm_write_tools: raw.assistant_gm && raw.assistant_gm_write_tools,
    assistant_gm_draft_actions: raw.assistant_gm && raw.assistant_gm_write_tools && raw.assistant_gm_draft_actions,
    assistant_gm_lineup_actions: raw.assistant_gm && raw.assistant_gm_write_tools && raw.assistant_gm_lineup_actions,
    assistant_gm_waiver_actions: raw.assistant_gm && raw.assistant_gm_write_tools && raw.assistant_gm_waiver_actions,
    executive_checkout: raw.executive_checkout,
    accessibility_spoken_updates: raw.accessibility_spoken_updates
  };
}

export function isExecutiveFeatureEnabled(flag: ExecutiveFeatureFlag, env: Record<string, string | undefined> = process.env) {
  return resolveExecutiveFeatureFlags(env)[flag];
}

