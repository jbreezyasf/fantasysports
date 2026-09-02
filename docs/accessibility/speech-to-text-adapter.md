# Speech-To-Text Adapter

## Status

BE-VOICE-052 is implemented with a browser Web Speech API adapter.

## Files

- `apps/web/lib/voice/speechToText.ts`
- `apps/web/lib/voice/speechToText.test.ts`
- `apps/web/app/components/AskGmPushToTalk.tsx`
- `apps/web/app/gate5.css`

## Behavior

- Capture starts only when the user presses Ask GM.
- The adapter uses `SpeechRecognition` or `webkitSpeechRecognition` when available.
- Listening is not continuous.
- Interim results are enabled so transcript text can appear during capture.
- Cancel calls `abort()`.
- Finish calls `stop()`.
- Retry is available from the error state.
- Typed fallback is available in the Ask GM control.
- Unsupported browsers return an explicit error.

## Permission Copy

```text
Microphone access starts only after you press Ask GM. You can cancel listening at any time.
```

## Known Limits

This task does not add a server speech provider, LLM routing, or text-to-speech. Browsers without Web Speech API support will enter the explicit unavailable state until a future provider adapter is added.
