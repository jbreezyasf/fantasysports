# Big Exec Color, Status, and Icon Semantics

Task: BE-A11Y-013  
Date: 2026-08-31

## Implemented

Files changed:

- `apps/web/app/components/accessibility.tsx`
- `apps/web/app/components/accessibility.test.tsx`
- `apps/web/app/gate5.css`
- `apps/web/app/leagues/[leagueId]/players/page.tsx`

What changed:

- Added `StatusBadge`, which preserves visible status text and exposes optional `aria-label` plus `data-state`.
- Added tests proving visible text, class, ARIA label, and state are emitted.
- Added shared `.statusBadge` styling with state variants.
- Player position filters now expose the active filter with `aria-current="true"` and hidden selected text.
- Free-agent `ADD` disclosures now include asset-specific accessible names.
- Waiver `CLAIM` disclosures now include asset-specific accessible names.
- Pending waiver claims expose `pending` state through `StatusBadge`.
- Rostered player/team statuses expose `rostered` state through `StatusBadge`.
- No-franchise transaction state exposes `inactive` state through `StatusBadge`.

## Still To Cover In Screen-Specific Tasks

- Matchup winning/losing/final/live status summary.
- Draft live/current-turn status.
- Lineup starter/bench/locked state.
- Trade proposed/accepted/rejected/canceled state.
- Injury/player availability states when provider data is available.
- Notification read/unread state once an in-app notification system exists.

## Verification

- `npm test --workspace @fantasy-all-sports/web`
- `npm run build --workspace @fantasy-all-sports/web`
- `npm run typecheck --workspace @fantasy-all-sports/web`

All passed.
