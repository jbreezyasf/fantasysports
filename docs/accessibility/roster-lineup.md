# BE-A11Y-021 Accessible Roster and Lineup

Date: 2026-08-31

Status: Partially implemented; one acceptance item requires canonical lineup-service clarification.

## Objective

A screen-reader user must be able to understand starters, bench players, empty/invalid slots, and available lineup moves without drag-and-drop.

## Files Updated

- `apps/web/app/franchises/[franchiseId]/team/page.tsx`
- `apps/web/app/franchises/[franchiseId]/team/lineupAccessibility.ts`
- `apps/web/app/franchises/[franchiseId]/team/lineupAccessibility.test.ts`
- `apps/web/app/team/actions.ts`

## Current Implementation

- The team page loads:
  - active roster from `roster_entries`;
  - current week lineup from `lineups`;
  - current league season and Roster Integrity state from `league_seasons` and `season_franchises`;
  - pending Roster Integrity reviews from `roster_integrity_reviews`.
- Starter slots are rendered from the local `slots` tuple in `apps/web/app/franchises/[franchiseId]/team/page.tsx`.
- Eligible starter moves are rendered as normal form buttons under each slot.
- Submissions call `apps/web/app/team/actions.ts#setLineup`, which calls Supabase RPC `set_lineup_slot`.

## Behavior Implemented

- Starter section now has an accessible heading.
- Each starter slot exposes:
  - slot name;
  - current player or empty state;
  - valid move-action container when eligible players exist.
- Current starter assets now expose screen-reader-only detail:
  - starter state;
  - slot;
  - player/team name;
  - position;
  - NFL team;
  - game status fallback;
  - injury status fallback;
  - projected-points fallback.
- Bench assets now expose:
  - bench state;
  - player/team name;
  - position;
  - NFL team;
  - game status fallback;
  - injury status fallback;
  - projected-points fallback.
- Move buttons now include target slot and week in their accessible names.
- Successful lineup moves now redirect with `lineup_status=set`, `lineup_slot`, and `lineup_asset`, then render a `role="status"` confirmation.
- Copy-generation helpers have unit coverage.

## Canonical Logic Preserved

- No new roster, lineup, game, or transaction service was created.
- Lineup moves still use the existing `setLineup` server action and `set_lineup_slot` Supabase RPC.

## Verified Gap

Direct “move to bench” means clearing a starter slot without selecting a replacement. The checked-in migrations do not contain the canonical `set_lineup_slot` definition, and no dedicated checked-in clear-lineup RPC was found.

Because the canonical clear behavior is unverified, this task does **not** add a direct bench-clearing mutation. Current users can bench a starter by moving a different eligible roster asset into that starter slot, but direct empty-slot benching remains unresolved.

Relevant evidence:

```bash
rg -n "create or replace function public\\.set_lineup_slot|set_lineup_slot" supabase/migrations apps docs -g '!node_modules'
rg -n "set_lineup_slot|lineups" apps/web/lib packages supabase -g '*.ts' -g '*.tsx' -g '*.sql' -g '*.json'
```

## Remaining Work

- Verify production definition of `set_lineup_slot`.
- Add a canonical clear-starter or move-to-bench server action only if the verified fantasy core permits it.
- Add real device checks to `docs/accessibility/test-matrix.md`.
- Add richer game, injury, and projected-points text when those data fields exist in the real player/game-stat model.
