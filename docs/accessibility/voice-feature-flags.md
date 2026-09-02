# Voice Feature Flags

## Status

BE-VOICE-050 is implemented.

## Files

- `apps/web/lib/feature-flags/voiceFlags.ts`
- `apps/web/lib/feature-flags/voiceFlags.test.ts`
- `.env.example`
- `turbo.json`

## Flags

All flags default to `false`.

- `voice_gm`: `BIG_EXEC_VOICE_GM`
- `voice_gm_transactions`: `BIG_EXEC_VOICE_GM_TRANSACTIONS`
- `voice_drafting`: `BIG_EXEC_VOICE_DRAFTING`
- `voice_waivers`: `BIG_EXEC_VOICE_WAIVERS`
- `voice_lineup`: `BIG_EXEC_VOICE_LINEUP`
- `accessibility_spoken_updates`: `BIG_EXEC_ACCESSIBILITY_SPOKEN_UPDATES`

## Behavior

- `accessibility_spoken_updates` is independent of Voice GM and can be enabled without assistant/transaction capabilities.
- Transaction and voice subfeatures require `voice_gm` to be enabled first.
- Each voice capability can still be independently disabled while `voice_gm` is enabled.

## Guardrail

These flags do not expose any UI or transaction path by themselves. Future Voice GM tasks must check these flags before enabling push-to-talk, drafting, waivers, lineup changes, or spoken updates.
