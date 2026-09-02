# BE-A11Y-022 Accessible Player Search and Player Details

Date: 2026-08-31

Status: Implemented for current player-search page; live opponent/projection enrichment remains pending because those fields are not loaded by this route.

## Objective

Screen-reader users must be able to search, filter, inspect, and act on player results.

## Files Updated

- `apps/web/app/leagues/[leagueId]/players/page.tsx`
- `apps/web/app/leagues/[leagueId]/players/playerSearchAccessibility.ts`
- `apps/web/app/leagues/[leagueId]/players/playerSearchAccessibility.test.ts`
- `apps/web/lib/fantasy/athletePoolCore.ts`
- `apps/web/app/gate5.css`

## Current Implementation

- Route: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Athlete loader: `apps/web/lib/fantasy/athletePool.ts` -> `apps/web/lib/fantasy/athletePoolCore.ts`
- Add/waiver actions: `apps/web/app/leagues/[leagueId]/players/actions.ts`
- Canonical transaction RPCs:
  - `claim_free_agent`
  - `submit_waiver_claim`
  - `withdraw_waiver_claim`

## Behavior Implemented

- Search input now has an explicit associated label.
- Position filters include:
  - ALL
  - QB
  - RB
  - WR
  - TE
  - FLEX
  - K
  - D/ST
- FLEX filters RB, WR, and TE athletes.
- Available-only filtering is exposed through a checkbox in the search form.
- Result count, active filter, availability mode, and sort order are exposed through a `role="status"` screen-reader summary.
- Player and D/ST result cards now expose coherent `aria-label` text with:
  - name;
  - position;
  - NFL team;
  - availability;
  - injury status where loaded, with fallback;
  - opponent fallback;
  - projection fallback;
  - main action.
- Player and D/ST rows now include explicit `View player details` disclosures.
- Add/Claim actions continue to use the existing transaction server actions and Supabase RPCs.
- The athlete pool loader now includes optional `injury_status`, matching the admin sync write model.

## Known Data Limits

- Opponent is not loaded by the current player-search route.
- Player projections are not loaded by the current player-search route.
- D/ST injury status is not applicable in the current route.

These are documented fallbacks rather than invented data.

## Remaining Work

- If projections/opponents become canonical player-search fields, load them through the existing fantasy/stat services and replace the fallback text.
- Record VoiceOver/TalkBack search and details-disclosure results in `docs/accessibility/test-matrix.md`.
