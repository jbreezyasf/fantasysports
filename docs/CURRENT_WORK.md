# Big Exec Current Work

**Primary objective:** Prepare the standalone Pro Football product for the 10-manager friend beta.

The authoritative product definition is `docs/PRODUCT_PRD.md`. This file is the execution queue, not a place to change product strategy.

---

## P0 — Reconcile Current Implementation

- [ ] Inspect current `main`.
- [ ] Inspect the active production deployment and commit.
- [ ] Inspect current production database/schema/functions.
- [ ] Reconcile Gates 0–5 against actual current evidence.
- [ ] Update `docs/GATE_STATUS.md` with evidence, not inherited PASS labels.
- [ ] Identify documentation drift and conflicts.

---

## P0 — Draft Night

- [ ] Validate complete eligible player pool after pagination/cap fixes.
- [ ] Implement/validate rankings.
- [ ] Implement/validate personal draft queue.
- [ ] Implement/validate server-authoritative timer.
- [ ] Implement/validate autopick.
- [ ] Implement/validate realtime draft updates.
- [ ] Implement/validate reconnect recovery.
- [ ] Validate commissioner pause.
- [ ] Validate commissioner correction/undo.
- [ ] Run full internal 10-manager production-equivalent draft QA.

---

## P0 — Team Management

- [ ] Validate roster flow.
- [ ] Validate lineup flow.
- [ ] Validate individual kickoff locks.
- [ ] Validate free agency.
- [ ] Validate inverse-standings waiver system.
- [ ] Validate post-deadline waiver/free-agent behavior.
- [ ] Validate trade deadline at UI + authoritative server/database boundary.
- [ ] Complete/validate trade-state lifecycle.

---

## P0 — Game Day

- [ ] Build/validate current 2026 game-stat ingestion.
- [ ] Shadow-score current games when data is available.
- [ ] Validate 6-point touchdown scoring end-to-end.
- [ ] Validate score latency.
- [ ] Validate concurrent games.
- [ ] Validate matchup finalization.
- [ ] Validate stat corrections.

---

## P0 — Season Automation

- [ ] Validate unattended scheduler/job architecture.
- [ ] Validate special-week generation.
- [ ] Validate weekly awards.
- [ ] Validate standings/all-play automation.
- [ ] Validate playoffs.
- [ ] Validate Redemption tournament.
- [ ] Validate championship.
- [ ] Validate season close.
- [ ] Run full internal season rehearsal before friend beta.

---

## P1 — Five-Year History & Legacy

Current implementation work is tracked in PR #2 (`feature/five-season-history-lab`) until reconciled/merged.

- [ ] Reconcile PR #2 against current `main` before merge.
- [ ] Validate explicit current-season behavior across gameplay routes.
- [ ] Validate History & Legacy UI.
- [ ] Validate historical rivalries/head-to-head.
- [ ] Validate championships/Redemption history.
- [ ] Validate stadium persistence across repeat achievements.
- [ ] Validate destructive/rebuildable QA fixture.
- [ ] Validate historical recap playback.
- [ ] Execute and verify real historical provider import only when the required authenticated/provider path is available and permitted.

---

## P1 — Recap V2

Required specs:

- `docs/recap/RECAP_V2_PRD.md`
- `docs/recap/RECAP_V2_DEVELOPER_TASKS.md`
- `docs/recap/RECAP_V2_SPRINT_PLAN.md`

Current objectives:

- [ ] Capture current V1 baseline.
- [ ] Establish Recap V2 truth/data contract.
- [ ] Build deterministic story classifier/moment selector.
- [ ] Replace text-first scene architecture with modular clay/action scenes.
- [ ] Build Rocket Arm.
- [ ] Build 20+ yard rushing-TD Fire Trail.
- [ ] Build final-score/MVP/legacy scenes.
- [ ] Validate 9:16 and 16:9.
- [ ] Validate blowout, nail-biter, comeback, rivalry, and championship archetypes.
- [ ] Do not make V2 default until truth + technical + creative gates pass.

---

# Working Rule

When one item is completed, update this file in the same PR/commit with the evidence or link to the evidence. Do not check a box simply because code was written.
