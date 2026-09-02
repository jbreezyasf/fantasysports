# Big Exec Accessibility Baseline Audit

Task: BE-A11Y-001  
Date: 2026-08-31  
Change type: Audit only  
Production code changed: No

## Scope Boundary

This baseline uses BE-A11Y-000 repo inventory plus static inspection of the current Next.js/Supabase implementation. It does not claim VoiceOver/TalkBack reproduction because this task did not run device assistive technology sessions. It also does not remediate; the backlog stop condition says not to begin fixes until shared failures are identified.

Evidence labels:

- **PROVEN:** observable in current repository files.
- **LIKELY / INFERRED:** likely accessibility impact based on code structure, but not yet reproduced with assistive tech.
- **UNVERIFIED:** not tested in this audit.

## Shared Failure Themes

**PROVEN:** Accessibility issues are not isolated to one screen. The repeated patterns below should be fixed centrally before page-by-page polish:

- No skip link / landmark strategy for repeated authenticated navigation.
- No central accessible button, status message, disclosure, table/list, timer, or action-confirmation primitive.
- Several core actions submit immediately through forms with no confirmation step or focus return.
- Dynamic updates rely on `router.refresh()` without user-facing accessible announcements.
- Some `aria-live` content updates too frequently for screen readers.
- Mobile and desktop navigation differ from the canonical product shell and expose different destination models.
- Repeated controls such as `ADD`, `CLAIM`, `Draft`, and position filters often depend on nearby visual context.
- Several competitive data grids/lists use visual `div`/`article` rows instead of semantic tables/lists.

## Findings

### BE-A11Y-001-01

- Severity: **Critical**
- Screen: Global authenticated shell
- Component: Repeated page navigation
- File path: `apps/web/app/components/BigExecAppHeader.tsx`, `apps/web/app/components/BigExecMobileNav.tsx`, `apps/web/app/leagues/[leagueId]/layout.tsx`, `apps/web/app/franchises/[franchiseId]/layout.tsx`, `apps/web/app/drafts/[draftId]/layout.tsx`, `apps/web/app/matchups/[matchupId]/layout.tsx`
- Observed failure: **PROVEN:** Authenticated layouts render repeated header/mobile navigation before page content, but no skip link or focus bypass exists.
- Expected accessible behavior: Keyboard and screen-reader users can skip repeated navigation and land at the main content or page heading.
- Proposed fix: Add a shared skip link and consistent landmark strategy in the authenticated layouts/root shell.
- Related WCAG: 2.4.1 Bypass Blocks, 2.4.3 Focus Order, 2.4.6 Headings and Labels.

### BE-A11Y-001-02

- Severity: **Critical**
- Screen: Global authenticated shell
- Component: Navigation architecture
- File path: `apps/web/app/components/BigExecAppHeader.tsx`, `apps/web/app/components/BigExecMobileNav.tsx`, `docs/UX_UI_PAGE_SPEC.md`
- Observed failure: **PROVEN:** The current code exposes desktop top navigation with `League HQ`, `Locker Room`, `Schedule`, `Trades`, `Players`; mobile exposes `Home`, `Team`, `Matchup`, `League`, `Players`. Canon requires `Front Office`, `Matchup`, `Locker Room`, `League`, `Stadium` in a persistent left-side model.
- Expected accessible behavior: Consistent destination names, order, active state, and navigation model across desktop/mobile.
- Proposed fix: Resolve the canonical shell mismatch before broad page remediation so assistive-tech instructions and focus behavior do not target a soon-to-change nav model.
- Related WCAG: 2.4.5 Multiple Ways, 2.4.6 Headings and Labels, 3.2.3 Consistent Navigation.

### BE-A11Y-001-03

