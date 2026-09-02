# Big Exec Accessible Primitive Inventory

Task: BE-A11Y-010  
Date: 2026-08-31

## Implemented Shared Primitives

File: `apps/web/app/components/accessibility.tsx`

- `SkipLink`: visible-on-focus link to `#main-content`.
- `MainContent`: focusable route-content target with `id="main-content"` and `tabIndex={-1}`.
- `VisuallyHidden`: shared wrapper for `.srOnly` text.
- `StatusMessage`: shared success/error/info status with `role="status"` or `role="alert"` and matching live-region politeness.
- `LiveRegion`: reusable hidden live-region primitive for future event announcements.
- `IconButton`: requires an explicit `label` prop and exposes disabled, pressed, and expanded states through native/ARIA attributes.
- `A11yNote`: hidden explanatory text for future form/control descriptions.

Tests:

- `apps/web/app/components/accessibility.test.tsx`

Initial wiring:

- `apps/web/app/leagues/[leagueId]/layout.tsx`
- `apps/web/app/franchises/[franchiseId]/layout.tsx`
- `apps/web/app/drafts/[draftId]/layout.tsx`
- `apps/web/app/matchups/[matchupId]/layout.tsx`
- `apps/web/app/gate5.css`

## Existing Controls Still Needing Centralization

- Button/action links using `.primary`, `.secondary`, `.miniAction`.
- Player/roster rows using `.playerRow`.
- Draft candidate rows and queue rows.
- Modal/dialog/confirmation pattern: not yet implemented.
- Segmented controls/tabs for position filters.
- Search field primitive.
- Toast/alert/status replacement across all pages.
- Stat row / standings table / matchup comparison table.
- Timer announcement primitive for draft clock.
- Navigation item primitive and canonical shell decision.
- Disclosure/dropdown primitive for Add/Claim flows.

## Constraints Preserved

- No fantasy transaction logic was duplicated.
- No Supabase RPCs were changed.
- Existing visual classes are preserved.
- The new primitives are additive and available for later remediation tasks.
