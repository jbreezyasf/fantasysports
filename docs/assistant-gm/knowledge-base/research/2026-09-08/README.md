# Codex Handoff — Assistant GM FAQ Research

**Date:** September 8, 2026  
**Source:** Deep research across Big Exec canonical docs plus current ESPN, Yahoo, Sleeper, and fantasy-player FAQ patterns.  
**Goal:** Expand the Assistant GM knowledge base for system flow, fantasy football, and fantasy basketball while keeping user-facing answers at or below a 5th-grade reading level.

## What is included

- 31 shared Big Exec/system-flow Q&As
- 120 fantasy-football Q&As
- 160 fantasy-basketball Q&As
- 311 total Q&As
- User-facing answers checked to stay at or below a 5th-grade Flesch-Kincaid estimate

## Codex instructions

1. Read `AGENTS.md`, `docs/PRODUCT_PRD.md`, `docs/OPERATING_GUARDRAILS.md`, `docs/GATE_STATUS.md`, `docs/CURRENT_WORK.md`, and `docs/UX_UI_PAGE_SPEC.md` first, as required by the repo.
2. Then read `docs/assistant-gm/knowledge-base/00_READ_THIS_FIRST.md` and `01_ROUTING_INDEX.md`.
3. Treat the files in this folder as **research-backed candidate knowledge**, not as authority over canonical product rules.
4. Reconcile football Q&As with current Big Exec football rules before moving them into approved FAQ files. Preserve existing stable FAQ IDs where an existing FAQ already covers the same intent; do not create duplicate live answers.
5. Basketball is **not yet a canonical Big Exec gameplay ruleset**. Keep basketball content as educational/common-format knowledge until a basketball PRD or live league settings define the actual Big Exec rules.
6. For dynamic questions about a user's real roster, lineup, score, draft, waiver, trade, schedule, invite, injury state, or league setting, use authorized live tools. Do not answer from static FAQ alone.
7. Keep the transaction safety pattern: Prepare -> show/speak exact action -> confirm -> revalidate -> commit -> report result.
8. Keep voice answers short, simple, and beginner-friendly. Do not read internal tool notes aloud.
9. Preserve accessibility as a core feature, not a premium-only feature.
10. Do not change production behavior solely because this research file mentions a common ESPN/Yahoo/Sleeper feature.

## Suggested integration order

1. Shared/system-flow FAQ cleanup and readability pass
2. Football FAQ merge into the current approved knowledge-base structure
3. Add retrieval/eval coverage for the expanded football intents
4. Keep basketball in research until basketball product rules are approved
5. When basketball is approved, create sport-aware routing rather than mixing football and basketball answers in one flat FAQ set

## Files

- `shared_system_flow.md`
- `football_01_basics_roster_game_terms.md`
- `football_02_draft.md`
- `football_03_weekly_lineups_strategy.md`
- `football_04_waivers_trades.md`
- `football_05_scoring_standings_playoffs_season.md`
- `basketball_01_basics_positions_roster.md`
- `basketball_02_formats_categories.md`
- `basketball_03_draft.md`
- `basketball_04_lineups_schedule.md`
- `basketball_05_waivers_trades_injuries.md`
- `basketball_06_player_value_league_modes.md`
- `basketball_07_playoffs_scoring_strategy.md`
