# BE-A11Y-027 Accessible League Chat and Notifications

Date: 2026-08-31

Status: Implemented for current Locker Room feed; threaded replies are documented as not present in the verified schema.

## Objective

League chat and notifications must communicate sender, event, message, timestamp, reactions, and available reply/action context.

## Files Updated

- `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`
- `apps/web/app/leagues/[leagueId]/locker-room/lockerRoomAccessibility.ts`
- `apps/web/app/leagues/[leagueId]/locker-room/lockerRoomAccessibility.test.ts`
- `apps/web/app/social/actions.ts`
- `apps/web/app/gate5.css`

## Current Architecture

- Locker Room route: `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- Live refresh client: `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`
- Feed table: `league_feed_events`
- Reaction table: `feed_reactions`
- Message action: `postLockerMessage` in `apps/web/app/social/actions.ts`
- Reaction action: `toggleReaction` in `apps/web/app/social/actions.ts`

## Behavior Implemented

- Each message/event article now exposes:
  - sender;
  - displayed timestamp;
  - event type when not a regular locker-room message;
  - message body;
  - reaction summary;
  - reply action availability.
- Reaction buttons now announce add/remove state, named reaction, actor post target, and total count.
- Each message/event exposes a Reply link that moves the user to the composer with reply context.
- Composer label and placeholder update when replying to a selected event.
- Posting a message now redirects with `message_status=sent` and renders a `role="status"` confirmation.
- Live updates now announce concrete event text through the shared BE-A11Y-012 announcement queue instead of relying on a generic `aria-live` feed container.

## Schema Finding

No verified threaded-reply field was found in the current Locker Room schema or server actions. The implemented Reply action provides accessible composer context without inventing a new persistence model.

## Remaining Work

- If threaded replies become canonical, extend `postLockerMessage` through the official RPC/schema and preserve the accessible reply context.
- Record VoiceOver/TalkBack Locker Room results in `docs/accessibility/test-matrix.md`.
