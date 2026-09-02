# Big Exec Live Announcement Service

Task: BE-A11Y-012  
Date: 2026-08-31

## Implemented Service

Files:

- `apps/web/app/components/announcementQueue.ts`
- `apps/web/app/components/ScreenReaderAnnouncer.tsx`
- `apps/web/app/components/announcementQueue.test.ts`
- `apps/web/app/layout.tsx`

The app now has one mounted screen-reader announcement channel. Future gameplay code can call `announceToScreenReader` from `ScreenReaderAnnouncer.tsx`, which dispatches a browser event consumed by the root announcer.

## Priority Levels

- `polite`: non-urgent gameplay updates such as waiver submitted, lineup saved, pick completed, trade received, and live-score updates.
- `assertive`: critical feedback that should interrupt throttling, such as lineup invalid, transaction failed, or confirmation errors.

## Throttling / Queue Behavior

- Default throttle window: `1500ms`.
- Repeated polite events with the same key are throttled.
- During throttling, only the latest message for a key is retained.
- Assertive events bypass throttling and clear any queued polite event with the same key.
- Empty announcement text is ignored.

## Supported Event Mapping

Backlog event | Initial priority | Suggested key
---|---|---
Draft turn starts | polite | `draft-turn`
Pick completed | polite | `draft-pick`
Waiver submitted | polite | `waiver-submitted`
Lineup move completed | polite | `lineup-saved`
Lineup invalid | assertive | `lineup-error`
Player ruled out | assertive | `player-status`
Trade received | polite | `trade-received`
Major live-score update | polite | `live-score`

## Important Constraint

Do not announce the draft clock every second. Use the queue for meaningful timer thresholds or status changes only.

## Still To Wire

- Draft room turn/pick events.
- Waiver/free-agent status events.
- Lineup saved/invalid events.
- Trade received/resolved events.
- Matchup major score updates.
- Locker Room new-message announcements.

Those should be connected in the screen-specific remediation tasks, using authoritative state changes rather than DOM scraping.
