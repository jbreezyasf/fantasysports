# GM Audio Collision Policy

## Status

BE-VOICE-054 is implemented.

## Files

- `apps/web/app/components/announcementQueue.ts`
- `apps/web/app/components/announcementQueue.test.ts`
- `apps/web/app/components/ScreenReaderAnnouncer.tsx`
- `apps/web/app/components/AskGmPushToTalk.tsx`
- `apps/web/app/matchups/[matchupId]/MatchupScoreAnnouncer.tsx`

## Policy

- Assistant GM speech state is published through `big-exec:gm-audio-state`.
- Live-scoring announcements are tagged with `channel: 'live-scoring'`.
- While GM speech is active, polite live-scoring announcements are queued and throttled.
- Assertive critical transaction or error announcements are not held.
- The user can stop GM speech immediately from the Ask GM control.
- Focus is not programmatically moved by GM speech start/stop; the active control remains predictable.

## Rationale

The app already had one shared screen-reader announcement queue. This task extends that queue rather than creating a second audio system, so live scoring, draft clock, chat, and future GM speech share the same priority policy.
