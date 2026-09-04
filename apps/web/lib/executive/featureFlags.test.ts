import { describe, expect, it } from 'vitest';
import { isExecutiveFeatureEnabled, resolveExecutiveFeatureFlags } from './featureFlags';

describe('Executive feature flags', () => {
  it('defaults every Executive and Assistant GM flag off', () => {
    expect(resolveExecutiveFeatureFlags({})).toEqual({
      assistant_gm: false,
      assistant_gm_pro_plus: false,
      assistant_gm_voice_input: false,
      assistant_gm_cloud_tts: false,
      assistant_gm_proactive_briefs: false,
      assistant_gm_write_tools: false,
      assistant_gm_draft_actions: false,
      assistant_gm_lineup_actions: false,
      assistant_gm_waiver_actions: false,
      executive_checkout: false,
      accessibility_spoken_updates: false
    });
  });

  it('gates Pro+ and paid-provider flags behind the Assistant GM master switch', () => {
    expect(resolveExecutiveFeatureFlags({
      BIG_EXEC_ASSISTANT_GM_PRO_PLUS: 'true',
      BIG_EXEC_ASSISTANT_GM_CLOUD_TTS: 'true',
      BIG_EXEC_ASSISTANT_GM_PROACTIVE_BRIEFS: 'true'
    })).toMatchObject({
      assistant_gm: false,
      assistant_gm_pro_plus: false,
      assistant_gm_cloud_tts: false,
      assistant_gm_proactive_briefs: false
    });
  });

  it('keeps accessibility spoken updates independent of Executive and Pro+ switches', () => {
    expect(resolveExecutiveFeatureFlags({
      BIG_EXEC_ACCESSIBILITY_SPOKEN_UPDATES: 'true',
      BIG_EXEC_ASSISTANT_GM: 'false',
      BIG_EXEC_ASSISTANT_GM_PRO_PLUS: 'false',
      BIG_EXEC_ASSISTANT_GM_CLOUD_TTS: 'false'
    })).toMatchObject({
      assistant_gm: false,
      assistant_gm_pro_plus: false,
      assistant_gm_cloud_tts: false,
      accessibility_spoken_updates: true
    });
  });

  it('allows free Assistant GM voice input without Pro+', () => {
    expect(resolveExecutiveFeatureFlags({
      BIG_EXEC_ASSISTANT_GM: 'true',
      BIG_EXEC_ASSISTANT_GM_VOICE_INPUT: 'true',
      BIG_EXEC_ASSISTANT_GM_PRO_PLUS: 'false'
    })).toMatchObject({
      assistant_gm: true,
      assistant_gm_voice_input: true,
      assistant_gm_pro_plus: false
    });
  });

  it('gates action subfeatures behind write tools', () => {
    expect(resolveExecutiveFeatureFlags({
      BIG_EXEC_ASSISTANT_GM: 'true',
      BIG_EXEC_ASSISTANT_GM_DRAFT_ACTIONS: 'true',
      BIG_EXEC_ASSISTANT_GM_LINEUP_ACTIONS: 'true',
      BIG_EXEC_ASSISTANT_GM_WAIVER_ACTIONS: 'true'
    })).toMatchObject({
      assistant_gm_write_tools: false,
      assistant_gm_draft_actions: false,
      assistant_gm_lineup_actions: false,
      assistant_gm_waiver_actions: false
    });
  });

  it('supports direct flag checks', () => {
    expect(isExecutiveFeatureEnabled('executive_checkout', { BIG_EXEC_EXECUTIVE_CHECKOUT: 'yes' })).toBe(true);
  });
});

