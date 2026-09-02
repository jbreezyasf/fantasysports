export type VoiceFeatureFlag =
  | 'voice_gm'
  | 'voice_gm_transactions'
  | 'voice_drafting'
  | 'voice_waivers'
  | 'voice_lineup'
  | 'accessibility_spoken_updates';

export type VoiceFeatureFlags = Record<VoiceFeatureFlag, boolean>;

export const voiceFeatureFlagEnv: Record<VoiceFeatureFlag, string> = {
  voice_gm: 'BIG_EXEC_VOICE_GM',
  voice_gm_transactions: 'BIG_EXEC_VOICE_GM_TRANSACTIONS',
  voice_drafting: 'BIG_EXEC_VOICE_DRAFTING',
  voice_waivers: 'BIG_EXEC_VOICE_WAIVERS',
  voice_lineup: 'BIG_EXEC_VOICE_LINEUP',
  accessibility_spoken_updates: 'BIG_EXEC_ACCESSIBILITY_SPOKEN_UPDATES'
};

function parseBooleanFlag(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export function resolveVoiceFeatureFlags(env: Record<string, string | undefined> = process.env): VoiceFeatureFlags {
  const raw = Object.fromEntries(
    Object.entries(voiceFeatureFlagEnv).map(([flag, envName]) => [flag, parseBooleanFlag(env[envName])])
  ) as VoiceFeatureFlags;

  return {
    voice_gm: raw.voice_gm,
    voice_gm_transactions: raw.voice_gm && raw.voice_gm_transactions,
    voice_drafting: raw.voice_gm && raw.voice_drafting,
    voice_waivers: raw.voice_gm && raw.voice_waivers,
    voice_lineup: raw.voice_gm && raw.voice_lineup,
    accessibility_spoken_updates: raw.accessibility_spoken_updates
  };
}

export function isVoiceFeatureEnabled(flag: VoiceFeatureFlag, env: Record<string, string | undefined> = process.env) {
  return resolveVoiceFeatureFlags(env)[flag];
}
