# BE-A11Y-025 Accessible Matchup and Live Scoring

Date: 2026-08-31

Status: Implemented for the current matchup page; production live-game data verification remains pending.

## Objective

Game state must be understandable without visual layout or chart interpretation.

## Files Updated

- `apps/web/app/matchups/[matchupId]/page.tsx`
- `apps/web/app/matchups/[matchupId]/MatchupScoreAnnouncer.tsx`
- `apps/web/app/matchups/[matchupId]/matchupAccessibility.ts`
- `apps/web/app/matchups/[matchupId]/matchupAccessibility.test.ts`
- `apps/web/app/matchups/actions.ts`

## Current Matchup Architecture

- Matchup route: `apps/web/app/matchups/[matchupId]/page.tsx`
- Score recompute/finalize actions: `apps/web/app/matchups/actions.ts`
- Canonical scoring RPC: `recompute_matchup`
- Score tables:
  - `fantasy_player_scores`
  - `fantasy_team_scores`
  - `matchups`
- AI/postgame talk remains separate and only uses deterministic matchup facts from `apps/web/app/matchups/actions.ts`.

## Behavior Implemented

- Matchup summary exposes:
  - user score when the current user owns a matchup franchise;
  - opponent score when applicable;
  - home and away score;
  - winning/losing/tied state;
  - game status;
  - projected-final fallback;
  - players-remaining fallback.
- Scoreboard has a textual `aria-label` equivalent.
- Score refresh redirects with `score_status=refreshed` and renders a `role="status"` confirmation.
- Important score summaries are announced through the shared BE-A11Y-012 screen-reader announcement queue.
- Player scoring rows now include contextual labels with slot, home asset, away asset, and points.

## Chart and Win-Probability Finding

- No chart-only data was found on the current matchup page.
- No win-probability UI was found on the current matchup page.

## Known Data Limits

- Projected final scores are not loaded by the current matchup route.
- Players remaining are not loaded or calculated by the current matchup route.

These are announced as explicit fallbacks instead of inferred data.

## Remaining Work

- Verify refresh/live behavior against production-equivalent game data.
- Record VoiceOver/TalkBack matchup results in `docs/accessibility/test-matrix.md`.
