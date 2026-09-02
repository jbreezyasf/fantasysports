# Big Exec Accessibility Test Matrix

Task: BE-A11Y-002  
Date: 2026-08-31  
Change type: QA documentation  
Production code changed: No

## Scope

This matrix defines the permanent accessibility QA coverage for Big Exec core beta flows. It is based on the actual routes documented in `docs/accessibility/repo-inventory.md` and the baseline failures documented in `docs/accessibility/baseline-audit.md`.

Status values:

- `Not Run`: test is defined but not executed.
- `Pass`: expected result verified.
- `Fail`: expected result not met.
- `Blocked`: could not execute because required app state, credentials, device, data, or tooling was unavailable.

## Required Platforms

| Platform | Assistive tech / setting | Required coverage | Status |
|---|---|---|---|
| iOS | VoiceOver | Core task spoken output and swipe/focus order | Not Run |
| iOS | Screen Curtain | Core tasks usable without sight | Not Run |
| iOS | Larger Text / Dynamic Type | 200% text scaling/reflow where browser supports it | Not Run |
| iOS | Reduce Motion | No required information depends on motion | Not Run |
| Android | TalkBack | Core task spoken output and swipe/focus order | Not Run |
| Android | Font size / Display size | Large text and layout reflow | Not Run |
| Android | Remove/reduce animations | No required information depends on motion | Not Run |
| Desktop | Keyboard only | Tab/shift-tab/enter/space/escape where applicable | Not Run |
| Desktop | Browser accessibility tree | Landmark/name/role/state smoke checks | Not Run |

## Test Data Requirements

Use the deterministic QA league and actors already referenced by current QA scripts where possible.

Relevant files:

- `scripts/qa-actors.mjs`
- `scripts/qa-league-reset.mjs`
- `scripts/qa-auth-save.mjs`
- `playwright.config.ts`
- `tests/e2e/big-exec-qa.spec.ts`

Required fixture states:

- Authenticated commissioner.
- Authenticated manager with an owned franchise.
- Current league season.
- Completed draft with valid rosters.
- At least one editable future lineup week.
- At least one open waiver hold.
- At least one available free agent.
- At least one matchup with lineups and scores.
- At least one standings table/list.
- At least one trade proposal and private trade room.
- At least one Locker Room message/event.
- At least one notification or status event.

## Core Task Matrix

### A11Y-MATRIX-001 — Enter League

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | User is signed in and on `/dashboard` with at least one league. |
| Steps | Navigate from Front Office/dashboard to the latest league. Traverse primary navigation. Return to Front Office. |
| Expected spoken/accessible result | Page has a clear main landmark and heading. League link name includes league identity. Current page/state is announced. Repeated navigation can be bypassed. |
| Current mapped files | `apps/web/app/dashboard/page.tsx`, `apps/web/app/leagues/[leagueId]/page.tsx`, `apps/web/app/components/BigExecAppHeader.tsx`, `apps/web/app/components/BigExecMobileNav.tsx` |
| Baseline issues | BE-A11Y-001-01, 02, 03, 04 |
| Status | Not Run |

### A11Y-MATRIX-002 — Inspect Roster

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager owns a franchise with active `roster_entries`; user is on `/franchises/[franchiseId]/team`. |
| Steps | Move through page heading, starters, bench/roster, and Roster Integrity section if active. |
| Expected spoken/accessible result | Roster assets are announced with name, position/DST, team, current starter/bench status, and any review/lock state. Lists are navigable without relying on visual columns. |
| Current mapped files | `apps/web/app/franchises/[franchiseId]/team/page.tsx` |
| Baseline issues | BE-A11Y-001-13, 15, 27 |
| Status | Not Run |

### A11Y-MATRIX-003 — Set Lineup

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager has a roster with multiple eligible players for at least one editable slot. |
| Steps | Navigate to a lineup slot. Choose a player for that slot. Submit/confirm. Verify changed starter. |
| Expected spoken/accessible result | Control name includes player and target slot. Current starter and replacement are clear. Any confirmation/status is announced. Focus returns to changed slot or status. |
| Current mapped files | `apps/web/app/franchises/[franchiseId]/team/page.tsx`, `apps/web/app/team/actions.ts` |
| Baseline issues | BE-A11Y-001-13, 14, 15 |
| Status | Not Run |

### A11Y-MATRIX-004 — Search Players

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager is on `/leagues/[leagueId]/players`; player pool is loaded. |
| Steps | Search by player name. Change position filter. Clear or change query. Inspect available/rostered state. |
| Expected spoken/accessible result | Search field has a name. Result count/filter state is announced. Active position filter is programmatically exposed. Player availability/rostered status is included in row semantics. |
| Current mapped files | `apps/web/app/leagues/[leagueId]/players/page.tsx`, `apps/web/lib/fantasy/athletePool.ts` |
| Baseline issues | BE-A11Y-001-09, 10, 12 |
| Status | Not Run |

