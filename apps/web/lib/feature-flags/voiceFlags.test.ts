import { describe, expect, it } from 'vitest';
import { isVoiceFeatureEnabled, resolveVoiceFeatureFlags, voiceFeatureFlagEnv } from './voiceFlags';

describe('voice feature flags', () => {
  it('declares every required beta flag', () => {
    expect(Object.keys(voiceFeatureFlagEnv)).toEqual([
      'voice_gm',
      'voice_gm_transactions',
      'voice_drafting',
      'voice_waivers',
      'voice_lineup',
      'accessibility_spoken_updates'
    ]);
  });

  it('defaults every voice capability off', () => {
    expect(resolveVoiceFeatureFlags({})).toEqual({
      voice_gm: false,
      voice_gm_transactions: false,
      voice_drafting: false,
      voice_waivers: false,
      voice_lineup: false,
      accessibility_spoken_updates: false
    });
  });

  it('lets spoken accessibility updates be enabled without Voice GM', () => {
    expect(resolveVoiceFeatureFlags({ BIG_EXEC_ACCESSIBILITY_SPOKEN_UPDATES: 'true' })).toMatchObject({
      voice_gm: false,
      accessibility_spoken_updates: true
    });
  });

  it('keeps transaction subfeatures disabled when Voice GM is off', () => {
    expect(resolveVoiceFeatureFlags({
      BIG_EXEC_VOICE_GM_TRANSACTIONS: 'true',
      BIG_EXEC_VOICE_DRAFTING: 'true',
      BIG_EXEC_VOICE_WAIVERS: 'true',
      BIG_EXEC_VOICE_LINEUP: 'true'
    })).toEqual({
      voice_gm: false,
      voice_gm_transactions: false,
      voice_drafting: false,
      voice_waivers: false,
      voice_lineup: false,
      accessibility_spoken_updates: false
    });
  });

  it('supports independent voice capability switches when Voice GM is enabled', () => {
    expect(resolveVoiceFeatureFlags({
      BIG_EXEC_VOICE_GM: '1',
      BIG_EXEC_VOICE_DRAFTING: 'yes',
      BIG_EXEC_VOICE_WAIVERS: 'off',
      BIG_EXEC_VOICE_LINEUP: 'on'
    })).toMatchObject({
      voice_gm: true,
      voice_gm_transactions: false,
      voice_drafting: true,
      voice_waivers: false,
      voice_lineup: true
    });
    expect(isVoiceFeatureEnabled('voice_lineup', { BIG_EXEC_VOICE_GM: 'true', BIG_EXEC_VOICE_LINEUP: 'true' })).toBe(true);
  });
});
