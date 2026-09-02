# Big Exec Focus Management Framework

Task: BE-A11Y-011  
Date: 2026-08-31

## Implemented Utilities

File: `apps/web/app/components/focusManagement.ts`

- `FOCUSABLE_SELECTOR`: shared selector for links, buttons, form fields, tabindex targets, and button/link roles.
- `isFocusableTarget`: filters disabled, `aria-disabled`, `aria-hidden`, hidden, and `tabIndex=-1` targets.
- `focusFirstIn`: moves focus to the first usable focus target in a container, with optional fallback.
- `createFocusRestorer`: captures a meaningful prior target and restores it after close/cancel.
- `moveFocusIntoModal`: moves focus into a modal/dialog container and returns a close-time restorer.
- `focusAfterItemRemoval`: moves focus to the next item, previous item, or fallback after a removal.
- `focusRouteMain`: focuses the shared `#main-content` target for route/screen transitions.

Tests:

- `apps/web/app/components/focusManagement.test.ts`

## Current Wiring

- `#main-content` is provided by `MainContent` from `apps/web/app/components/accessibility.tsx`.
- League, franchise, draft, and matchup route layouts now wrap page content in `MainContent`.
- A shared skip link points to `#main-content`.

## Still To Wire In Later Tasks

- Modal/dialog open and close behavior once the confirmation primitive exists.
- Item-removal focus behavior for draft queue, trade assets, and future editable roster lists.
- Route-transition focus behavior for client-side navigation events.
- Dynamic announcement behavior for draft room, Locker Room, lineup changes, waivers, trades, and live scoring.

## Constraints Preserved

- No fantasy rules or transaction RPCs were changed.
- The utilities are additive and do not steal focus unless called by a component.
- Draft clock announcement behavior is not changed here; that belongs to BE-A11Y-012 and draft-room remediation.