### A11Y-MATRIX-005 — Submit Waiver Claim

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager is on `/leagues/[leagueId]/players`; at least one `waiver_holds` row is open; manager has room or a valid drop candidate. |
| Steps | Find a waiver player. Open claim control. Choose optional/required drop. Confirm claim. Verify pending claim status. Withdraw claim. |
| Expected spoken/accessible result | Claim control includes asset name and clear time. Drop selector explains requirement. Confirmation names claim asset and drop asset. Pending/withdrawn status is announced. |
| Current mapped files | `apps/web/app/leagues/[leagueId]/players/page.tsx`, `apps/web/app/leagues/[leagueId]/players/actions.ts` |
| Baseline issues | BE-A11Y-001-09, 11, 12 |
| Status | Not Run |

### A11Y-MATRIX-006 — Add Free Agent

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager is on `/leagues/[leagueId]/players`; at least one available non-waiver player/team exists. |
| Steps | Search/filter to an available player. Open add control. Choose optional/required drop. Confirm add. Verify roster status. |
| Expected spoken/accessible result | Add control includes asset name. Roster-full requirement is spoken. Confirmation names add and drop assets. Success/error status is announced and focus is recoverable. |
| Current mapped files | `apps/web/app/leagues/[leagueId]/players/page.tsx`, `apps/web/app/leagues/[leagueId]/players/actions.ts` |
| Baseline issues | BE-A11Y-001-09, 11 |
| Status | Not Run |

### A11Y-MATRIX-007 — Complete Draft Pick

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Draft is live; current manager is on the clock; player pool is loaded. |
| Steps | Inspect current pick/round/timer. Search/filter player pool. Queue a player. Move queued player. Draft a player with explicit confirmation. Verify new pick state. |
| Expected spoken/accessible result | Timer is useful but not noisy. Current turn changes are announced. Queue order/actions are clear. Draft confirmation names asset and consequence before submission. |
| Current mapped files | `apps/web/app/drafts/[draftId]/page.tsx`, `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`, `apps/web/app/drafts/[draftId]/DraftClock.tsx`, `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`, `apps/web/app/drafts/actions.ts` |
| Baseline issues | BE-A11Y-001-05, 06, 07, 08 |
| Status | Not Run |

### A11Y-MATRIX-008 — Inspect Live Matchup

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager has a current matchup with lineups and score rows. |
| Steps | Navigate to matchup. Read scoreboard. Read starter-by-starter comparison. Refresh scores. Open recap/postgame controls if available. |
| Expected spoken/accessible result | Matchup summary names teams, scores, week, state, and final/live status. Each lineup row identifies slot, side, player, and points. Refresh/finalize status is announced. |
| Current mapped files | `apps/web/app/matchups/[matchupId]/page.tsx`, `apps/web/app/matchups/actions.ts` |
| Baseline issues | BE-A11Y-001-16, 17, 29 |
| Status | Not Run |

### A11Y-MATRIX-009 — Inspect Standings

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | League season has standings rows. |
| Steps | Navigate to League HQ and Schedule. Read standings. Compare rank, record, PF/PA/streak where present. |
| Expected spoken/accessible result | Standings are exposed as table/list with rank, franchise, record, points for, points against, and streak labels. Sort/order is understandable. |
| Current mapped files | `apps/web/app/leagues/[leagueId]/page.tsx`, `apps/web/app/leagues/[leagueId]/schedule/page.tsx` |
| Baseline issues | BE-A11Y-001-20 |
| Status | Not Run |

### A11Y-MATRIX-010 — Review Trade

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager has an open trade proposal or can create one. |
| Steps | Open Trade Center. Choose sent/received assets. Review private trade room. Post message. Accept/reject/cancel with confirmation. |
| Expected spoken/accessible result | Asset selectors include owner/franchise context. Deal sheet is structured. Accept/reject/cancel actions are clearly named and confirmed before roster-changing writes. |
| Current mapped files | `apps/web/app/leagues/[leagueId]/trades/page.tsx`, `apps/web/app/trades/[tradeId]/page.tsx`, `apps/web/app/social/actions.ts` |
| Baseline issues | BE-A11Y-001-22, 23 |
| Status | Not Run |

### A11Y-MATRIX-011 — Use Chat

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager is on `/leagues/[leagueId]/locker-room`; feed has existing events. |
| Steps | Read recent messages/events. Post a new message. React to an event. Wait for another realtime event. |
| Expected spoken/accessible result | Message list does not repeatedly reannounce all content. New messages are announced once. Focus is not stolen by auto-scroll. Reaction controls have human-readable names, counts, and pressed states. |
| Current mapped files | `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`, `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`, `apps/web/app/social/actions.ts` |
| Baseline issues | BE-A11Y-001-18, 19 |
| Status | Not Run |

### A11Y-MATRIX-012 — Review Notification

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | User has at least one pending invite/status event or a recent transaction status after redirect. |
| Steps | Trigger or open invite/status notification. Read notification. Follow CTA or dismiss/return. |
| Expected spoken/accessible result | Important gameplay notification is announced and reviewable. CTA has clear purpose. In-page notices are focused/announced without losing context. |
| Current mapped files | `apps/web/app/dashboard/page.tsx`, `apps/web/lib/email/resend.ts`, `apps/web/lib/email/templates.ts`, page-level `successNotice`/`errorNotice` usage |
| Baseline issues | BE-A11Y-001-04, 24 |
| Status | Not Run |

