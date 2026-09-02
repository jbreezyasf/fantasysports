# Big Exec Late-Start Leagues — Codex Implementation Backlog

This backlog is sequenced. Each phase must preserve the authoritative-server rule: clients may request actions, but cannot compute or publish official results.

## Phase 0 — Confirm canonical decisions

- [ ] Add `LATE_START_LEAGUES_PRD.md` to the product-document index.
- [ ] Confirm the initial Pro Football platform cutoff timestamp and timezone for each supported season.
- [ ] Confirm that all required seats and the draft must be completed strictly before the cutoff.
- [ ] Confirm optimal legal lineup as the sole V1 reconstruction method.
- [ ] Document how official stat corrections flow into backfilled results.

## Phase 1 — Schema and policy

- [ ] Add sport-season late-entry policy fields, including `late_entry_cutoff_at`.
- [ ] Add league activation period, late-start status, and backfill timestamps.
- [ ] Add `historical_backfill_runs` with idempotency key, scoring/stat versions, status, error, and audit fields.
- [ ] Add historical lineup persistence with source `LATE_START_OPTIMAL`.
- [ ] Add result provenance to matchups/period results.
- [ ] Add indexes and uniqueness constraints preventing duplicate league-period generation.
- [ ] Add RLS so managers can read their league's published history but cannot author official history.

## Phase 2 — Enrollment gates

- [ ] Implement a server-owned effective cutoff resolver: platform cutoff bounded by the league deadline.
- [ ] Enforce the cutoff in league creation, invitation acceptance, seat assignment, draft launch, and draft completion.
- [ ] Keep account creation and other sport enrollment independent.
- [ ] Surface the precise cutoff and first possible live period in creation/invite/draft UX.
- [ ] Add race-condition tests for requests immediately before and at the cutoff.

## Phase 3 — Activation-period resolver

- [ ] Implement sport-adapter methods for current period, first event time, completion state, and official-stat readiness.
- [ ] Select the current period only when no event has begun and backfill can finish safely.
- [ ] Otherwise select the next period and wait for the current period to become official before including it.
- [ ] Persist the simulated period range and activation period before backfill.
- [ ] Require manager/commissioner acknowledgement before launching a late draft.

## Phase 4 — Historical lineup engine

- [ ] Snapshot the completed draft roster and draft positions.
- [ ] Implement a slot-aware optimizer using the league's roster and scoring rules.
- [ ] Apply tie-breaks: score, draft position, canonical player ID.
- [ ] Treat explicit no-production as zero and missing/unsettled data as blocking.
- [ ] Persist chosen starters, bench, score components, and algorithm version.
- [ ] Add unit/property tests for flex slots, duplicate eligibility, zero scorers, ties, injuries, and byes.

## Phase 5 — Backfill orchestration

- [ ] Generate/lock the canonical full-season schedule.
- [ ] Create an asynchronous, retryable, idempotent backfill job.
- [ ] Replay each simulated period through the authoritative scoring engine.
- [ ] Calculate H2H records, PF, PA, ties, all-play, and canonical ranking inputs.
- [ ] Validate period coverage, legal lineups, matchup pairing, and aggregate standings.
- [ ] Publish results atomically only after whole-run validation.
- [ ] Suppress historical notification floods and emit one completion event.

## Phase 6 — Corrections and operations

- [ ] Integrate official stat corrections with a controlled rescore path.
- [ ] Record before/after results, reason, actor/process, and source version.
- [ ] Build operations visibility for pending, running, failed, retrying, and complete jobs.
- [ ] Add safe retry and cancel-before-publication controls.
- [ ] Add alerts for missing stats, illegal roster construction, and validation failures.

## Phase 7 — Product UX

- [ ] Add late-start explanation to league creation and invitations.
- [ ] Show “simulated periods” and “first live period” before draft.
- [ ] Add post-draft progress state while results are generated.
- [ ] Label backfilled matchups and recaps without visually devaluing official standings.
- [ ] Add a single backfill completion summary with standings.
- [ ] Ensure keyboard, screen-reader, reduced-motion, and voice flows are complete.

## Phase 8 — Assistant GM integration

- [ ] Load `docs/assistant-gm/knowledge-base/00_READ_THIS_FIRST.md` before FAQ retrieval.
- [ ] Route stable late-start questions to `faq/10_LATE_START_LEAGUES.md`.
- [ ] Route live cutoff, draft, job, standings, and player-stat questions to authoritative tools.
- [ ] Add concise spoken confirmations for cutoff, simulated range, activation period, and no-retroactive-moves rule.
- [ ] Test interruptions, ambiguous week references, and transcript parity.

## Phase 9 — Executive League commerce

- [ ] Permit the commissioner to purchase the $99 Executive League Season Pass for an eligible late league.
- [ ] Bind entitlement to league + sport + season, exactly as in the Executive League PRD.
- [ ] Make Assistant GM Pro+ available to all league managers after entitlement activation.
- [ ] Keep voice accessibility available without Executive entitlement.
- [ ] Ensure the enrollment cutoff does not accidentally become an upgrade cutoff for existing leagues.

## Phase 10 — Verification and rollout

- [ ] End-to-end test activation before opening day, during an unstarted period, during an active period, and at the cutoff.
- [ ] Replay a fixed historical fixture twice and prove byte-equivalent official results/no duplicates.
- [ ] Test a stat correction after activation.
- [ ] Test football closure while another sport remains open.
- [ ] Load-test ten-manager multi-period backfill and establish a completion SLO.
- [ ] Feature-flag the rollout and begin with internal/beta leagues.
- [ ] Add dashboards for funnel, latency, failures, retries, retention, and Executive attachment.

