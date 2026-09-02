# P0 Screen Accessibility Regression Suite

## Status

BE-A11Y-031 is implemented for the current server-rendered Next.js/Supabase architecture.

## Files

- `apps/web/app/accessibility-automation/p0ScreenRegression.test.ts`
- `apps/web/app/accessibility-automation/axeTooling.test.ts`
- `apps/web/app/accessibility-automation/axeTestUtils.ts`

## Covered Screens

- Roster and lineup: `apps/web/app/franchises/[franchiseId]/team/page.tsx`
- Player search: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Waivers: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Draft: `apps/web/app/drafts/[draftId]/page.tsx`, `apps/web/app/drafts/[draftId]/DraftClock.tsx`, `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
- Matchup/live scoring: `apps/web/app/matchups/[matchupId]/page.tsx`, `apps/web/app/matchups/[matchupId]/MatchupScoreAnnouncer.tsx`
- Standings: `apps/web/app/leagues/[leagueId]/page.tsx`, `apps/web/app/leagues/[leagueId]/schedule/page.tsx`

## What The Suite Catches

The regression suite fails when the checked-in P0 screens lose core accessibility hooks:

- key accessible labels
- `role="status"` and table roles
- selected/current state semantics
- draft and waiver transaction review/confirmation content
- screen-reader live-score announcement integration
- draft queue controls

Because these pages are server components with direct Supabase reads, the P0 suite is source-anchored instead of rendering routes with mocked database state. `axe-core` fixture tests from BE-A11Y-030 remain the automated DOM rule coverage for missing names, labels, roles, states, and dialog names.

## Command

```bash
npm test --workspace @fantasy-all-sports/web
```