### A11Y-MATRIX-013 — Commissioner Roster Integrity Review

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Commissioner is on `/leagues/[leagueId]/settings/roster-integrity`; at least one pending review exists. |
| Steps | Change mode/settings. Review pending request. Enter note. Approve or reject. Lock/unlock a finished roster. |
| Expected spoken/accessible result | Settings are grouped with names/descriptions. Pending review actions include franchise/asset. Confirmation/status is announced. |
| Current mapped files | `apps/web/app/leagues/[leagueId]/settings/roster-integrity/page.tsx`, `apps/web/app/leagues/[leagueId]/settings/roster-integrity/actions.ts` |
| Baseline issues | BE-A11Y-001-21, 27 |
| Status | Not Run |

### A11Y-MATRIX-014 — Inspect Stadium / Legacy

| Field | Value |
|---|---|
| Platform | iOS VoiceOver, Android TalkBack, desktop keyboard |
| Starting state | Manager has a franchise stadium and at least starter features. |
| Steps | Navigate to Stadium. Read franchise summary, achievements/features, and earned history. |
| Expected spoken/accessible result | Decorative visuals are hidden. Earned features/achievements are structured as a named list with unlock status and meaning. |
| Current mapped files | `apps/web/app/franchises/[franchiseId]/stadium/page.tsx` |
| Baseline issues | BE-A11Y-001-28 |
| Status | Not Run |

## Cross-Cutting Setting Tests

### A11Y-MATRIX-015 — Text Scaling / Reflow

| Field | Value |
|---|---|
| Platform | iOS Larger Text, Android font/display scaling, desktop browser zoom 200% |
| Starting state | Any core authenticated page, beginning with Dashboard, Team, Players, Draft, Matchup, Locker Room. |
| Steps | Increase text/display size. Traverse page and perform one core action where safe. |
| Expected spoken/accessible result | No content overlaps, controls remain reachable, horizontal scrolling is avoided except for intentional data regions with accessible alternatives. |
| Current mapped files | Global CSS plus all core route files |
| Baseline issues | BE-A11Y-001-15, 26 |
| Status | Not Run |

### A11Y-MATRIX-016 — Reduce Motion

| Field | Value |
|---|---|
| Platform | iOS Reduce Motion, Android remove/reduce animations, desktop `prefers-reduced-motion` |
| Starting state | Dashboard, Draft Room, Locker Room, Stadium. |
| Steps | Enable reduced motion. Load pages with decorative glows/live indicators/realtime refresh. |
| Expected spoken/accessible result | No essential state depends only on animation. Motion is reduced where CSS/JS animation exists. Live state is textually available. |
| Current mapped files | `apps/web/app/*.css`, `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`, `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx` |
| Baseline issues | BE-A11Y-001-18, 26 |
| Status | Not Run |

### A11Y-MATRIX-017 — Keyboard-Only Transaction Safety

| Field | Value |
|---|---|
| Platform | Desktop keyboard |
| Starting state | Authenticated manager/commissioner with valid test state for draft, waiver, lineup, trade, schedule actions. |
| Steps | Tab to each consequential action. Activate with keyboard. Confirm/cancel. Verify no accidental transaction occurs without confirmation. |
| Expected spoken/accessible result | Focus order is logical, focus visible, confirmation is keyboard accessible, escape/cancel works, final status is announced. |
| Current mapped files | Draft, Players, Team, Trades, Schedule, Roster Integrity files listed above |
| Baseline issues | BE-A11Y-001-07, 11, 14, 21, 22, 29 |
| Status | Not Run |

### A11Y-MATRIX-018 — Browser Accessibility Tree Smoke

| Field | Value |
|---|---|
| Platform | Desktop Chromium accessibility tree |
| Starting state | Local app running with authenticated QA storage states. |
| Steps | Capture accessibility snapshots for Sign-in, Dashboard, Team, Players, Draft, Matchup, Standings/Schedule, Locker Room, Trade Room. |
| Expected spoken/accessible result | Every core page has one main landmark, clear heading, current nav state, labelled controls, no unlabeled actionable icons, and status regions when dynamic messages exist. |
| Current mapped files | `playwright.config.ts`, future a11y test files |
| Baseline issues | BE-A11Y-001-30 |
| Status | Not Run |

## Manual Evidence Template

For every manual run, record:

- Date/time and app environment.
- Platform/device/browser.
- Assistive technology and relevant settings.
- QA actor.
- Route.
- Starting database/fixture state.
- Steps completed.
- Spoken output notes.
- Pass/fail/block result.
- Screenshots or accessibility-tree output where useful.
- Defects linked to baseline issue IDs or new issue IDs.

## Automation Recommendation

Start automated coverage with non-destructive checks:

- Landmark and heading checks for all core routes.
- Label/name checks for controls.
- `aria-current` checks for nav.
- No whole-list live region checks for chat/draft after remediation.
- Axe smoke checks once dependency/tooling is added.

Do not use automated checks as a substitute for VoiceOver/TalkBack manual core-task QA.
