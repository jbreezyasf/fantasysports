# Big Exec Current Work

**Primary objective:** Prepare the standalone Pro Football product for the 10-manager friend beta.

The authoritative product definition is `docs/PRODUCT_PRD.md`. This file is the execution queue, not a place to change product strategy.

**P0 execution rule:** User-facing functionality and UX/UI advance together. Use `docs/UX_UI_PAGE_SPEC.md` as the canonical page-by-page design requirement. A functional flow is not beta-ready until the associated mobile/desktop UX is also completed and reviewed.

---

## P0 — Reconcile Current Implementation

- [x] Inspect current `main`. Evidence: `main`, `origin/main`, and local `HEAD` are `70a73984a6644830942b364de4a727b7b564f6f0` on 2026-08-26.
- [x] Inspect the active production deployment and commit. Evidence: Vercel production deployment `dpl_2XQuGA9UMuGYkzzCq7yCFyisVEHC` is `READY` at commit `70a73984a6644830942b364de4a727b7b564f6f0`.
- [x] Inspect current production database/schema/functions. Evidence: Supabase project `njjiqdqhmcbxblwhfade` inspected read-only on 2026-08-26; see `docs/GATE_STATUS.md`.
- [x] Reconcile Gates 0–5 against actual current evidence. Evidence: `docs/GATE_STATUS.md` current evidence baseline dated 2026-08-26.
- [x] Update `docs/GATE_STATUS.md` with evidence, not inherited PASS labels. Evidence: no gameplay gate was marked PASS.
- [x] Identify documentation drift and conflicts. Evidence: `docs/GATE_STATUS.md` notes stale August 23 claims where current production now differs, including pg_cron, waiver tables, CI, and security RPC exposure.

**Highest-priority unblocked task identified 2026-08-26:** Validate complete eligible player pool after pagination/cap fixes in a production-equivalent authenticated draft-room flow. The code now pages eligible athletes, and production data has healthy QB/RB/WR/TE/K counts, but the actual draft-room user flow has not been exercised and cannot be used as Gate 1 PASS evidence yet.

**Progress 2026-08-26:** Added a web regression test for the draft-pool pagination contract. It proves the loader continues after a full 1,000-row page and preserves WR rows beyond the first page. `npm test`, `npm run typecheck`, and `npm run build` pass. The authenticated production draft-room UI remains unverified, so the Draft Night checklist item stays open.

**Progress 2026-08-26:** Continued Draft Night implementation in the current working tree without changing product direction. Added deterministic Big Exec internal draft rankings with overall rank, positional rank, source, version, and tests; added a `draft_queues` migration plus draft-room UI/server actions for adding, removing, and moving personal queue items. Fresh forced local verification passed with `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`. The migration is not applied to production and authenticated production-equivalent draft QA has not been executed, so no Draft Night checklist item is marked complete yet.

**Progress 2026-08-26:** Added server-authoritative draft deadline/autopick implementation in the current working tree. Migration `20260826043918_draft_timer_autopick.sql` adds `drafts.current_pick_deadline_at`, updates `start_draft` and `make_draft_pick` to advance deadlines from the database, adds queue-first `process_expired_draft_picks`, and schedules a pg_cron job for expired picks when `pg_cron` is installed. The draft room now renders the server deadline countdown and commissioner expired-pick processor. Fresh forced local verification passed with `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`. Production migration/application and 10-manager draft QA remain unexecuted.

**Progress 2026-08-26:** Added local working-tree support for draft realtime refresh, commissioner pause/resume, and commissioner undo with audit trail. Migration `20260826044414_draft_realtime_publication.sql` adds `drafts`, `draft_picks`, and `draft_queues` to Supabase Realtime when the publication exists, and the draft room subscribes to draft/pick/queue changes with polling fallback. Migration `20260826044536_draft_pause_resume.sql` adds paused clock state plus `pause_draft`; migration `20260826044713_draft_correction_undo.sql` adds `draft_corrections` and `undo_last_draft_pick`. Fresh forced local verification passed with `npx turbo test --force`, `npx turbo build --force`, and `npx turbo typecheck --force`. These remain unproven until migrations are applied and the actual authenticated multi-manager draft QA is executed.

**Progress 2026-08-26:** Production database schema was updated with the five Draft Night SQL files using `npx supabase db query --linked --file ...` after `supabase db push --linked --dry-run` was blocked by pre-existing production/local migration-history drift. Production verification proved `drafts.current_pick_deadline_at`, `drafts.paused_at`, and `drafts.paused_remaining_seconds`; `draft_queues` and `draft_corrections` with RLS enabled; draft queue/timer/pause/undo RPC signatures; realtime publication membership for `drafts`, `draft_picks`, and `draft_queues`; active cron `big-exec-process-draft-autopicks`; and no anon execute privilege on the new Draft Night RPCs. Supabase advisors still report existing broader SECURITY DEFINER/RLS performance warnings, including expected authenticated SECURITY DEFINER warnings for new guarded RPCs. `supabase db lint --linked` hung after login initialization and was stopped. Application deployment and authenticated draft QA remain pending.

**Progress 2026-08-26:** Application commit `ce1ca0edc1788b2fd290d7e8f7a53c58b592ea0a` was pushed to `origin/main` after local HTTPS push was retried without an invalid `GITHUB_TOKEN`. Vercel production deployment `dpl_9bRKcnsFvTnjgn7HxBGqoiPuf9jM` reached `READY`, is aliased to `www.bigexecfs.com` and `bigexecfs.com`, and the live homepage HTML references that deployment id. GitHub commit status reports Vercel success. Vercel production runtime error/fatal log query for that deployment over the last 30 minutes returned no logs. Authenticated draft QA remains pending.