- Severity: **Major**
- Screen: Mobile navigation
- Component: Primary mobile nav
- File path: `apps/web/app/components/BigExecMobileNav.tsx`
- Observed failure: **PROVEN:** Mobile nav items do not set `aria-current` for the active route. Disabled destinations render as `<span aria-disabled="true">`, which is not focusable and may not provide actionable context.
- Expected accessible behavior: Current destination is programmatically exposed; disabled destinations explain unavailable state or are omitted when not useful.
- Proposed fix: Add current-route detection and consistent active state; decide whether disabled destinations need a tooltip/help text or should be hidden from the navigation model.
- Related WCAG: 1.3.1 Info and Relationships, 2.4.4 Link Purpose, 2.4.7 Focus Visible.

### BE-A11Y-001-04

- Severity: **Critical**
- Screen: Global status/error handling
- Component: Query-string success/error notices
- File path: `apps/web/app/login/page.tsx`, `apps/web/app/leagues/[leagueId]/players/page.tsx`, `apps/web/app/matchups/[matchupId]/page.tsx`, `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`, `apps/web/app/leagues/[leagueId]/settings/roster-integrity/page.tsx`
- Observed failure: **PROVEN:** Pages use `role="alert"` and `role="status"` in places, but notices are rendered after redirects without shared focus management or guaranteed announcement timing.
- Expected accessible behavior: After a transaction or validation error, focus moves to or announces the status/error region reliably, while preserving page context.
- Proposed fix: Create a shared status/alert primitive with `tabIndex="-1"`, focus-on-load option, stable heading/text, and consistent `role`/`aria-live` behavior.
- Related WCAG: 3.3.1 Error Identification, 3.3.3 Error Suggestion, 4.1.3 Status Messages.

### BE-A11Y-001-05

- Severity: **Critical**
- Screen: Draft room
- Component: Draft countdown timer
- File path: `apps/web/app/drafts/[draftId]/DraftClock.tsx`
- Observed failure: **PROVEN:** `DraftClock` updates visible text every second inside `aria-live="polite"`.
- Expected accessible behavior: Timers provide meaningful updates without announcing every second and overwhelming screen-reader users.
- Proposed fix: Announce only threshold changes, status changes, and final expiration; keep visual second-by-second countdown separate from the live region.
- Related WCAG: 2.2.1 Timing Adjustable, 2.2.2 Pause Stop Hide, 4.1.3 Status Messages.

### BE-A11Y-001-06

- Severity: **Critical**
- Screen: Draft room
- Component: Realtime room refresh
- File path: `apps/web/app/drafts/[draftId]/DraftRoomLive.tsx`, `apps/web/app/drafts/[draftId]/page.tsx`
- Observed failure: **PROVEN:** Supabase realtime and polling call `router.refresh()` without an accessible announcement when the current pick, clock, queue, or drafted pool changes.
- Expected accessible behavior: Screen-reader users should be informed when the draft turn changes, their queue changes, or a pick is made.
- Proposed fix: Add a shared live-update announcer for draft events driven by authoritative state deltas, not DOM scraping.
- Related WCAG: 4.1.3 Status Messages, 2.2.1 Timing Adjustable.

### BE-A11Y-001-07

- Severity: **Critical**
- Screen: Draft room
- Component: Draft pick action
- File path: `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`, `apps/web/app/drafts/actions.ts`
- Observed failure: **PROVEN:** The `Draft` button submits directly to `makeDraftPick`. The backlog prohibits consequential beta transactions without explicit confirmation.
- Expected accessible behavior: Drafting requires an explicit, accessible confirmation that names the asset and consequences before calling `make_draft_pick`.
- Proposed fix: Add a shared consequential-action confirmation primitive before draft, waiver, lineup, and trade writes.
- Related WCAG: 3.3.4 Error Prevention, 2.4.6 Headings and Labels.

### BE-A11Y-001-08

