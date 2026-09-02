# Voice Error And Ambiguity UX

## Status

BE-VOICE-055 is implemented.

## Files

- `apps/web/lib/voice/voiceErrors.ts`
- `apps/web/lib/voice/voiceErrors.test.ts`
- `apps/web/app/components/AskGmPushToTalk.tsx`
- `apps/web/app/components/AskGmPushToTalk.test.tsx`

## Covered Scenarios

- speech not understood
- ambiguous player
- unavailable player
- stale draft state
- network failure
- AI/tool timeout
- unsupported request

## Required Actions

Every voice failure exposes:

- retry
- type instead
- cancel/return

Unsupported commands set `maySubstituteAction: false`; the app must not silently execute another command.
