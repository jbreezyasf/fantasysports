# BE-A11Y-026 Accessible Standings

Date: 2026-08-31

Status: Implemented for League HQ, Schedule standings, and postseason seeds.

## Objective

Standings must be readable and navigable with assistive technology. Rank, team, record, and displayed tiebreakers need context beyond visual row position.

## Files Updated

- `apps/web/app/leagues/[leagueId]/page.tsx`
- `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
- `apps/web/app/leagues/[leagueId]/standingsAccessibility.ts`
- `apps/web/app/leagues/[leagueId]/standingsAccessibility.test.ts`

## Current Standings Architecture

- League HQ standings:
  - `apps/web/app/leagues/[leagueId]/page.tsx`
  - Loads `standings` by current `league_season_id`.
  - Shows rank, franchise name, record, and points for.

- Schedule page standings:
  - `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
  - Loads `standings` with rank order, points for, points against, and streak.
  - Also renders postseason seeds when available.

## Behavior Implemented

- Standings containers now expose `role="table"`.
- Hidden column headers provide context for:
  - rank;
  - team;
  - record;
  - points for;
  - points against where loaded;
  - streak where loaded.
- Each standing row exposes a full row label with rank, team, record, and tiebreaker values.
- Visible row cells expose `role="cell"`.
- Schedule standings include screen-reader-only points-against and streak cells because those values are loaded by the page but not visually shown.
- Postseason seed rows expose seed, team, and bracket context.

## Remaining Work

- Record VoiceOver/TalkBack standings navigation results in `docs/accessibility/test-matrix.md`.
- Add manager names if/when the standings route loads them canonically.