- Severity: **Major**
- Screen: Draft room
- Component: Draft player results and queue
- File path: `apps/web/app/drafts/[draftId]/DraftPlayerPool.tsx`
- Observed failure: **PROVEN:** Ranked candidates and queued players are rendered as visual `article` rows without semantic list/table structure for rank, position, score, and available actions.
- Expected accessible behavior: Player pool and queue expose count, order/rank, player name, position, team, score, queued state, and available actions in a structured, navigable pattern.
- Proposed fix: Use semantic list/table patterns or an accessible collection primitive with row labels and grouped controls.
- Related WCAG: 1.3.1 Info and Relationships, 2.4.6 Headings and Labels.

### BE-A11Y-001-09

- Severity: **Critical**
- Screen: Player search / free agency / waivers
- Component: Add/claim disclosure controls
- File path: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Observed failure: **PROVEN:** Repeated `<summary>ADD</summary>` and `<summary>CLAIM</summary>` controls have generic accessible names that depend on nearby visual context.
- Expected accessible behavior: Each disclosure name identifies the player/team and action, e.g. "Add Jalen Doe" or "Claim Eagles defense on waivers."
- Proposed fix: Replace generic disclosure labels with asset-specific accessible labels or a shared transaction disclosure component.
- Related WCAG: 2.4.4 Link Purpose, 2.4.6 Headings and Labels, 3.3.2 Labels or Instructions.

### BE-A11Y-001-10

- Severity: **Major**
- Screen: Player search
- Component: Position filters
- File path: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Observed failure: **PROVEN:** Position filters are links whose selected state is only visual class styling; the container has `aria-label`, but active filter state is not programmatically exposed.
- Expected accessible behavior: Current filter is exposed with `aria-current`, `aria-pressed`, or a semantic tabs/radio pattern.
- Proposed fix: Convert filters to a shared segmented-control/tab pattern or add `aria-current` to active links.
- Related WCAG: 1.3.1 Info and Relationships, 1.4.1 Use of Color, 2.4.7 Focus Visible.

### BE-A11Y-001-11

- Severity: **Critical**
- Screen: Waiver/free agents
- Component: Free-agent add and waiver claim forms
- File path: `apps/web/app/leagues/[leagueId]/players/page.tsx`, `apps/web/app/leagues/[leagueId]/players/actions.ts`
- Observed failure: **PROVEN:** `Confirm Add` and `Submit Waiver Claim` forms call consequential roster transaction RPCs directly from page disclosures, with no separate confirmation review of add/drop asset pair.
- Expected accessible behavior: Users confirm the exact add/claim asset and optional/required drop asset before submission.
- Proposed fix: Add a shared roster-transaction confirmation step using canonical RPCs `claim_free_agent` and `submit_waiver_claim`.
- Related WCAG: 3.3.4 Error Prevention, 3.3.2 Labels or Instructions.

### BE-A11Y-001-12

- Severity: **Major**
- Screen: Waivers
- Component: Waiver timing
- File path: `apps/web/app/leagues/[leagueId]/players/page.tsx`
- Observed failure: **PROVEN:** Waiver clear time is formatted as plain text in all-caps row metadata.
- Expected accessible behavior: Waiver clear time should use semantic `<time dateTime>` and include timezone/meaning in accessible text.
- Proposed fix: Add a shared date/time display component for draft times, waiver clear times, deadlines, and matchups.
- Related WCAG: 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions.

### BE-A11Y-001-13

- Severity: **Critical**
- Screen: Roster / lineup
- Component: Lineup slot controls
- File path: `apps/web/app/franchises/[franchiseId]/team/page.tsx`, `apps/web/app/team/actions.ts`
- Observed failure: **PROVEN:** Each eligible roster asset is rendered as a button named only by the asset label inside a slot. The button name does not include the target slot, current starter state, or transaction consequence.
- Expected accessible behavior: Screen-reader users hear "Start [player] at [slot]" and understand whether the slot currently has another player.
- Proposed fix: Add slot-specific accessible labels and a shared lineup control that exposes selected/current state.
- Related WCAG: 2.4.6 Headings and Labels, 3.3.2 Labels or Instructions.

