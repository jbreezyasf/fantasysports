# Assistant GM Action Audit Log

## Status

BE-GM-066 is implemented as a structured audit-log model and store interface.

## Files

- `apps/web/lib/assistant-gm/actionAuditLog.ts`
- `apps/web/lib/assistant-gm/actionAuditLog.test.ts`

## Logged Fields

- user ID
- league ID
- source = Assistant GM
- requested action
- action type
- prepared action
- confirmation timestamp
- commit result
- failure reason
- state/version hash
- confirmation action ID
- created time

## Privacy Boundary

The audit payload sanitizer removes raw audio-like fields such as `rawVoiceAudio`, `audioBlob`, `audioBuffer`, `audioBytes`, and `microphoneStream`. Text requests/transcripts may be logged as requested action context, but raw voice audio should not be stored for debugging or dispute review.

Future production wiring should back `AssistantGmActionAuditStore` with canonical durable storage. This task does not add a new transaction engine and does not write roster, lineup, draft, waiver, or trade tables directly.
