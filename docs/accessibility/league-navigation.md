# BE-A11Y-020 Accessible League Navigation

Date: 2026-08-31

Status: Implemented in navigation components; device-matrix verification remains pending.

## Objective

Primary Big Exec navigation must be usable with keyboard, VoiceOver, and TalkBack. Users need meaningful destination names, announced current section state, reachable back/home navigation, and no focus traps.

## Files Updated

- `apps/web/app/components/BigExecAppHeader.tsx`
- `apps/web/app/components/BigExecMobileNav.tsx`
- `apps/web/app/components/BigExecMobileNavClient.tsx`
- `apps/web/app/components/BigExecMobileNavClient.test.tsx`
- `apps/web/app/recaps/[recapId]/layout.tsx`

## Current Architecture

- Desktop/authenticated league chrome is rendered by `BigExecAppHeader`.
- Mobile/authenticated primary navigation is rendered by server component `BigExecMobileNav`, which looks up the current user, current league season, owned franchise, and latest matchup through Supabase.
- `BigExecMobileNav` passes resolved destinations to client component `BigExecMobileNavClient`.
- `BigExecMobileNavClient` reads `usePathname()` and sets `aria-current="page"` on the active mobile destination.
- League, franchise, draft, matchup, and recap layouts use the shared app header and mobile nav.

## Behavior Implemented

- Desktop league nav now includes a hidden current-section announcement.
- Desktop nav links include explicit accessible labels when active.
- Commissioner `Roster Integrity` destination now exposes current state through `aria-current="page"`.
- Mobile nav now exposes current state with `aria-current="page"` and a hidden `Current section` announcement.
- Disabled mobile destinations now have explanatory accessible labels:
  - team unavailable until the user owns a franchise;
  - matchup unavailable until the franchise has a scheduled matchup.
- Recap pages now use the same `SkipLink` and `MainContent` wrapper as other authenticated game pages.

## Verified Primary Destinations

- Front Office: `/dashboard`
- League HQ: `apps/web/app/leagues/[leagueId]/page.tsx`
- Players: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Schedule: `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
- Trades: `apps/web/app/leagues/[leagueId]/trades/page.tsx`
- Locker Room: `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- Team: `apps/web/app/franchises/[franchiseId]/team/page.tsx`
- Stadium: `apps/web/app/franchises/[franchiseId]/stadium/page.tsx`
- Matchup: `apps/web/app/matchups/[matchupId]/page.tsx`
- Recap: `apps/web/app/recaps/[recapId]/page.tsx`
- Roster Integrity: `apps/web/app/leagues/[leagueId]/settings/roster-integrity/page.tsx`

## Known Constraints

- Mobile bottom navigation intentionally exposes five high-frequency destinations because the existing product shell is designed around a five-item bottom bar.
- Schedule, Trades, and Locker Room remain reachable from desktop header and in-page links on mobile, but they are not all first-level mobile bottom-nav items.
- There are no modal focus traps in the current navigation implementation.

## Remaining Verification

Record results in `docs/accessibility/test-matrix.md` when device testing is available:

- VoiceOver can identify current desktop and mobile sections.
- TalkBack can identify current mobile sections.
- Keyboard users can skip to main content from every authenticated layout.
- A user can move from dashboard into a league and back without sighted help.