### BE-A11Y-001-14

- Severity: **Critical**
- Screen: Lineup
- Component: Lineup set action
- File path: `apps/web/app/franchises/[franchiseId]/team/page.tsx`, `apps/web/app/team/actions.ts`
- Observed failure: **PROVEN:** Starter changes call `set_lineup_slot` immediately. There is no confirmation or post-action focus return to the changed slot.
- Expected accessible behavior: Lineup changes should either be reversible/clearly confirmed or require accessible confirmation, then focus should return to the updated slot/status.
- Proposed fix: Use a shared transaction-status and focus-return pattern; consider confirmation for high-risk locked/near-lock lineup moves.
- Related WCAG: 3.3.4 Error Prevention, 2.4.3 Focus Order, 4.1.3 Status Messages.

### BE-A11Y-001-15

- Severity: **Major**
- Screen: Roster / lineup
- Component: Horizontal slot choice rail
- File path: `apps/web/app/franchises/[franchiseId]/team/page.tsx`, `apps/web/app/globals.css`
- Observed failure: **PROVEN:** `.slotChoices` is a horizontally scrollable row of controls. There is no visible or programmatic indication of overflow, collection size, or keyboard guidance.
- Expected accessible behavior: All eligible choices are reachable and understandable with keyboard/screen reader, with no hidden interaction requirement.
- Proposed fix: Replace horizontal overflow with an accessible listbox/radio-group/select pattern or add clear structured collection semantics.
- Related WCAG: 2.1.1 Keyboard, 1.3.1 Info and Relationships, 2.4.7 Focus Visible.

### BE-A11Y-001-16

- Severity: **Major**
- Screen: Matchup
- Component: Scoreboard
- File path: `apps/web/app/matchups/[matchupId]/page.tsx`
- Observed failure: **PROVEN:** The visual scoreboard is built from generic `div`, `span`, `strong`, and `b` elements. The accessible reading order may not communicate "home team score versus away team score" as a coherent score summary.
- Expected accessible behavior: Scoreboard has a labelled region or heading and a concise accessible summary of teams, scores, week, state, and winner/final status.
- Proposed fix: Add a semantic matchup summary region and structured score rows.
- Related WCAG: 1.3.1 Info and Relationships, 2.4.6 Headings and Labels.

### BE-A11Y-001-17

- Severity: **Major**
- Screen: Matchup
- Component: Head-to-head lineup comparison
- File path: `apps/web/app/matchups/[matchupId]/page.tsx`
- Observed failure: **PROVEN:** Head-to-head lineup rows use visual columns and abbreviations without table semantics or row/column headers.
- Expected accessible behavior: Users can navigate by slot and understand each side's player and points with headers.
- Proposed fix: Convert to an accessible comparison table or labelled list rows with explicit home/away labels.
- Related WCAG: 1.3.1 Info and Relationships.

### BE-A11Y-001-18

- Severity: **Critical**
- Screen: League chat / Locker Room
- Component: Realtime conversation refresh
- File path: `apps/web/app/leagues/[leagueId]/locker-room/LockerRoomLive.tsx`, `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- Observed failure: **PROVEN:** Realtime/polling refreshes the page and auto-scrolls to latest messages, while `.lockerMessages` is `aria-live="polite"` around the entire message list.
- Expected accessible behavior: New messages are announced once, focus is not stolen, user scroll position is respected, and only the new message/status is in the live region.
- Proposed fix: Add a chat-specific live announcer and unread/new-message state; avoid whole-list live regions.
- Related WCAG: 2.2.2 Pause Stop Hide, 2.4.3 Focus Order, 4.1.3 Status Messages.

### BE-A11Y-001-19

- Severity: **Major**
- Screen: League chat / Locker Room
- Component: Reaction controls
- File path: `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
- Observed failure: **PROVEN:** Reaction buttons are labelled by emoji plus count, e.g. the emoji itself is part of the accessible name. Names may not describe reaction meaning consistently across platforms.
- Expected accessible behavior: Reaction names use human-readable labels and expose pressed state/count.
- Proposed fix: Map each reaction to text labels such as "fire", "laugh", "eyes", "applause", and "trophy" in `aria-label`.
- Related WCAG: 1.1.1 Non-text Content, 2.4.6 Headings and Labels.

