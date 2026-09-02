# BE-A11Y-015 Non-Drag Interaction Pattern

Date: 2026-08-31

Status: Complete for current repository behavior.

Evidence level: PROVEN for source-code search in `apps/` and `packages/`.

## Objective

No essential Big Exec fantasy workflow may require drag-and-drop. If a future sighted drag interaction is added, it must be paired with this keyboard and screen-reader operable pattern.

## Verified Current State

Search command:

```bash
rg -n "drag|draggable|onDrag|onDrop|DnD|dnd|sortable|pointerdown|pointermove|DataTransfer|react-dnd|@dnd-kit" apps packages -g '!node_modules' -g '!*.next/*'
```

Result: no matches.

## Existing Non-Drag Core Actions

- Lineup moves
  - UI: `apps/web/app/franchises/[franchiseId]/team/page.tsx`
  - Action: `apps/web/app/team/actions.ts`
  - Current behavior: each eligible roster asset is submitted through a slot-specific button/form to `setLineup`.
  - Canonical validation: Supabase upsert to `lineups` plus existing database constraints and lineup lock behavior.

- Draft queue reorder
  - UI: `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
  - Actions: `apps/web/app/drafts/[draftId]/actions.ts`
  - Current behavior: queue items use explicit up/down/remove buttons.
  - Canonical validation: server actions mutate `draft_queue_items` scoped to the authenticated user.

- Draft picks
  - UI: `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
  - Action: `apps/web/app/drafts/[draftId]/actions.ts`
  - Current behavior: each candidate has an explicit Draft button.
  - Canonical validation: `makeDraftPick` checks draft status/current pick eligibility before creating pick and roster entry.

- Free agency add/drop
  - UI: `apps/web/app/leagues/[leagueId]/players/page.tsx`
  - Actions: `apps/web/app/leagues/[leagueId]/players/actions.ts`
  - Current behavior: an Add disclosure presents an optional or required drop selector and a submit button.
  - Canonical validation: `claim_free_agent` Supabase RPC handles roster limits, ownership, lineup locks, waiver holds, and Roster Integrity.

- Waiver claims
  - UI: `apps/web/app/leagues/[leagueId]/players/page.tsx`
  - Actions: `apps/web/app/leagues/[leagueId]/players/actions.ts`
  - Current behavior: a Claim disclosure presents an optional or required drop selector; pending claims expose a Withdraw button.
  - Canonical validation: `submit_waiver_claim`, `withdraw_waiver_claim`, and `process_due_waivers` Supabase RPCs.

- Trades
  - UI: `apps/web/app/leagues/[leagueId]/trades/page.tsx`, `apps/web/app/trades/[tradeId]/page.tsx`
  - Actions: `apps/web/app/social/actions.ts`
  - Current behavior: trade proposal uses select controls; decisions use Accept/Reject/Cancel buttons.
  - Canonical validation: trade lifecycle RPCs enforce ownership and state.

## Required Pattern For Future Drag UI

For every movable fantasy asset, provide this non-drag path:

1. Activate a named move control, such as `Move player`.
2. Present only valid destinations that are known from canonical fantasy rules.
3. Select the destination with a normal button, radio group, select, or menu pattern.
4. Submit through the existing canonical server action/RPC.
5. Confirm success or failure through the shared live-announcement/status pattern.

## Architectural Constraint

Do not introduce a separate drag-specific roster, lineup, draft, waiver, or trade service. Drag and non-drag UI must both call the same existing Big Exec server actions and Supabase RPCs used by the current form/button flows.

## Remaining Follow-Up

BE-A11Y-021 and BE-A11Y-024 should improve naming, confirmation, focus recovery, and live announcements in the existing non-drag flows. They should not create a parallel movement engine.
