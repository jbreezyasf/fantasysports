# Chaos Week rule cards: visual verification, 2026-10-04

## Scope and provenance

The real `matchups/[matchupId]/page.tsx` and `franchises/[franchiseId]/team/page.tsx` components, rendered by `scripts/qa-chaos-cards.cjs` with the app's stylesheets and a stub database client holding synthetic league, roster and score rows. Player and team names are invented. The server action is stubbed, so nothing was submitted anywhere. This is not an app route, not an authentication bypass, and not a production or preview check. The pages were server-rendered only: client hydration, the Spanish locale switch and the live-region announcement were **not** exercised here (they are covered by unit tests, not by a browser).

## Executed results (PROVEN, this harness, Chromium 1194)

Re-run on 2026-10-04 after the automatic captain and Bounty changes, with three states added: the lineup page before a captain is named ("If you do not choose, your captain will be ..."), the matchup page with both automatic captains pending, and a final Bounty game won by the higher seed. The automatic captain shown is a fixed stand-in for the `chaos_auto_captain` database reply; the ranking itself is tested in `supabase/tests/chaos_week_rule_cards.sql`, not here.

A second re-run on 2026-10-04 followed the "captain locks at kickoff" change and added the lineup page with a locked automatic captain (no choose control).

A third re-run on 2026-10-04 followed the owner's third round of decisions (automatic Wild Slot and raid, void selections, the raid penalty). Eight states were added and every state was rendered again: the Wild Slot lineup page with the automatic pick shown, with a void pick, and with the automatic pick locked; the matchup page with a void Wild Slot pick and both automatic picks; the raid lineup page of the lower seed with a void raid, with the penalty picker (exactly one starter offered), and after the system made the raid; the higher seed's lineup page after a penalty raid; and the matchup page with an automatic penalty raid on the score build-up. The automatic selections shown are fixed stand-ins for the `chaos_auto_pick` database reply; the ranking, the locks and the void rule are tested in `supabase/tests/chaos_week_rule_cards.sql`, not here. "Opt-in off" has no state of its own: with no deal the pages render nothing, which is the "flag on, no deal" state below.

Numbers of the third run (all states, not only the new ones):

- 19 card states at 1440 px and 390 px (38 renders): exactly one card panel each; axe `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`: **0 violations** on the whole page in all 38. This is not a blanket accessibility certification.
- Target size: every link, button and choice label inside the card is at least 44 by 44 CSS px in all 38.
- No element of the card extends past the viewport in any render.
- Keyboard (14 renders with a choice list): Tab reaches the first choice, Arrow Down selects the next one (with the penalty picker's single choice, it stays selected), Tab reaches the submit button; the focused choice has a 3 px solid outline.
- Reduced motion (390 px, `prefers-reduced-motion: reduce`, 19 renders): 0 animated or transitioning elements inside the card.
- Inert states (4 states, 12 renders): with `CHAOS_CARDS_ENABLED` unset, and with it on but no card dealt, neither page contains a card panel or any card text.

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
- [Wild Slot: a void pick on one side, both automatic picks pending, "Automatic Wild Slot player" on the build-up, desktop](matchup-wild-slot-auto-1440.webp) · [phone](matchup-wild-slot-auto-390.webp)
- [Raid: the automatic penalty raid made by the system, the penalty explanation, "Automatic penalty raid" on the build-up, desktop](matchup-raid-auto-penalty-1440.webp) · [phone](matchup-raid-auto-penalty-390.webp)

Lineup page selection controls:

- [Captain not named yet, with the automatic captain notice, desktop](lineup-captain-auto-1440.webp) · [phone](lineup-captain-auto-390.webp) · keyboard focus: [desktop](lineup-captain-auto-1440-keyboard-focus.webp), [phone](lineup-captain-auto-390-keyboard-focus.webp)
- [Automatic captain locked at kickoff, no choose control, desktop](lineup-captain-auto-locked-1440.webp) · [phone](lineup-captain-auto-locked-390.webp)
- [Captain named, desktop](lineup-captain-1440.webp) · [phone](lineup-captain-390.webp) · keyboard focus: [desktop](lineup-captain-1440-keyboard-focus.webp), [phone](lineup-captain-390-keyboard-focus.webp)
- [Wild Slot not named yet: "If you do not choose, the system will pick ...", desktop](lineup-wild-slot-1440.webp) · [phone](lineup-wild-slot-390.webp) · keyboard focus: [desktop](lineup-wild-slot-1440-keyboard-focus.webp), [phone](lineup-wild-slot-390-keyboard-focus.webp)
- [Wild Slot: the named player left the roster, shown as void, choose again, desktop](lineup-wild-slot-void-1440.webp) · [phone](lineup-wild-slot-void-390.webp) · keyboard focus: [desktop](lineup-wild-slot-void-1440-keyboard-focus.webp), [phone](lineup-wild-slot-void-390-keyboard-focus.webp)
- [Wild Slot: automatic pick locked at kickoff, no choose control, desktop](lineup-wild-slot-auto-locked-1440.webp) · [phone](lineup-wild-slot-auto-locked-390.webp)
- [Raid picker, lower seed, with the raid the system would make, desktop](lineup-raid-lower-seed-1440.webp) · [phone](lineup-raid-lower-seed-390.webp) · keyboard focus: [desktop](lineup-raid-lower-seed-1440-keyboard-focus.webp), [phone](lineup-raid-lower-seed-390-keyboard-focus.webp)
- [Raid, lower seed: the raided player was dropped, the raid is void, choose again, desktop](lineup-raid-void-1440.webp) · [phone](lineup-raid-void-390.webp) · keyboard focus: [desktop](lineup-raid-void-1440-keyboard-focus.webp), [phone](lineup-raid-void-390-keyboard-focus.webp)
- [Raid penalty, lower seed: exactly one starter offered, with the reason, desktop](lineup-raid-penalty-1440.webp) · [phone](lineup-raid-penalty-390.webp) · keyboard focus: [desktop](lineup-raid-penalty-1440-keyboard-focus.webp), [phone](lineup-raid-penalty-390-keyboard-focus.webp)
- [Raid, lower seed, after the deadline: the system's raid, no choose control, desktop](lineup-raid-auto-locked-1440.webp) · [phone](lineup-raid-auto-locked-390.webp)
- [Raid, higher seed with a raided player, desktop](lineup-raid-higher-seed-1440.webp) · [phone](lineup-raid-higher-seed-390.webp)
- [Raid penalty, higher seed: its starter was taken and still scores for it, desktop](lineup-raid-higher-seed-penalty-1440.webp) · [phone](lineup-raid-higher-seed-penalty-390.webp)

All 52 images were regenerated in the third run on 2026-10-04 (the Wild Slot and Raid rules text on the card changed, so every Wild Slot and Raid image differs from the earlier one; the Captain, Bounty and twist images show the same content as before).

Measurements for every render: [layout-checks.json](layout-checks.json).