### BE-A11Y-001-20

- Severity: **Major**
- Screen: Standings
- Component: Standings list
- File path: `apps/web/app/leagues/[leagueId]/page.tsx`, `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
- Observed failure: **PROVEN:** Standings are visual rows built from `div`, `b`, `span`, and `small`, not a semantic table/list with headers for rank, franchise, record, PF, PA, or streak.
- Expected accessible behavior: Standings expose rank and columns in a navigable semantic table or explicitly labelled list rows.
- Proposed fix: Add an accessible standings table/list component reused on League HQ and Schedule pages.
- Related WCAG: 1.3.1 Info and Relationships.

### BE-A11Y-001-21

- Severity: **Major**
- Screen: Schedule / postseason / standings
- Component: Commissioner action buttons
- File path: `apps/web/app/leagues/[leagueId]/schedule/page.tsx`, `apps/web/app/leagues/actions.ts`
- Observed failure: **PROVEN:** Buttons such as `Generate`, `Lock Seeds + Build Week 15`, `Build Semifinals`, `Build Finals`, and `Close Season` trigger consequential league state changes without a shared confirmation pattern.
- Expected accessible behavior: Commissioner-only consequential actions require confirmation that names the phase and effect.
- Proposed fix: Reuse the shared consequential-action confirmation primitive.
- Related WCAG: 3.3.4 Error Prevention.

### BE-A11Y-001-22

- Severity: **Critical**
- Screen: Trade center / private trade room
- Component: Trade proposal and accept/reject/cancel actions
- File path: `apps/web/app/leagues/[leagueId]/trades/page.tsx`, `apps/web/app/trades/[tradeId]/page.tsx`, `apps/web/app/social/actions.ts`
- Observed failure: **PROVEN:** Trade proposal and resolution forms call `create_trade_proposal` and `resolve_trade` without a shared accessible confirmation/review step.
- Expected accessible behavior: Trade creation and acceptance present a structured deal sheet and explicit confirmation before roster ownership changes.
- Proposed fix: Add confirmation dialogs/pages using existing trade RPCs.
- Related WCAG: 3.3.4 Error Prevention, 3.3.2 Labels or Instructions.

### BE-A11Y-001-23

- Severity: **Major**
- Screen: Trade center
- Component: Asset selects
- File path: `apps/web/app/leagues/[leagueId]/trades/page.tsx`
- Observed failure: **PROVEN:** Trade asset selection uses native selects with labels `You send` and `You receive`, but options do not include current owner/franchise context beyond form grouping.
- Expected accessible behavior: Each option should be understandable out of visual context, especially when screen readers open the native select.
- Proposed fix: Include franchise context in option labels or provide grouped/labelled trade-asset selectors.
- Related WCAG: 3.3.2 Labels or Instructions, 2.4.6 Headings and Labels.

### BE-A11Y-001-24

- Severity: **Major**
- Screen: Notifications
- Component: In-page notices and email notifications
- File path: `apps/web/lib/email/resend.ts`, `apps/web/lib/email/templates.ts`, `apps/web/app/leagues/actions.ts`, page files using `successNotice`/`errorNotice`
- Observed failure: **PROVEN:** There is no dedicated in-app notification surface. Email templates exist, but only league invite sending is proven wired in inspected code. In-page notices are route-local and not centrally managed.
- Expected accessible behavior: Notifications that matter to gameplay should be reviewable, announced appropriately, and not only transient route messages.
- Proposed fix: Define notification architecture before accessibility remediation for "review notification" tasks; centralize status/notice rendering immediately for existing route messages.
- Related WCAG: 4.1.3 Status Messages, 3.3.1 Error Identification.

### BE-A11Y-001-25

- Severity: **Major**
- Screen: Sign-in
- Component: Auth form errors and account state
- File path: `apps/web/app/login/page.tsx`, `apps/web/app/auth/actions.ts`
- Observed failure: **PROVEN:** Form fields have labels and auth errors render as alerts, but field-specific validation state is not connected with `aria-invalid`/field-level error IDs.
- Expected accessible behavior: Invalid fields expose invalid state and reference field-specific error/help text.
- Proposed fix: Add shared form field/error primitive; preserve current friendly auth error mapping.
- Related WCAG: 3.3.1 Error Identification, 3.3.2 Labels or Instructions, 3.3.3 Error Suggestion.

### BE-A11Y-001-26

- Severity: **Minor**
- Screen: Sign-in / public home
- Component: Decorative and branding visuals
- File path: `apps/web/app/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/components/BigExecBrand.tsx`
- Observed failure: **LIKELY / INFERRED:** Several visual hero elements are decorative and hidden correctly in places, but public/home hero copy contains visual layout affordances that were not tested under high text scaling.
- Expected accessible behavior: Text scaling to 200% preserves reading order, visible focus, and no overlap.
- Proposed fix: Include sign-in/public home in BE-A11Y-002 text-scaling test matrix.
- Related WCAG: 1.4.4 Resize Text, 1.4.10 Reflow.

### BE-A11Y-001-27

- Severity: **Major**
- Screen: Roster Integrity settings
- Component: Checkbox labels and pending review controls
- File path: `apps/web/app/leagues/[leagueId]/settings/roster-integrity/page.tsx`
- Observed failure: **PROVEN:** Settings use long label text and pending-review approve/reject buttons in the same form. The decision note is generic and not associated with the approve/reject decision context.
- Expected accessible behavior: Commissioner controls expose clear group labels, setting descriptions, and review-specific action names.
- Proposed fix: Group settings with fieldsets/legends and make approve/reject button labels include the franchise/asset.
- Related WCAG: 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions.

### BE-A11Y-001-28

- Severity: **Major**
- Screen: Stadium / legacy
- Component: Stadium visual and unlocked features
- File path: `apps/web/app/franchises/[franchiseId]/stadium/page.tsx`
- Observed failure: **PROVEN:** The stadium scene contains decorative hidden field visuals and a labelled banner rail, but earned features are visually displayed as spans and are not structured as a list with unlock meaning.
- Expected accessible behavior: Stadium achievements/features should be announced as a named list with feature names, zones, and unlocked state.
- Proposed fix: Add a semantic earned-features list while keeping visual stadium art decorative where appropriate.
- Related WCAG: 1.1.1 Non-text Content, 1.3.1 Info and Relationships.

### BE-A11Y-001-29

- Severity: **Critical**
- Screen: Current Assistant GM / AI postgame talk
- Component: Generated message choices
- File path: `apps/web/app/matchups/[matchupId]/page.tsx`, `apps/web/app/matchups/actions.ts`
- Observed failure: **PROVEN:** Generated postgame lines can be edited and posted, but there is no centralized AI output review pattern or accessible confirmation before posting to Locker Room.
- Expected accessible behavior: AI-generated content is clearly identified, editable, and confirmed before public posting, with deterministic facts preserved.
- Proposed fix: Build a shared AI suggestion review component before expanding to Assistant GM.
- Related WCAG: 3.3.4 Error Prevention, 3.3.2 Labels or Instructions.

### BE-A11Y-001-30

- Severity: **Critical**
- Screen: All core gameplay screens
- Component: Automated accessibility coverage
- File path: `package.json`, `playwright.config.ts`, `tests/e2e/big-exec-qa.spec.ts`, `.github/workflows/ci.yml`
- Observed failure: **PROVEN:** No axe/jest-axe/Playwright accessibility-tree assertions or dedicated accessibility CI step were found.
- Expected accessible behavior: Core routes have automated accessibility checks plus manual VoiceOver/TalkBack QA for critical flows.
- Proposed fix: Add an accessibility QA matrix first, then introduce automated checks in BE-A11Y-003/M3 without replacing assistive-tech testing.
- Related WCAG: Process/control gap; supports WCAG 2.2 AA-oriented release assurance.

## Screen Coverage Matrix

| Core screen | Current files inspected | Key baseline risk |
|---|---|---|
| Sign-in | `apps/web/app/login/page.tsx`, `apps/web/app/auth/actions.ts` | Field errors/status focus are not centralized. |
| League home / Front Office | `apps/web/app/dashboard/page.tsx` | No skip link; status and nav consistency gaps. |
| Roster | `apps/web/app/franchises/[franchiseId]/team/page.tsx` | Roster data is visual-list based; transaction/focus state not centralized. |
| Lineup | `apps/web/app/franchises/[franchiseId]/team/page.tsx`, `apps/web/app/team/actions.ts` | Slot controls lack slot-specific accessible action names and confirmation/focus return. |
| Player search | `apps/web/app/leagues/[leagueId]/players/page.tsx` | Filter state and repeated add controls are not sufficiently programmatic. |
| Waiver/free agents | `apps/web/app/leagues/[leagueId]/players/page.tsx`, `apps/web/app/leagues/[leagueId]/players/actions.ts` | Generic claim controls and no confirmation review for add/drop. |
| Draft room | `apps/web/app/drafts/[draftId]/*`, `apps/web/app/drafts/actions.ts` | Timer/live updates and draft action confirmation are critical risks. |
| Matchup | `apps/web/app/matchups/[matchupId]/page.tsx`, `apps/web/app/matchups/actions.ts` | Scoreboard/comparison semantics and AI post flow need structure. |
| Standings | `apps/web/app/leagues/[leagueId]/page.tsx`, `apps/web/app/leagues/[leagueId]/schedule/page.tsx` | Standings are visual rows instead of semantic data structure. |
| League chat | `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`, `LockerRoomLive.tsx`, `apps/web/app/social/actions.ts` | Whole-list live region and auto-scroll behavior risk confusing AT users. |
| Notifications | `apps/web/lib/email/*`, page notices | No dedicated in-app notification surface; status messages are route-local. |

## Remediation Order Recommendation

1. Create an accessibility QA matrix before code remediation.
2. Resolve or explicitly stage the canonical navigation-shell mismatch.
3. Add shared primitives for skip link, status/alert, accessible action confirmation, segmented controls, timer announcements, and structured data lists/tables.
4. Apply primitives to highest-risk consequential flows: draft pick, waiver/add-drop, lineup set, trade accept, commissioner season actions.
5. Add automated accessibility checks to CI after primitives exist.
6. Only then expand Assistant GM/Voice GM work, using authoritative Supabase state and existing RPCs.

## Tests / Commands

Commands run for this audit:

- `sed` reads of backlog, repo inventory, app routes/actions, styles, and docs.
- `rg` searches for accessibility, feature-flag, notification, AI, voice, analytics, and test coverage terms.
- `find`/`git status` inspection of repo structure and existing QA artifacts.

Tests not run:

- No Playwright browser run.
- No VoiceOver/TalkBack session.
- No axe/accessibility-tree run, because no accessibility test harness currently exists and this task is audit-only.

## Known Limitations

- This is a code/static baseline, not a device assistive-technology certification.
- Severity reflects beta core-task risk from verified implementation patterns.
- Some database functions used by app code are not fully defined in checked-in migrations because production schema history is known to exceed local migrations; this audit does not infer missing database behavior beyond file evidence.
- No production data or live user flow was modified.
