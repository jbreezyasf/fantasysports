# BE-A11Y-023 Accessible Waivers

Date: 2026-08-31

Status: Implemented for the current inverse-standings waiver engine; FAAB is documented as not present in the current repo.

## Objective

Managers must be able to find a waiver asset, choose a claim, choose a drop when required, review the claim, submit it through the canonical waiver engine, inspect pending claims, and withdraw eligible pending claims.

## Files Updated

- `apps/web/app/leagues/[leagueId]/players/page.tsx`
- `apps/web/app/leagues/[leagueId]/players/waiverAccessibility.ts`
- `apps/web/app/leagues/[leagueId]/players/waiverAccessibility.test.ts`
- `apps/web/app/gate5.css`

## Current Waiver Architecture

- Waiver UI: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Server actions: `apps/web/app/leagues/[leagueId]/players/actions.ts`
- Canonical database objects:
  - `waiver_holds`
  - `waiver_claims`
  - `submit_waiver_claim`
  - `withdraw_waiver_claim`
  - `process_due_waivers`
- Core migrations:
  - `supabase/migrations/20260823183000_inverse_standings_waivers.sql`
  - `supabase/migrations/20260823183500_waiver_cutoff_and_drop_lock.sql`
  - `supabase/migrations/20260830225835_roster_integrity_mode.sql`

## Behavior Implemented

- Waiver claim creation is now two-step:
  1. Open Claim.
  2. Choose optional or required drop player.
  3. Review Waiver Claim.
  4. Submit Reviewed Claim.
- The review panel explicitly announces:
  - add player;
  - drop player or none selected;
  - FAAB amount not used by this league;
  - inverse-standings priority information;
  - waiver clear time;
  - source franchise when available.
- Full rosters still require a drop player before the final submit button is shown.
- Pending claims expose an accessible pending status and a named Withdraw action.
- Final submission still calls `submitWaiverClaim`, which calls the existing `submit_waiver_claim` RPC.
- Withdrawal still calls `withdrawWaiverClaim`, which calls the existing `withdraw_waiver_claim` RPC.

## FAAB Finding

Search command:

```bash
rg -n "FAAB|faab|budget|bid" apps packages supabase docs -g '!node_modules'
```

Result: no active FAAB implementation found in app code or Supabase migrations. Only historical/import documentation mentions FAAB.

## Remaining Work

- Record real-device waiver review and withdrawal results in `docs/accessibility/test-matrix.md`.
- If FAAB becomes part of the canonical Big Exec waiver schema, add the FAAB input to the review flow and wire it through the canonical waiver RPC rather than creating a parallel bid service.
