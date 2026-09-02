# Text-To-Speech Adapter

## Status

BE-VOICE-053 is implemented with a browser speech synthesis adapter and push-to-talk UI controls.

## Files

- `apps/web/lib/voice/textToSpeech.ts`
- `apps/web/lib/voice/textToSpeech.test.ts`
- `apps/web/app/components/AskGmPushToTalk.tsx`
- `apps/web/app/components/AskGmPushToTalk.test.tsx`
- `apps/web/app/gate5.css`

## Behavior

- Text-to-speech uses `speechSynthesis` and `SpeechSynthesisUtterance` when supported.
- `stop()` cancels current speech.
- `replay()` speaks the last response again.
- Unsupported-browser and provider errors do not clear the last text response.
- The Ask GM control keeps the text response visible while speaking controls are available.

## Screen Reader Collision Risk

The component uses visible text plus polite status updates, and the user can stop speech immediately. The fuller collision/throttling policy is deferred to BE-VOICE-054.
