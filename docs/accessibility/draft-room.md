# BE-A11Y-024 Accessible Draft Room

Date: 2026-08-31

Status: Implemented in current draft room; full simulated VoiceOver/TalkBack draft remains pending.

## Objective

The live draft must be independently playable with a screen reader while preserving the existing draft engine.

## Files Updated

- `apps/web/app/drafts/[draftId]/page.tsx`
- `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
- `apps/web/app/drafts/[draftId]/DraftClock.tsx`
- `apps/web/app/drafts/[draftId]/draftAccessibility.ts`
- `apps/web/app/drafts/[draftId]/draftAccessibility.test.ts`
- `apps/web/app/drafts/actions.ts`
- `apps/web/app/gate5.css`

## Current Draft Architecture

- Draft route: `apps/web/app/drafts/[draftId]/page.tsx`
- Player finder/queue client UI: `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
- Clock client UI: `apps/web/app/drafts/[draftId]/DraftClock.tsx`
- Realtime refresh client: `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`
- Server actions: `apps/web/app/drafts/actions.ts`
- Canonical draft RPCs:
  - `initialize_snake_draft`
  - `start_draft`
  - `pause_draft`
  - `make_draft_pick`
  - `add_draft_queue_item`
  - `remove_draft_queue_item`
  - `move_draft_queue_item`
  - `process_expired_draft_picks`
  - `undo_last_draft_pick`

## Behavior Implemented

- Draft state section now exposes:
  - draft status;
  - current round;
  - current pick;
  - manager on clock;
  - user's next pick.
- When the user's franchise is on the clock, the page renders the required announcement:
  - `You are on the clock. Round X, Pick Y. N seconds remaining.`
- The draft clock no longer announces every second.
- Draft clock threshold announcements are limited to:
  - 30 seconds;
  - 15 seconds;
  - 5 seconds.
- Threshold announcements use the shared screen-reader announcement queue from BE-A11Y-012.
- Draft player finder exposes result count and sort order.
- Candidate rows expose:
  - player/team name;
  - position;
  - NFL team;
  - overall rank;
  - score;
  - main action.
- Draft candidates now have an explicit review step before `makeDraftPick`.
- Queue actions keep explicit names for add, move up, move down, and remove.
- Successful draft picks and queue additions redirect with status context and render `role="status"` confirmations.
- Recent picks section lists the latest selected assets and the selecting franchise.

## Canonical Logic Preserved

- No parallel draft engine was created.
- Final draft selections still call `makeDraftPick`, which calls the existing `make_draft_pick` Supabase RPC.
- Queue mutations still call the existing draft queue server actions and RPCs.

## Remaining Work

- Run a complete simulated draft with VoiceOver and TalkBack and record results in `docs/accessibility/test-matrix.md`.
- Add browser-level tests once authenticated draft fixtures are available in a stable local/preview environment.