---

## P0 — UX/UI & Product Polish

**Canonical spec:** `docs/UX_UI_PAGE_SPEC.md`

UX/UI is not deferred until after backend completion. Each gameplay flow must be functionally validated and visually completed before its gate can pass.

### P0-A — Global shell and navigation

- [ ] Replace conflicting authenticated primary navigation patterns with the canonical left-side product navigation.
- [ ] Desktop persistent left rail: Front Office, Matchup, Locker Room, League, Stadium.
- [ ] Mobile top-left trigger opening the same left-side navigation drawer/sheet.
- [ ] Keep primary navigation order consistent on every authenticated page.
- [ ] Place profile/settings controls outside the main five destinations.
- [ ] Verify active-route state, keyboard/focus behavior, responsive width, loading state, and mobile touch targets.

### P0-B — Front Office / Home

- [ ] Top-left: Team/Franchise Name, Manager Name, Record.
- [ ] Top-right: League Name.
- [ ] Build four primary cards: Draft Room/Free Agency, Locker Room, Trade Room, League News.
- [ ] Draft Room card reflects unscheduled/scheduled/live states.
- [ ] Draft Room card automatically becomes Free Agency after draft completion.
- [ ] Free Agency card exposes useful waiver/free-agent status without dumping the entire player pool onto Home.
- [ ] Locker Room card previews relevant social activity.
- [ ] Trade Room card previews incoming/outgoing negotiation state and trade deadline.
- [ ] League News card previews deterministic standings/trade/performance/rivalry/award/recap updates.

### P0-C — Draft Room UX/UI

- [ ] Complete authenticated 10-manager functional QA using the managed QA accounts; verify the accounts/roles before relying on them as evidence.
- [ ] Current manager / round / pick / server timer hierarchy.
- [ ] Rankings presentation.
- [ ] Personal queue UX.
- [ ] Roster-needs guidance.
- [ ] Pick confirmation and drafted-player history/feed.
- [ ] Pause/resume/correction controls separated for commissioner.
- [ ] Reconnect/recovery state.
- [ ] Mobile Draft Room usability.

### P0-D — Team management UX/UI

- [ ] Roster page.
- [ ] Lineup page and individual kickoff-lock clarity.
- [ ] Free Agency page: AVAILABLE / WAIVERS / ROSTERED states.
- [ ] Waiver claim/drop-player workflow.
- [ ] Trade Room landing page.
- [ ] Side-by-side trade creation flow.
- [ ] Private negotiation room and trade lifecycle states.
- [ ] Post-deadline closed-trading state and trade-history access.

### P0-E — Matchup / Game Day UX/UI

- [ ] Broadcast-style score hierarchy.
- [ ] Franchise identity for both sides.
- [ ] Starter/player scoring contributions.
- [ ] Players remaining and real-game status.
- [ ] Upcoming/live/final states.
- [ ] Recap entry point once available.
- [ ] Mobile + desktop live-state QA.

### P0-F — League UX/UI

- [ ] Standings.
- [ ] Schedule.
- [ ] Power / All-Play presentation where supported.
- [ ] Playoff picture/bracket.
- [ ] History & Legacy entry point.
- [ ] Commissioner-authorized settings entry point.
- [ ] Avoid spreadsheet-first presentation while keeping competitive truth clear.

### P0-G — Locker Room, News, Stadium & Legacy

- [ ] Locker Room distinguishes human messages from deterministic league events.
- [ ] League News page: top story, standings movers, biggest performances, transactions, rivalry watch, weekly awards, playoff picture, recaps.
- [ ] Stadium remains a persistent primary left-nav destination.
- [ ] Stadium includes Owner's Office and legacy/award inspection.
- [ ] Create original Big Exec Champions Trophy design; do not imitate the Lombardi Trophy or recognizable NFL awards.
- [ ] Winning franchise's Champions Trophy appears in the Owner's Office and persists historically.
- [ ] Original Big Exec banners/monuments/statues only.
- [ ] History & Legacy connects championships/rivalries/recaps/stadium progression.
- [ ] Recap V2 passes its separate truth, technical, and creative acceptance gates.

### P0-H — Cross-product polish

- [ ] Loading states.
- [ ] Empty states.
- [ ] Success/confirmation states.
- [ ] Disabled/locked states.
- [ ] Error/failure/retry states.
- [ ] Keyboard/focus/accessibility basics.
- [ ] Reduced motion.
- [ ] Responsive mobile/desktop review.
- [ ] Original-IP review across trophies, awards, uniforms, logos, and media.

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


---

## Approved Feature — Executive League + Assistant GM Pro+

**Canonical specs:**

- `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_PRD.md`
- `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_TASKS.md`

**Commercial decision:** Big Exec Executive League Season Pass is $99 one-time per league, sport, and season. Assistant GM Pro+ is included for all managers and is not a separate Stripe product at launch. Accessibility voice remains free.

- [ ] Run `BE-EXEC-000` read-only repository/deployment/schema inventory.
- [ ] Reconcile the new PRD with the existing accessibility + Voice Assistant GM backlog.
- [ ] Do not start checkout until Stripe product/price configuration is provided.
- [ ] Do not allow this workstream to displace unresolved standalone fantasy P0 gates.
- [ ] Begin entitlement/GM foundation only after the inventory identifies exact current integration points.
