# Chaos Week rule cards: visual verification, 2026-10-04

## Scope and provenance

The real `matchups/[matchupId]/page.tsx` and `franchises/[franchiseId]/team/page.tsx` components, rendered by `scripts/qa-chaos-cards.cjs` with the app's stylesheets and a stub database client holding synthetic league, roster and score rows. Player and team names are invented. The server action is stubbed, so nothing was submitted anywhere. This is not an app route, not an authentication bypass, and not a production or preview check. The pages were server-rendered only: client hydration, the Spanish locale switch and the live-region announcement were **not** exercised here (they are covered by unit tests, not by a browser).

## Executed results (PROVEN, this harness, Chromium 1194)

Re-run on 2026-10-04 after the automatic captain and Bounty changes, with three states added: the lineup page before a captain is named ("If you do not choose, your captain will be ..."), the matchup page with both automatic captains pending, and a final Bounty game won by the higher seed. The automatic captain shown is a fixed stand-in for the `chaos_auto_captain` database reply; the ranking itself is tested in `supabase/tests/chaos_week_rule_cards.sql`, not here.

A second re-run on 2026-10-04 followed the "captain locks at kickoff" change and added the lineup page with a locked automatic captain (no choose control).

- 11 card states at 1440 px and 390 px (22 renders): exactly one card panel each; axe `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`: **0 violations** on the whole page in all 22. This is not a blanket accessibility certification.
- Target size: every link, button and choice label inside the card is at least 44 by 44 CSS px in all 22.
- No element of the card extends past the viewport in any render.
- Keyboard (8 renders with a choice list): Tab reaches the first choice, Arrow Down selects the next one, Tab reaches the submit button; the focused choice has a 3 px solid outline.
- Reduced motion (390 px, `prefers-reduced-motion: reduce`): 0 animated or transitioning elements inside the card.
- Inert states (8 renders): with `CHAOS_CARDS_ENABLED` unset, and with it on but no card dealt, neither page contains a card panel or any card text.

## Found, not caused by this work

- The team page overflows horizontally at 390 px in this harness **with the flag off as well** (`.franchiseNav`, `.franchiseStadiumHero`). No card element is among the offenders. UNVERIFIED whether production shows it; the harness has no app shell around the page.

## Limits

Synthetic data and stubbed mutations. No database was involved in these renders; the database rules are tested separately in `supabase/tests/chaos_week_rule_cards.sql`. Nothing here is evidence for a product gate.

## Reproduce

`node scripts/qa-chaos-cards.cjs` (set `QA_BROWSER_EXECUTABLE=/path/to/chrome` when the installed Playwright expects a different Chromium build). Exit status is nonzero for a missing or extra panel, card overflow, a small target, an axe violation, a failed keyboard step, motion under reduced-motion, or any card text in an inert state. It writes PNG files; the committed images were converted to WebP.

## Screenshots (synthetic data)

Matchup page card:

- [Captain, one named captain locked, the other side's automatic captain locked at kickoff, desktop](matchup-captain-1440.webp) · [phone](matchup-captain-390.webp)
- [Captain, nobody named yet, both automatic captains pending, desktop](matchup-captain-auto-pending-1440.webp) · [phone](matchup-captain-auto-pending-390.webp)
- [Bounty, final, won by the higher seed, desktop](matchup-bounty-final-1440.webp) · [phone](matchup-bounty-final-390.webp)
- [Raid made, desktop](matchup-raid-1440.webp) · [phone](matchup-raid-390.webp)
- [Scoring twist, final, desktop](matchup-twist-final-1440.webp) · [phone](matchup-twist-final-390.webp)

Lineup page selection controls:

- [Captain not named yet, with the automatic captain notice, desktop](lineup-captain-auto-1440.webp) · [phone](lineup-captain-auto-390.webp) · keyboard focus: [desktop](lineup-captain-auto-1440-keyboard-focus.webp), [phone](lineup-captain-auto-390-keyboard-focus.webp)
- [Automatic captain locked at kickoff, no choose control, desktop](lineup-captain-auto-locked-1440.webp) · [phone](lineup-captain-auto-locked-390.webp)
- [Captain named, desktop](lineup-captain-1440.webp) · [phone](lineup-captain-390.webp) · keyboard focus: [desktop](lineup-captain-1440-keyboard-focus.webp), [phone](lineup-captain-390-keyboard-focus.webp)
- [Wild Slot, desktop](lineup-wild-slot-1440.webp) · [phone](lineup-wild-slot-390.webp) · keyboard focus: [desktop](lineup-wild-slot-1440-keyboard-focus.webp), [phone](lineup-wild-slot-390-keyboard-focus.webp)
- [Raid picker, lower seed, desktop](lineup-raid-lower-seed-1440.webp) · [phone](lineup-raid-lower-seed-390.webp) · keyboard focus: [desktop](lineup-raid-lower-seed-1440-keyboard-focus.webp), [phone](lineup-raid-lower-seed-390-keyboard-focus.webp)
- [Raid, higher seed with a raided player, desktop](lineup-raid-higher-seed-1440.webp) · [phone](lineup-raid-higher-seed-390.webp)

The Captain and Bounty images were regenerated on 2026-10-04. The Wild Slot, Raid and scoring-twist images are the earlier ones: those states were rendered and checked again in this run, and their images were not replaced.

Measurements for every render: [layout-checks.json](layout-checks.json).
