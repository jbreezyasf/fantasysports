# Speech-To-Text Provider Abstraction (BE-VOICE-101)

## Status

BE-VOICE-101 is implemented by extending the existing BE-VOICE-052 browser adapter rather than replacing it.

## Reconciliation note

`docs/executive/REPO_INVENTORY.md` recorded BE-VOICE-101 as *"Existing browser adapter: `apps/web/lib/voice/speechToText.ts`; needs provider abstraction/telemetry/limits."* Those three gaps are what this task adds. `speechToText.ts` is unchanged and remains the capture implementation.

## Files

- `apps/web/lib/voice/speechProvider.ts`
- `apps/web/lib/voice/speechProvider.test.ts`
- `apps/web/lib/voice/speechToText.ts` (unchanged, wrapped)
- `apps/web/app/components/AskGmPushToTalk.tsx` (consumer)

## Requirement coverage

| BE-VOICE-101 requirement | Where |
| --- | --- |
| Provider abstraction | `SpeechToTextProvider`, `selectSpeechToTextProvider` |
| Request-based bounded capture by default | `createBoundedSpeechCapture`; capture starts only on user action |
| Microphone permission explanation | `microphonePermissionCopy()` (existing, BE-VOICE-052) |
| Recording duration cap | `resolveCaptureLimitMs`, hard cap timer |
| Cancel / retry | `cancel()`, `stop()`, retry from the Ask GM error state |
| Transcript preview where exact entities matter | `exactEntity` option -> `requiresConfirmation` |
| Typed fallback | Ask GM control, always present |
| Telemetry | `SpeechCaptureTelemetryEvent` |
| No permanent recording state | `retainedTranscript()`, cleared on every exit path |

## No cloud provider

`docs/executive/ADR_ASSISTANT_GM.md` records "No cloud STT/TTS provider is selected." No cloud provider is implemented here. The registry accepts one, but selection requires both `cloudEnabled` and the provider reporting `isAvailable()`, so a flagged-on but unconfigured provider is never chosen and audio cannot be routed to an unconfigured service.

## Duration cap

Default 15s, hard maximum 30s, and a caller limit is clamped to that maximum. The cap is enforced by a timer that stops the adapter and delivers whatever was heard, so capture cannot run past the limit even if the provider never fires an end event. A capped result is flagged `cappedAtLimit` and reported as a distinct `cap_reached` telemetry event.

## Exact entities

When a caller declares `exactEntity` — player names, emails, numbers, where a near-miss is a different real entity — the result carries `requiresConfirmation: true`. The caller must preview and confirm rather than auto-applying. The confirmation UI itself is BE-VOICE-104.

## Telemetry privacy

Telemetry carries `providerId`, event class, `durationMs`, `transcriptLength`, and an error class. It deliberately excludes transcript content, per ADR section 8 ("avoid storing full transcript text where metrics or short summaries are sufficient"). A test asserts spoken content never appears in a serialized telemetry payload.

## No permanent recording state

No audio is buffered. The interim transcript is held only while capture is active and cleared on every exit: final delivery, cap, cancel, and error. `retainedTranscript()` returns null once capture ends, and cancel discards the transcript without delivering a result.

## Known limits

- Only the browser Web Speech provider exists; browsers without it degrade to typed input.
- Telemetry is emitted to an injected sink; it is not yet persisted to the restricted usage ledger (BE-OPS-400).
- `exactEntity` is plumbed but no caller sets it yet; the invitation/email path is BE-VOICE-104.
- Microphone permission is explained but the browser permission prompt result is not separately classified from other capture failures.
