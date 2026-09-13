# Big Exec Internal Season Stress Harness

**Status:** football implementation in progress  
**Scope:** `BIG_EXEC_STRESS_SEASON_2026` only  
**Draft:** September 12, 2026 at 8:30 PM America/Chicago (`2026-09-13T01:30:00Z`)

## Product boundary

This is internal QA infrastructure. It is not a Big Exec manager feature, paid feature, commissioner option, Front Office Advisor mode, or public API capability.

- Juanita's `juanita.brazziel@gmail.com` account remains fully human-controlled.
- Nine controlled `+qa-manager-01` through `+qa-manager-09` accounts are the only synthetic actors.
- Actions are restricted to one explicit league and its 2026 season.
- The harness defaults to dry-run, expires after the test season, and writes an append-only local action log.
- The harness uses each QA manager's authenticated session and canonical fantasy RPCs. It must not write fantasy tables directly.
- Existing customer-facing confirmation and autonomy rules remain unchanged.

## Saturday release slice

1. Configure the designated late-start stress league and current season UUIDs locally.
2. Confirm Juanita owns the commissioner/manager seat using her normal browser session.
3. Confirm all nine QA accounts have exactly one seat and can see the same scheduled draft.
4. Confirm the scheduled instant is exactly `2026-09-13T01:30:00Z`.
5. Run the existing beta draft preflight and the stress-harness preflight.
6. Produce the deterministic mixed-attendance plan.
7. Keep the harness in dry-run until both preflights pass.
8. During the draft, allow selected QA actors to pick through `make_draft_pick`; allow designated absences to expire into the real autopick path.
9. Record intent, action, outcome, and platform response for every harness action.

True late-start historical reconstruction is a separate canonical product dependency and remains unfinished. The harness must not manufacture Week 1 scores or bypass the late-start publication rules.

## Commands

Create ignored `config/stress-season-2026.local.json` from the checked-in example, then run:

```bash
npm run qa:stress:season -- preflight --config=config/stress-season-2026.local.json
npm run qa:stress:season -- draft-plan --config=config/stress-season-2026.local.json --pick=1
```

Execution additionally requires the exact environment phrase documented in `scripts/stress-season/config.mjs`. Preflight must pass first.

## Season-long work after Draft Night

The next adapters will cover lineup decisions, free agency, waivers, trades, private negotiation, locker-room messaging, and weekly audit summaries. Each must call the already-authoritative transaction path and retain per-action scope checks.

## Basketball preservation

The orchestration, authorization, audit, persona persistence, and realistic-availability concepts are sport-neutral. Basketball will receive its own sport adapter only after its league format, roster rules, schedule cadence, waiver behavior, scoring, and competition design are decided and stress-tested. Football assumptions must not leak into that adapter.
