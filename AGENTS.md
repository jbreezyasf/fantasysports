# Big Exec Fantasy Sports — Codex Operating Instructions

This repository contains the authoritative product and implementation context for Big Exec Fantasy Sports.

## Required reading before material work

Before planning, diagnosing, or modifying the product, read:

1. `docs/PRODUCT_PRD.md`
2. `docs/OPERATING_GUARDRAILS.md`
3. `docs/GATE_STATUS.md`
4. `docs/CURRENT_WORK.md`
5. `docs/UX_UI_PAGE_SPEC.md`

For recap-renderer work, also read:

6. `docs/recap/RECAP_V2_PRD.md`
7. `docs/recap/RECAP_V2_DEVELOPER_TASKS.md`
8. `docs/recap/RECAP_V2_SPRINT_PLAN.md`

## Source-of-truth hierarchy

When sources conflict, prefer:

1. current production behavior/data;
2. current deployed version;
3. source code matching that deployment;
4. canonical repository documentation;
5. current primary-source external documentation;
6. reproduced tests;
7. historical audits/model analysis;
8. assumptions.

Never repeat an audit, model, document, or prior claim as current fact without validating it when validation is possible.

## Evidence standard

Material findings must be classified as:

- **PROVEN**
- **LIKELY / INFERRED**
- **UNVERIFIED**

Do not convert LIKELY or UNVERIFIED claims into implementation tasks as though they are proven defects.

## Product direction

Big Exec Season 1 is a **standalone fantasy sports application**.

The primary beta experience must support:

Draft → Team ownership → Lineup management → Free agency / waivers → Trading → League communication → Live scoring → Competition → Postseason → History / legacy.

Historical import and companion functionality are secondary capabilities. They must not replace the standalone Season 1 product.

## UX/UI is P0

UX/UI is a first-class P0 product requirement, not end-of-project polish.

For manager-facing and commissioner-facing product flows, work should proceed as:

> implement/validate functionality → complete the associated UX/UI from `docs/UX_UI_PAGE_SPEC.md` → test mobile + desktop → then advance the gate.

Do not mark a user-facing gate PASS if the flow is functionally correct but confusing, visually unfinished, inaccessible, or inconsistent with the canonical Big Exec product shell.

All authenticated product pages must follow the canonical left-navigation and page hierarchy defined in `docs/UX_UI_PAGE_SPEC.md` unless that document is explicitly changed.

## Fantasy truth

Fantasy Core owns authoritative rosters, lineups, statistics, scores, standings, playoff qualification, championships, and official awards.

AI may explain and dramatize deterministic results. AI must not determine or invent official fantasy outcomes.

## Original visual IP

Use original Big Exec visual assets. Do not create NFL/team-logo lookalikes, copied uniforms, recognizable professional-player likenesses, or trophies/awards that imitate recognizable NFL awards such as the Lombardi Trophy.

The Big Exec Champions Trophy and other awards must use original Big Exec geometry and design language as specified in `docs/UX_UI_PAGE_SPEC.md`.

## Gate rules

Never mark a product gate PASS merely because code exists, a build is green, a schema exists, a simulation passed, or documentation says PASS.

A gate passes only when its stated acceptance criteria have been executed and evidence recorded.

## QA rules

Before handing foundational functionality to human beta testers:

- exercise the actual user flow internally;
- test production or production-equivalent behavior;
- test mobile and desktop where applicable;
- test refresh/reconnect;
- verify database state;
- test permission boundaries;
- test failure behavior;
- verify results after deployment.

Beta testers should evaluate experience and edge cases, not discover whether the core product works at all.

## Development behavior

Use read-only investigation first.

Do not make destructive changes while diagnosing unless explicitly required.

Complete deletion/replacement is authorized when it materially helps build the correct Big Exec product, but deletion must serve a proven architectural/product need.

Fix root causes rather than repeatedly patching symptoms.

Preserve established Big Exec product names, franchise concept, branding, visual direction, scoring/product decisions, and competition structure unless the canonical PRD explicitly changes them.

## Before completing work

Run all applicable tests, typecheck, build, migration validation, and production/preview verification.

Update `docs/CURRENT_WORK.md` when task state changes.

Update `docs/GATE_STATUS.md` only when new evidence changes a gate.

Never manufacture proof.
