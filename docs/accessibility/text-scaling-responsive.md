# BE-A11Y-014 Text Scaling and Responsive Accessibility

Date: 2026-08-31

Status: Implemented in shared CSS; device-matrix verification remains pending.

## Objective

Large text must not block core fantasy workflows. Essential manager actions should remain visible and operable when text wraps, including roster, lineup, player search, waivers, draft, matchup, standings, league chat, and trade surfaces.

## Files Updated

- `apps/web/app/gate5.css`

## Covered Surfaces

- `apps/web/app/franchises/[franchiseId]/team/page.tsx`
  - Lineup slots now have wrapping, one-column fallback behavior.
  - Slot-choice action buttons can wrap without clipping player names.
  - Bench and roster rows allow long player/team names to wrap.

- `apps/web/app/leagues/[leagueId]/players/page.tsx`
  - Player rows, waiver rows, free-agent action summaries, status badges, and add/drop controls can wrap.
  - Narrow screens use full-width action controls where needed.

- `apps/web/app/drafts/[draftId]/page.tsx`
  - Draft queue rows and draft candidate rows can wrap instead of truncating names.
  - Pick/queue action buttons keep minimum touch size but can grow for larger text.

- `apps/web/app/matchups/[matchupId]/page.tsx`
  - Scoreboard action buttons, matchup battle rows, and team/player names can reflow on narrow or large-text layouts.

- `apps/web/app/leagues/[leagueId]/schedule/page.tsx`
  - Standings and schedule rows can stack into readable columns.
  - Commissioner schedule-generation actions can wrap without hiding buttons.

- `apps/web/app/leagues/[leagueId]/locker-room/page.tsx`
  - Message bodies already used `overflow-wrap:anywhere`.
  - Composer now falls back to a single-column layout for large-text/narrow layouts.
  - Reaction controls can wrap labels and counts.

- `apps/web/app/leagues/[leagueId]/trades/page.tsx`
- `apps/web/app/trades/[tradeId]/page.tsx`
  - Shared `weekCard`, `playerRow`, `actions`, and form rules apply to trade proposal/decision surfaces.

## Implementation Notes

- The change is additive CSS only; no fantasy data flow, rule validation, or transaction logic changed.
- The implementation removes forced single-line clipping from shared row title patterns by overriding `white-space`, `overflow`, and `text-overflow` on player, draft, standings, schedule, and matchup labels.
- Fixed-width action columns in draft and lineup surfaces now use `minmax(..., auto)` or stack at narrow widths.
- At very narrow widths, action groups become single-column so buttons and links remain visible and tappable.
- Existing horizontal rails remain available for normal mobile layouts, but the smallest breakpoint allows filter rails and meta rows to wrap when horizontal interaction becomes hostile to large text.

## Remaining Verification

Record results in `docs/accessibility/test-matrix.md` when device testing is available:

- iOS VoiceOver with large text.
- iOS Screen Curtain with large text.
- Android TalkBack with font/display scaling.
- Desktop browser zoom at 200%.
- Keyboard-only pass through roster, lineup, waivers, draft, matchup, standings, chat, and invitations.

## Known Exceptions

No third-party controls were found in these core workflow surfaces for BE-A11Y-014. The current exceptions are unverified device behavior rather than known blocking third-party controls.
