# Chaos Week Rule Cards

**Status 2026-10-04:** built on branch `feat/chaos-week-rule-cards`. Migration written, **not applied**. Flag `CHAOS_CARDS_ENABLED` is **off**. No league season is opted in. Nothing here is live for any league.

**Owner decisions this implements (2026-10-04, fixed):** one rule card per Chaos Week matchup, both managers of a game play under it; the deck holds Captain, Wild Slot, Raid, Bounty and scoring twists; only the lower seed raids, and only from the opponent's bench; Chaos Week has full stakes.

**Owner decisions confirmed on 2026-10-04 (second round):**

| Decision | State |
|---|---|
| The Chaos Clause compares the **base lineup total**, before the card is applied. | Confirmed. Already built. |
| A raid is final once made. Its deadline is the first Week 13 kickoff. | Confirmed. Already built. |
| Selections are visible to both managers as soon as they are made, and lock at that player's kickoff. There is no in-game lock. | Confirmed. Already built. |
| Cards are dealt automatically as soon as Week 12 closes, and revealed when dealt. | Confirmed. Already built. |
| **Automatic captain.** A manager under Captain who names nobody gets a captain chosen automatically. | New. Built: section 1 "Captain", section 4 "The automatic captain". |
| **The captain locks at kickoff, named or automatic.** Once the automatic captain's game has kicked off, the captain is fixed for the week and nobody can be named. The locked automatic captain is recorded. | Decided after the first build of the automatic captain, to close a hindsight loophole. Built: section 4. |
| **The automatic rule skips a starter whose Week 13 game is postponed or canceled.** A named captain in that situation is still honoured. | Decided with the lock. Built: section 4. |
| **Bounty** replaces Upset Bounty and rewards whoever wins. | New. Built: section 1 "Bounty", section 4 "The Bounty waiver order". |
| **Deal deadline alert** in the weekly job, and a way for an operator to deal by hand. | New. Built: section 5. |
| A starting kicker or D/ST can be captain. | Treated as settled: the automatic-captain instruction says they are eligible "exactly as for a named captain". |

**Owner decisions of 2026-10-04 (third round):**

| # | Decision | State |
|---|---|---|
| 1 | **The Bounty window is Week 14 only.** | Decided. Already built: a grant runs from the game going final to the last Week 14 kickoff. A test now pins that a grant is ignored in Week 15 (section 4, "The Bounty waiver order"). |
| 2 | **The twist sizes are final as built:** TE x2, K x3, D/ST x2, rushing x2, passing x2, fumbles lost x3. | Decided. No change. |
| 3 | **No trades after the trade deadline.** Trade logic is not changed. | Decided. Checked against production on 2026-10-04: section 4, "Trades and the trade deadline". |
| 4 | **Dropped selections.** If the player a manager named for Wild Slot, or the player taken in a raid, is dropped (or otherwise leaves the roster he was chosen from) before that player's game has kicked off, the selection is void. The manager may choose again under the normal rules; if they do not, the system chooses the best option available. | Decided. Built: sections 1, 2 and 4 ("Void selections"). |
| 5 | **Automatic Wild Slot and automatic raid**, in the spirit of the automatic captain and ranked by the same function. Wild Slot: the best-ranked active-roster player who is not starting, locked in kickoff order like the automatic captain; no eligible non-starter means no bonus. Raid: still final once made, deadline still the first Week 13 kickoff; with no raid at the deadline the system raids the best-ranked player on the higher seed's bench as it stands then. | Decided. Built: sections 1 and 4 ("The automatic Wild Slot and the automatic raid"). |
| 5a | **Raid penalty.** If the higher seed has no eligible bench player when the raid is made or auto-made, the raid takes the higher seed's best-ranked starter instead, and the manual picker offers exactly that starter and says why. | Decided. Built. **How hard the penalty hits is not decided**: section 6, item 1. |
| 5b | A raided player dropped by the lender after the raid and before his kickoff makes the raid void. Until the deadline the raider chooses again from the lender's bench as it then stands; after the deadline the automatic rule, penalty included, applies at once. | Decided. Built. |
| 6 | **League scope.** For this test season only the Stress Test 2026 league gets cards. A per-league-season opt-in is required in addition to the flag; the migration opts nobody in; the deal deadline alert fires only for opted-in league seasons. | Decided. Built: `league_seasons.chaos_cards_enabled`, section 5. |

**Found and closed while building the third round (2026-10-04).** The automatic captain could be gamed with hindsight in two ways: benching (or dropping) a better-ranked starter who plays later, or clearing a named captain, *after* an earlier game had been played, made that earlier game's starter the automatic captain after the fact. PROVEN on the previous build (both cases reproduced against the committed migration) and PROVEN closed in this one (section 4, "No hindsight: the evaluation mark"). The same protection covers the automatic Wild Slot. This also closes the gap that was item 1 of "Decisions needed". The owner has not been asked about this change; it is listed in section 6, item 3, for confirmation.

Evidence labels follow `AGENTS.md`. **PROVEN (test)** means executed in `supabase/tests/chaos_week_rule_cards.sql` on a local Postgres 16 with synthetic data, or in the unit tests named. Nothing in this document has run in production.

---

## 1. The rules, as managers should read them

Week 13 is Chaos Week: 1 plays 10, 2 plays 9, 3 plays 8, 4 plays 7, 5 plays 6, using the standings after Week 12.

This season each of the five Chaos Week games is dealt one **rule card**. Both teams in a game play under the same card. The five games get five different cards. (In the 2026 test season only leagues that have been opted in get cards: section 5.)

- The cards are dealt by Big Exec when the Chaos Week schedule is created, after Week 12 is final. You see your card right away, on your matchup page and on your lineup page.
- A card changes how **that one game** is scored. Your players' own fantasy scores do not change anywhere else in the app.
- Chaos Week counts in full. The score after the card is applied is the score of the game, and it goes into the standings that decide playoff seeding.
- "Lower seed" and "higher seed" mean the two teams' places in the standings when Chaos Week was created. In the 3 v 8 game, the team ranked 8th is the lower seed.

### The cards

| Card | What it does | What you do | Deadline |
|---|---|---|---|
| **Captain** | Your captain's fantasy points count double in this game. | Name one of your Week 13 starters as captain. If you name nobody, a captain is chosen for you. | Before your captain's game kicks off. You can change your captain until then. |
| **Wild Slot** | One extra player's Week 13 points are added to your total. | Name one player from your active roster, any position, who is not already starting. If you name nobody, one is chosen for you. | Before that player's game kicks off. You can change the pick until then. |
| **Raid** | The lower seed adds the Week 13 points of one player from the higher seed's bench. | Lower seed only: pick one player from your opponent's bench. If you make no raid, the system makes it at the deadline. | Before the first Week 13 kickoff. A raid cannot be changed once made. |
| **Bounty** | Whoever wins moves up the waiver order for the following fantasy week. A lower seed that wins goes to the front. A higher seed that wins moves up three places. A tie changes nothing. | Nothing. | None. |
| **Tight End Takeover** | Every starting tight end scores double, for both teams. | Nothing. | None. |
| **Golden Boot** | Every starting kicker scores triple, for both teams. | Nothing. | None. |
| **Iron Curtain** | Each starting D/ST scores double, for both teams. A negative D/ST score is doubled too. | Nothing. | None. |
| **Ground Control** | All rushing points scored by starters count double, for both teams. | Nothing. | None. |
| **Air Show** | All passing points scored by starters count double, for both teams. Interceptions are part of passing points, so they cost double too. | Nothing. | None. |
| **Slippery Hands** | Every fumble lost by a starter costs triple, for both teams. | Nothing. | None. |

### Details that matter

**Captain**
- Your captain must be in your starting lineup. A starting kicker or D/ST can be captain.
- **If you name nobody, you still get a captain.** The automatic captain is the starter in your Week 13 lineup with the highest average fantasy points per game over their three most recent scored weeks before Week 13 (normally Weeks 10 to 12; fewer if the player has fewer). Ties go to the higher season total, then to a fixed order. A starter with no score before Week 13 ranks last. Kickers and D/ST count like anyone else. A starter whose Week 13 game is postponed or canceled is skipped. Nothing from Week 13 scores is used.
- **The captain locks at kickoff, whether you named it or not.** Until your automatic captain's game kicks off you can still name any starter whose game has not started, and changing your lineup can change who the automatic captain would be. From the moment that player's game kicks off, the captain is fixed for the week: you cannot name anyone, and later lineup changes do not move it.
- **No picking after the fact.** The automatic captain is always a starter whose game had not been played when the rule last looked at your lineup. If an earlier game has already been played and you then bench a starter or clear your captain, the automatic captain can only be a starter whose game is still to come, never the one who has already played.
- Your lineup page tells you, before you choose, who it would be and why: "If you do not choose, your captain will be ...". Once it has locked, the page shows "Automatic captain: ... (locked at kickoff)" and there is nothing left to choose.
- A captain you name in time always replaces the automatic one, whatever either of them scores.
- On the score build-up the line reads "Automatic captain" instead of "Captain bonus".
- Once your captain's game has kicked off, the captain cannot be changed or removed.
- If you move your captain to the bench before kickoff, that choice stops counting and you can name another starter. Until you do, the automatic captain applies, and it locks at its own kickoff like any other.
- Double means double: a captain who scores negative points costs you twice.

**Wild Slot**
- The player must be on your active roster and must not be one of your starters. Any position, including a second quarterback, a kicker or a D/ST.
- The pick locks when that player's game kicks off.
- While a player is your Wild Slot pick, you cannot also move them into your starting lineup. Clear the Wild Slot first.
- **If you name nobody, you still get a Wild Slot player.** The automatic pick is the player on your active roster, outside your starting lineup, with the highest average fantasy points per game over their three most recent scored weeks before Week 13. Same ranking and tie-breaks as the automatic captain. A player whose Week 13 game is postponed or canceled, or whose team has no Week 13 game, is skipped.
- **The automatic pick locks at kickoff.** Until that player's game kicks off you can still name any eligible player whose game has not started. From that kickoff the pick is fixed for the week. Your lineup page tells you beforehand: "If you do not choose, the system will pick ...".
- **If you have no eligible player outside your starting lineup, there is no Wild Slot bonus.**
- **If your Wild Slot player leaves your roster before their game kicks off** (dropped, traded, lost on waivers), that pick is void: it adds nothing. You can choose again under the same rules. If you do not, the automatic pick applies.
- A pick you make in time always replaces the automatic one, whatever either of them scores.

**Raid**
- Only the lower seed raids. The higher seed has nothing to choose.
- The target must be on the higher seed's roster and outside their starting lineup **at the moment the raid is made**.
- The raid must be made before the first Week 13 kickoff, so the higher seed still has time to plan.
- One raid. It cannot be changed or cancelled.
- The raided player stays on the higher seed's roster. The higher seed cannot move that player into its Week 13 starting lineup after the raid. Other weeks are not affected.
- The whole league sees the raid in the feed as soon as it is made.
- **If the lower seed makes no raid by the deadline, the system raids for it at the deadline:** the best-ranked player on the higher seed's bench as it stands at that moment (same ranking as the automatic captain; a player with no Week 13 game to play is skipped). The lower seed's lineup page shows beforehand who that would be. An automatic raid is final like any other.
- **The penalty.** If the higher seed has no eligible bench player when the raid is made, by the lower seed or by the system, the raid takes the higher seed's best-ranked **starter** instead. The lower seed can raid only that one starter, and the page says why. The lower seed adds that starter's Week 13 points. The higher seed keeps him in its lineup and still scores him. (This last sentence is the built default; the owner has not decided it: section 6, item 1.)
- **If the raided player leaves the higher seed's roster before his game kicks off**, the raid is void. Before the deadline the lower seed can raid again, from the higher seed's bench as it then stands. After the deadline the system raids again at once, by the same rule, penalty included.

**Bounty**
- Earned only by a win. A tie earns nothing for either team.
- **The lower seed wins:** it goes to the front of the waiver order.
- **The higher seed wins:** it moves up three places in the waiver order. It cannot pass a lower seed that won a Bounty game. If fewer than three teams are ahead of it, it goes to the top of the teams that are not lower-seed winners.
- It lasts from the moment the game is final until the last Week 14 kickoff, and applies to every waiver claim in that time. After that the normal order is back: Week 14 only (decided 2026-10-04).
- When several Bounty games are won in one league, the order is: lower-seed winners first, in the normal order among themselves; then everyone else in the normal order, with each higher-seed winner moved up three places, taken one at a time from the top of the normal order.
- It does not change the score of the game.

**Scoring twists**
- A twist applies to both starting lineups in the same way. Bench players are never affected.
- Tight End Takeover and Golden Boot go by the player's position, so a tight end in the FLEX slot is doubled too.

### How your score is built

The matchup page shows, for each team:

1. **Lineup total**: your nine starters, scored as in any other week.
2. **Card adjustments**: one line per adjustment, naming the player and the points added or taken away. A selection the system made is labelled as such: "Automatic captain", "Automatic Wild Slot player", "Automatic raid"; a raid that took a starter reads "Penalty raid" or "Automatic penalty raid".
3. **Chaos Week total**: the two added together. This is the score of the game.

### The Chaos Clause and Chaos Week

The playoff tiebreak (the Chaos Clause) compares Chaos Week scores. Because each game has a different card, it compares the **lineup total** from step 1, not the total after the card. Confirmed by the owner on 2026-10-04.

---

## 2. Edge cases

| Situation | What happens | Evidence |
|---|---|---|
| A manager never makes a selection | **Captain:** the automatic captain. **Wild Slot:** the automatic Wild Slot player, locked at that player's kickoff. **Raid:** the automatic raid, made at the deadline (section 4). | PROVEN (test) |
| The manager has no eligible player outside the starting lineup (Wild Slot) | No automatic pick, no adjustment line, no bonus. | PROVEN (test): no non-starter at all; the only non-starter on a team with no Week 13 game; postponed; canceled |
| The higher seed has no eligible bench player (Raid) | The penalty: the raid takes its best-ranked starter. A bench that holds only players with no Week 13 game to play counts as no eligible bench player. If the higher seed has no eligible starter either, there is no raid. | PROVEN (test): manual and automatic, empty bench and bye-only bench. The "no eligible starter either" case is PROVEN (body), not run. |
| A starter's game is postponed or canceled when the automatic captain is chosen | That starter is skipped. The automatic captain is the best-ranked starter whose game will be played. If no starter has such a game there is no automatic captain. A starter on a bye is skipped in the same way. | PROVEN (test) for postponed and canceled games. LIKELY for a bye under Captain (same code path: no game; run for Wild Slot and Raid). |
| A named captain is moved to the bench or dropped | The named choice stops counting (as before) and the automatic captain applies until another captain is named, locking at its own kickoff. | PROVEN (test) for the bench, including the lock that follows. LIKELY for a drop (see the row below). |
| No starter has a score before Week 13 | The automatic captain is the starter with the smallest internal id, the same one every time. | PROVEN (test) |
| The franchise has no starters | There is no automatic captain and no bonus. | PROVEN (test) |
| A manager names nobody, the automatic captain's game kicks off, and the manager then tries to name a starter whose game has not started | Refused: "Captain locked: no captain was named before your automatic captain's game kicked off, so the automatic captain is fixed for the week". This holds from the kickoff itself, even before scoring has recorded the lock. | PROVEN (test) |
| The manager changes the lineup before the automatic captain's kickoff | The preview and the eventual lock follow the new lineup. A better starter added before any kickoff becomes the automatic captain and locks at its own kickoff. | PROVEN (test) |
| The lineup is changed after the lock | The captain does not move. Only the lineup total follows the lineup. | PROVEN (test) |
| Scoring runs again after the lock | One row per franchise, unchanged; the same result. | PROVEN (test) |
| Scoring is late: games have kicked off and no captain is recorded | The lock is worked out in kickoff order (section 4) and recorded with the kickoff as its lock time. If the manager changes the lineup first, `set_lineup_slot` records the lock from the lineup as it was before the change. | PROVEN (test) |
| The recorded automatic captain later leaves the starting lineup | Treated like a named captain in that situation: the row stops counting. A player who has kicked off cannot be benched or dropped, so this needs a postponement after kickoff or an operator change. | LIKELY (same code path as a named captain; not separately run) |
| The selected player's game is postponed or canceled | The player has no Week 13 score, so the selection adds 0. A postponed or canceled game never locks a player, so a Captain or Wild Slot choice can be changed to another eligible player until Chaos Week is complete. A named captain is **not** replaced by the automatic one: a named captain is honoured as before, although the automatic rule itself would skip that player. A raid stays as it is and adds 0. | PROVEN (test) for a postponed named captain: adds 0.00, is not locked, is not replaced automatically, can be replaced by the manager. LIKELY for Wild Slot, Raid and canceled games (same code path, not separately run). |
| The selected player is on a bye | Same as above: 0 points, never locks. The automatic rules never choose such a player. | LIKELY for a named selection. PROVEN (test) that the automatic Wild Slot and raid skip a player with no Week 13 game. PROVEN (production `real_games`, read 2026-10-04): four teams have no Week 13 game in 2026 (BAL, IND, LV, NYJ; 14 games, 28 of 32 teams), so this case will occur. |
| The selected player is injured or inactive | No special handling. The selection counts whatever that player scores, which may be 0. Managers can change a Captain or Wild Slot choice until that player's kickoff. | LIKELY |
| The captain is dropped before kickoff | The existing drop logic removes a dropped player from open-week lineups. The captain is then no longer a starter, so the choice stops counting, the automatic captain applies, and another captain can be named. | LIKELY (combines PROVEN "captain moved out of the lineup" with existing drop behaviour; the drop path itself was not run in this test) |
| The Wild Slot pick is dropped, traded or otherwise leaves the roster before its kickoff | **Void** (decided 2026-10-04). The row is marked void at the moment the player leaves and adds nothing. The manager may choose again; otherwise the automatic pick applies, looking only at players whose game is still to come. | PROVEN (test): drop then re-choose; trade then automatic; the real `process_due_waivers` drop path is run for Raid |
| The raided player is dropped or leaves the higher seed's roster before his kickoff | **Void** (decided 2026-10-04). Before the deadline the raider chooses again from the bench as it then stands (which includes a player the lender has just added). After the deadline the system raids again at once, penalty included, in the same statement as the drop. | PROVEN (test): before the deadline (re-choose; automatic at the deadline), after the deadline (automatic at once; into the penalty), and through `process_due_waivers` |
| A selected player is dropped **after** his own game has kicked off | The selection stands and keeps counting: the points were earned while he was on that roster. (Production blocks a drop while the week's games are in progress; it becomes possible once they are all final and before the fantasy week is closed.) | PROVEN (test) for Wild Slot and Raid |
| After the deadline, the system raids again and the best-ranked bench player has already played | He is still taken: the ranking uses nothing from Week 13, and skipping him would let the higher seed dodge the raid by dropping the raided player late. | PROVEN (test). Built default, not asked: section 6, item 2 |
| The lender changes its lineup or roster after the deadline, before scoring has recorded the automatic raid | The raid is recorded first, from the bench as it stood (by `set_lineup_slot` and by the triggers on `lineups` and `roster_entries`). A lender who tries to start the player the raid takes is refused. | PROVEN (test) |
| A manager benches or drops a better-ranked later player, or clears a named selection, after an earlier game has been played | The automatic captain or Wild Slot player is not handed to the player who has already played; only players still to play are considered. | PROVEN (test) for Captain (bench, drop, clear) and Wild Slot (drop) |
| A player whose game has started | Cannot be dropped (existing rule) and cannot be selected, changed or cleared. | PROVEN (test) for selections |
| The adjusted totals are level | A regular-season tie, as in any other week. A tied Bounty game earns nothing for either team. | PROVEN (test) |
| A team wins under another card | No bounty. The existing Chaos Giant Killer award still follows the adjusted result. | PROVEN (test) |
| Two teams are exactly level in the standings while a bounty is in force | The Bounty order places every franchise, so it breaks that tie by the franchise's internal id. With no bounty in force the tie is broken by claim time, as before. | PROVEN (body). Not separately run. |
| The league season is not opted in | No cards are dealt whatever the flag says: the weekly job skips it after one read, the database refuses the deal, no alert is raised, and Chaos Week scores exactly as before. | PROVEN (test) in the database; PROVEN (unit test with a stand-in database client) for the job |
| Cards are not dealt by Tuesday 12:00 New York time of Week 13's week (opted-in league seasons only) | The weekly job logs a `deal-deadline-missed` error line for that league season on every run and returns it in its report (section 5). An operator can deal by hand until the first Week 13 kickoff. | PROVEN (unit test with a stand-in database client); not run against a real database |
| Cards are not dealt before the first Week 13 kickoff | They are never dealt for that league season. Chaos Week is played without cards. | PROVEN (test): the deal is refused after kickoff |
| The commissioner creates Chaos Week by hand | The next run of the weekly job deals the cards (flag on, before kickoff). | PROVEN (unit test with a stand-in database client); not run against a real database |
| A score is corrected after the game is final | `recompute_matchup` already rewrites the points of a final matchup without touching standings. With a card, it rewrites the build-up in the same way. This is existing behaviour and was not changed. | PROVEN (body) for the existing behaviour; UNVERIFIED for a real correction |

---

## 3. How the deal is made and audited

**Who deals.** The database function `deal_chaos_week_cards(league_season_id, 13)`. Only the service role can call it, and it refuses a signed-in user. It also refuses a league season whose `chaos_cards_enabled` is not true ("Rule cards are not enabled for this league season"). The weekly job calls it right after the season step when `CHAOS_CARDS_ENABLED` is on **and** the league season is opted in, so cards are dealt in the run that closes Week 12 and creates Chaos Week. If that does not happen, section 5 describes the alert and how an operator deals by hand. The application never chooses a card and never supplies a seed. AI is not involved.

**How.**

1. The deck is every active card code, sorted.
2. A seed is generated once in the database (two random UUIDs, 64 hex characters) and stored in `chaos_card_deals`.
3. The deal order is the deck sorted by `sha256(seed || ':' || code)`.
4. The five games are sorted by the home team's seed (1 to 5). Game *n* takes card *n* of the deal order. With ten cards and five games no card repeats. If the deck were ever smaller than the number of games, cards would repeat only after every card had been used once.
5. Each draw is stored in `chaos_card_draws` with the seed, the algorithm text, the deck, the order and the game list. One `chaos_cards_dealt` feed event announces the five cards.

**Idempotent.** A second call returns the same cards with status `exists` and writes nothing (PROVEN, test).

**Audit.** As the service role:

```sql
select public.audit_chaos_week_deal('<league_season_id>', 13);
```

It recomputes the deal from the stored seed and deck and returns `matches: true` when every recorded card is the one the seed produces, plus the expected and recorded card per game. League members can read the seed and the draws themselves (`chaos_card_deals`, `chaos_card_draws`) and repeat step 3 with any SHA-256 tool. PROVEN (test): the audit detects a changed draw, and a fixed seed produces the order computed independently in Node.

**Every card is equally likely.** Five of the ten cards are used in a league each season, so some leagues will see no selection card at all, and some will see no twist.

---

## 4. How it is built

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20261004020000_chaos_week_rule_cards.sql` |
| Catalog | `chaos_cards` (code, kind, English and Spanish name and rules, parameters) |
| Deal and draws | `chaos_card_deals`, `chaos_card_draws` |
| Selections | `chaos_card_selections`. A manager writes only through `set_chaos_card_selection` and `clear_chaos_card_selection`; the system writes automatic rows and void marks through `chaos_lock_auto_selection` |
| Bounty | `chaos_bounty_grants` (`grant_kind` is `first` or `up_three`), written by `recompute_matchup` at finalization; `chaos_bounty_waiver_order(league_season)` turns the grants in force into the league's waiver order; `process_due_waivers` sorts claims by it |
| Score | `chaos_card_side_score(matchup, franchise)` returns base, lines and total; `recompute_matchup` uses it for `chaos` matchups with a revealed card and stores the build-up in `matchups.context.chaos_cards` |
| Automatic selections | `chaos_auto_pick(matchup, franchise, kind)` is one function for all three: it ranks the eligible players (`captain`: starters; `wild_slot`: active roster outside the starting lineup; `raid`: the higher seed's bench, or its starters under the penalty) and says whether the pick is due. `chaos_auto_captain` is `chaos_auto_pick(..., 'captain')`. `chaos_captain_expected_points(league_season, week, athlete, team)` gives the number all three are ranked by. `chaos_lock_auto_selection(matchup, franchise)` marks void selections and records a due pick in `chaos_card_selections` (`source = 'automatic'`); `chaos_sync_selections(matchup)` does both sides. `chaos_card_side_score` and the pages read them. |
| Void selections | `chaos_card_selections.voided_at`, `void_reason` (`dropped`): set when a Wild Slot pick or a raided player has left the roster he was chosen from before his kickoff |
| No hindsight | `chaos_card_auto_marks` (one row per franchise per matchup): the time up to which the automatic rule has been evaluated |
| Triggers on existing tables | `roster_entries`: `chaos_cards_before_roster_change` (before insert, before a drop), `chaos_cards_after_roster_drop`. `lineups`: `chaos_cards_before_lineup_change`. All call `chaos_sync_selections` for the franchise's open Chaos Week game, and do nothing unless that game holds a Captain, Wild Slot or Raid card. They fail open: if the card bookkeeping raises, the roster or lineup change still goes through and the failure is a database WARNING (PROVEN, test); scoring itself (`recompute_matchup`) does not hide such a failure. |
| Opt-in | `league_seasons.chaos_cards_enabled` (boolean, not null, default false). Checked by `deal_chaos_week_cards` and by the weekly job. |
| Lineup locks | `set_lineup_slot` refuses a raided player for the lender (not for a void raid, and not for the starter a penalty raid took) and a Wild Slot pick for its own franchise (not a void one) |
| Tiebreak | `chaos_clause_decision` compares base totals and records the adjusted totals beside them |
| Flag | `CHAOS_CARDS_ENABLED` (`1`, `true`, `on`, `yes`), read by the weekly job and by the pages |
| Pages | Matchup page: card, selection states, deadlines, score build-up. Lineup page: selection controls. |
| Text | English in `apps/web/lib/matchups/chaosCards.ts`; Spanish in the locale catalog |

**Inert by default.** With the flag off no cards are dealt, the pages query nothing about cards and render nothing. With the flag on and the league season not opted in, the same (PROVEN, test and unit test). With no card dealt, `recompute_matchup` returns and writes exactly what it did before (PROVEN, test: 150 recompute calls run through both versions with identical results, including a whole Chaos Week with no cards, a whole Chaos Week with the league season not opted in, and a Week 14 closed while cards existed). With no bounty grant in force, `process_due_waivers` ranks claims exactly as before (PROVEN, test). With no selection card dealt to the franchise's open Chaos Week game, the three triggers record nothing (PROVEN, test: lineup and roster changes after a kickoff with no card, and under Bounty and twist cards, write no selection, no mark and no feed event).

### The automatic captain

**Why an average and not a projection.** The owner asked for the "highest projected starter". Weekly projections do not exist in this product: `supabase/schema/tables.sql` and production (read 2026-10-04, PROVEN) have one projection column, `fantasy_player_market_values.projected_points`, which is per season (the table has no week column) and holds 0 rows. Until weekly projections exist, the rule below stands in.

**The rule, exactly.** For a franchise under the Captain card with no captain that counts (none recorded, or the recorded player is no longer one of its starters):

1. **Eligible starters.** Every starter in the franchise's Week 13 lineup whose team has a Week 13 game that is not postponed or canceled. Its kickoff is the earliest such game. Bench players are never considered.
2. **Average.** For each, take the weeks before Week 13 in which that player (or D/ST) has a score in this league season, keep the three most recent, and average the points of those weeks, rounded to two decimals. Fewer than three weeks: average what there is. None: no average.
3. **Rank** by average, highest first; a starter with no average ranks last. Ties: higher total over all weeks before Week 13, then the smaller asset id (as text).
4. **Preview.** While nothing has locked, the automatic captain "would be" the best-ranked eligible starter who has not kicked off. This is what the pages show, and it follows every lineup change.
5. **Lock.** Kickoffs are taken in time order. At each kickoff, the candidate is the best-ranked eligible starter among those who had not kicked off before it. If the candidate is in that kickoff, it is the captain, locked at that kickoff, for the week. If the candidate plays later, nothing locks yet. Put in one sentence: the captain is the earliest-kicking-off eligible starter who has kicked off and whom no eligible starter kicking off at the same time or later outranks.
6. **Record.** The first scoring run after that kickoff (`recompute_matchup`), or the first lineup change after it (`set_lineup_slot`, before it applies the change), writes one row in `chaos_card_selections` with `source = 'automatic'`, no user, `locked_at` = that kickoff, and `details` holding the basis and every average compared. From then on scoring reads the row and never recomputes it. A second run writes nothing.
7. Its Week 13 points are doubled like a named captain's, negative points included.

**From the kickoff in step 5** `set_chaos_card_selection` refuses to name a captain, whether or not the row has been written yet, and the pages remove the choose control.

**When scoring is late** (the realistic case: the weekly job does not run at every kickoff), step 5 is replayed on the lineup as it stands when the function runs. This reproduces the lineup at the kickoff for every starter who has kicked off, because a player who has kicked off cannot leave or enter the lineup. PROVEN (test): with both games kicked off and nothing recorded, the best-ranked starter in the first game is locked at the first kickoff; when the best-ranked starter plays in the second game, nothing locks at the first kickoff and that starter locks at the second.

**What the replay can and cannot see.** Starters who had not kicked off can change between a kickoff and the moment the lock is recorded. Since the third round (2026-10-04) every such change is preceded by an evaluation of the rule on the lineup as it stood: `set_lineup_slot` does it explicitly, and the trigger on `lineups` does it for every other path that removes or adds a lineup row (`claim_free_agent`, `process_due_waivers`, `resolve_trade`, an operator). PROVEN (test): a better-ranked later starter dropped between a kickoff and the recording of the lock does not make the earlier starter captain. This was item 1 of "Decisions needed" and is closed. What is still not seen: a change that is not a lineup or roster write, namely a game being postponed or canceled, or a player moving to another real team, between a kickoff and the next evaluation. The rule is then applied to the schedule as it stands at that next evaluation.

**Properties.** No Week 13 score is read, so the ranking has no hindsight (PROVEN, test: changing Week 13 scores does not change the choice). The preview and the lock are computed by one function, `chaos_auto_pick` (`chaos_auto_captain` for a captain), which `chaos_card_side_score` uses for the matchup total, so the total and the selection cannot disagree. A captain named in time always wins. The adjustment line in `matchups.context.chaos_cards` and in the `matchup_final` feed payload carries `automatic: true`, the basis (`recent_average_v1`), the average, the number of weeks counted, the season total, the kickoff, `locked_at`, and under `compared` the same numbers for every eligible player in rank order.

**Replacing the average with a real projection.** Replace the body of `chaos_captain_expected_points` and nothing else: the automatic captain, Wild Slot player and raid all follow. It must keep returning `expected` (higher is better, null ranks last), `season_total` (first tie-break) and `basis` (a new name, so stored results say which method chose them).

**Pages.** Both pages call `chaos_auto_pick` and show what it returns; the TypeScript does no ranking. The ranking functions run with the caller's rights and read only tables league members can already read (PROVEN, test with the production read policies copied in: a member gets the answer, a user outside the league gets nothing).

### No hindsight: the evaluation mark

The automatic captain and the automatic Wild Slot are decided in kickoff order. For that to mean anything, a kickoff that passed with nothing to lock has to stay that way. `chaos_card_auto_marks.evaluated_through` records, per franchise, the time up to which the rule has been applied to the real lineup and roster. `chaos_lock_auto_selection` moves it to "now" every time it runs: at every scoring run, before every selection or clearing, and before every lineup or roster change. The kickoff walk ignores every kickoff at or before the mark.

What this prevents, PROVEN on the previous build and PROVEN closed here (test):

- Seed 1 starts hq (average 20.00, first game) and hb1 (30.00, later game), and names no captain. hq's game is played; nothing locks, because hb1 outranks him. The manager then benches hb1. Before: hq became captain after the fact. Now: the automatic captain is the best-ranked starter still to play.
- The same with hb1 dropped instead of benched.
- The manager names the kicker (later game), waits for the first game, and clears the captain. Before: hq became captain after the fact. Now: as above.
- Wild Slot: after hb2's game, the manager drops the better-ranked hb1. hb2 does not become the Wild Slot player; with nobody left to play there is no bonus.

When the job is late and nothing has changed in between, the mark is older than the kickoffs and the replay locks exactly what an on-time run would have (PROVEN, test). The mark is not used for a raid: a raid has one deadline and no kickoff walk.

### The automatic Wild Slot and the automatic raid

Both use `chaos_auto_pick`, the function behind the automatic captain, and `chaos_captain_expected_points` for the ranking: average over the three most recent scored weeks before Week 13, then season total, then the asset id. Nothing from Week 13 is read. A player with no Week 13 game to play (postponed, canceled, bye) is never eligible.

**Wild Slot.** Eligible: the franchise's active-roster players (athletes and D/ST) that are not in its starting lineup. Preview, lock and record are those of the automatic captain: kickoffs in time order; at each kickoff, if the best-ranked eligible player who had not kicked off before it is in that kickoff, he is the Wild Slot player, locked at that kickoff, recorded with `source = 'automatic'`. No eligible player: no row, no line, no bonus. From the lock, `set_chaos_card_selection` refuses ("Wild Slot locked: no player was named before your automatic Wild Slot player's game kicked off, so the automatic pick is fixed for the week"). PROVEN (test): on time (nothing locks at the first kickoff when the better-ranked player plays later; he locks at his own kickoff), late job in both orders, lineup change first, roster addition first, no eligible non-starter, no hindsight from Week 13 scores, idempotent, stable after the game is final.

**Raid.** `chaos_auto_pick(matchup, raider, 'raid')` answers only for the lower seed. Eligible: the higher seed's active-roster players outside its starting lineup. The pick is the best-ranked of them **as the bench stands**; it is a preview until the first Week 13 kickoff and due from then. `chaos_lock_auto_selection` records it with `source = 'automatic'`, `source_season_franchise_id` = the higher seed, `locked_at` = the deadline, and writes the same `chaos_raid` feed event a named raid writes, with `automatic: true`. "As it stands at the deadline" is guaranteed by recording before anything moves: `set_lineup_slot` and the triggers evaluate the rule before the higher seed's lineup or roster changes (PROVEN, test: after the deadline and before scoring, the lender empties a slot, tries to start the raided player, adds a better free agent; each time the raid recorded is the one the deadline bench gives).

**The penalty.** When the higher seed's bench holds no eligible player, `chaos_auto_pick` ranks its eligible **starters** instead and returns `penalty: true`. `set_chaos_card_selection` then accepts only that starter ("Your opponent has no eligible bench player, so the raid takes their best-ranked starter. Only that starter can be raided"); the automatic raid takes him at the deadline. The row carries `details.penalty = true`; the adjustment line and the feed event carry `penalty: true`. Effect as built: the raider adds the starter's Week 13 points; nothing is taken from the higher seed, and `set_lineup_slot` does not lock that starter out of its lineup. PROVEN (test): 56.50 to 62.00 where the dodged raid would have given 57.00.

**Pages.** The lineup page of a manager with something to choose shows "If you do not choose, the system will pick ..." with the average behind it. Once fixed it shows "Automatic Wild Slot player: ... (locked at kickoff)" or "Automatic raid: ... (made by the system)" and no choose control. Under the penalty the raid picker offers exactly one player, preselected, with the reason and "This is the only player you can raid." The higher seed's lineup page says its starter was taken and still scores for it. Both pages ask `chaos_auto_pick`; the TypeScript does no ranking. English and Spanish.

### Void selections

`chaos_lock_auto_selection` marks a Wild Slot or Raid row void when the selected player has no active `roster_entries` row on the roster he was chosen from and left before his own kickoff (`voided_at` = the time he left, `void_reason = 'dropped'`). The trigger after a drop runs it in the same statement, so the mark is immediate whichever function did the drop. A void row adds nothing, locks nothing and blocks no lineup move. It stays, so the pages can say what happened, until it is replaced:

- by the manager choosing again (`set_chaos_card_selection`: the normal rules; for a raid, only before the deadline);
- or by the automatic rule: Wild Slot at the next eligible kickoff; Raid at the deadline, or at once if the deadline has passed. The automatic row records what it replaced (`details.replaced`). For a raid replaced after the deadline, `locked_at` is the time the old raid became void.

A player who leaves **after** his own kickoff does not void the selection. "Leaves the roster" covers every path, because it reads `roster_entries`, not the function that wrote it: drop with a free-agent claim, waiver award, trade, operator change.

### Trades and the trade deadline

Read from production on 2026-10-04 (function bodies and data; PROVEN):

- `create_trade_proposal` refuses when `now() >= league_seasons.trade_deadline_at` ("The trade deadline has passed. Trades are closed for this season."). `resolve_trade` refuses to **accept** after it ("The trade deadline has passed. This offer can no longer be accepted."), so an offer made before the deadline cannot be accepted after it. Rejecting and cancelling stay possible.
- For the Stress Test 2026 league season (`257699ec-ef0d-466f-95cb-ec10a5b34d69`) `trade_deadline_at` is **2026-11-10 21:00 UTC**. The first Week 13 kickoff is 2026-12-04 01:15 UTC. The deadline falls before Week 10 (first Week 10 kickoff 2026-11-13 01:15 UTC), 23 days before Week 13. That league season has no trades on record.
- No other production function moves a player between two franchises. Players leave a roster in Week 13 only through `claim_free_agent` and `process_due_waivers` (a drop with an add).

So as things stand **no trade can move a selected player during Week 13** in that league. Two conditions, stated plainly:

1. `set_trade_deadline` lets the league's commissioner move the deadline to any future time **as long as the current deadline has not passed** (it refuses to reopen a passed one). Until 2026-11-10 21:00 UTC a commissioner could therefore push the deadline past Week 13, and trades would then be possible during Chaos Week. From that moment on, they cannot.
2. A league season whose `trade_deadline_at` is null has no deadline at all. Of the eight current league seasons in production, two have a null deadline; neither is the Stress Test league.

If a trade did move a selected player before his kickoff, the selection would be void like a drop (PROVEN, test, with the roster rows a trade writes). Trade logic was not changed.

Related, from the same read: after the trade deadline, Roster Integrity (mode `automatic` in the Stress Test league season) refuses a drop that is not part of an add, refuses a fourth drop within 24 hours, and protects core assets. A higher seed can therefore not simply empty its bench in Week 13: it can swap bench players, at most three in 24 hours, unless a commissioner overrides. The penalty is built regardless.

### The Bounty waiver order

Defined in `chaos_bounty_waiver_order`. It returns no rows unless at least one grant is in force, and then `process_due_waivers` sorts exactly as before (PROVEN, test: ten claims ranked identically by the old and new functions with the fixture's real standings, with set standings, and with level standings).

With a grant in force:

1. **Normal order.** Every franchise of the league season by the existing rule (franchises with no games played first, by draft position descending; then winning percentage ascending; then points for ascending), then franchise id.
2. **Lower-seed winners** (`first` grants) come first, in normal order among themselves.
3. **Everyone else** follows in normal order. Then each higher-seed winner (`up_three` grant), taken in normal order, moves up three places within this second group, or to its top when fewer than three are ahead.

**Week 14 only** (decided 2026-10-04). A grant's `effective_until` is the last Week 14 kickoff. PROVEN (test): the grants end exactly at that kickoff and before Week 15's first game; the bounty order exists one second before it and at no time from it on (at the kickoff, two days later, an hour before the Week 15 kickoff, a day after it); with both grants still on record, a waiver run in Week 15 ranks the claims in the normal order.

PROVEN (test), 10-team league, N1 first in the normal order and N10 last:

| Grants | Resulting order |
|---|---|
| Upset winner N8, favourite winner N6 | N8, N1, N2, N6, N3, N4, N5, N7, N9, N10 |
| Favourite winners N5 and N6 (adjacent) | N1, N5, N6, N2, N3, N4, N7, N8, N9, N10 |
| Favourite winner N2 only | N2, N1, N3, N4, N5, N6, N7, N8, N9, N10 |
| Favourite winner N2, upset winner N9 | N9, N2, N1, N3, N4, N5, N6, N7, N8, N10 |
| Upset winners N4, N9; favourite winners N3, N7, N10 | N4, N9, N3, N1, N7, N2, N10, N5, N6, N8 |

The same orders were read back from `process_due_waivers` itself (the `priority_rank` it writes on ten claims).

**Security.** RLS is on for all six tables. Authenticated users have `SELECT` only; league members read their league's draws, selections and evaluation marks once the card is revealed; a user outside the league reads nothing (PROVEN, test). Every function has a fixed `search_path`. `chaos_auto_pick` runs with the caller's rights (PROVEN, test with production's read policies copied in: a member gets the answer the score uses, an outsider gets nothing). Recording a selection, syncing a matchup and the trigger function cannot be called by a signed-in user. A signed-in user cannot set `league_seasons.chaos_cards_enabled`: `authenticated` and `anon` hold no INSERT or UPDATE privilege on `league_seasons` in production (read 2026-10-04, PROVEN), and the test checks the refusal. The trigger function is `SECURITY DEFINER` because the roster and lineup writes it follows are made by definer functions and by the service role.

### Assumptions added while implementing

Each is as simple as it could be made while staying enforceable. Items that need the owner are repeated in section 6.

1. Cards are revealed at the moment they are dealt. (Confirmed 2026-10-04.)
2. Seeds are the Chaos Week seeds recorded by `generate_chaos_week` (standings rank after Week 12).
3. A captain can be any starter, including K and D/ST. Negative captain points are doubled.
4. A captain moved to the bench before kickoff stops counting and can be replaced.
5. The Wild Slot accepts any active-roster asset that is not starting, including a D/ST.
6. A raid is final when made; its deadline is the first Week 13 kickoff that is not postponed or canceled. (Confirmed 2026-10-04.)
7. The raided-player lock applies to the lender only, for Week 13 only.
8. The Bounty window is from finalization to the last Week 14 kickoff, and covers every claim in that window. (Confirmed 2026-10-04: Week 14 only.)
9. Selections are visible to the whole league as soon as they are made, like lineups. (Confirmed 2026-10-04.)
10. Twist multipliers: TE x2, K x3, D/ST x2, rushing x2, passing x2, fumbles lost x3. (Confirmed 2026-10-04: final.)
11. ~~A selection survives a later drop or trade of the player.~~ Replaced on 2026-10-04: a Wild Slot pick or raided player who leaves the roster before his kickoff makes the selection void. Leaving after his own kickoff does not.
12. A starter on a bye is skipped by the automatic rule, like one whose game is postponed or canceled. The same holds for the automatic Wild Slot and raid.
13. The lock time recorded for an automatic captain or Wild Slot player is that player's kickoff, not the time the row was written. For an automatic raid it is the deadline, or the time the raid it replaces became void when that is later.
14. "Moves up three places" is counted among the franchises that are not lower-seed Bounty winners.
15. "No eligible bench player" (the penalty) means no bench player whose Week 13 game will be played. A bench of bye-week players does not shield the starters.
16. An automatic raid made after the deadline (replacing a void one) may take a bench player whose game has already been played (section 6, item 2).
17. A manager whose named Wild Slot pick is void, or who clears a named selection, gets the automatic rule from that moment on: it considers only players whose game is still to come.
18. The manual raid still accepts any bench player of the higher seed, including one with no Week 13 game, as long as the bench holds at least one eligible player. Only the automatic raid and the penalty test look at eligibility.

### Scoring twists that were rejected

Production score rows were inspected on 2026-10-04 (PROVEN): every `fantasy_player_scores.breakdown` has exactly seven point subtotals (`kicking`, `passing`, `rushing`, `receiving`, `two_point`, `fumbles_lost`, `special_teams_td`), and `fantasy_team_scores` has one points value per D/ST with raw counts beside it.

| Idea | Why not |
|---|---|
| All touchdowns worth half and all yardage worth double | The breakdown does not separate touchdown points from yardage points. `passing` is yards, touchdowns and interceptions in one number. |
| Turnovers cost triple | Only lost fumbles are recorded on their own. Interceptions are folded into `passing`. The fumble half became Slippery Hands. |
| Bench outscores a starter | There is no record of a week's bench. Production has 0 `BENCH` rows in `lineups`; the bench is "roster minus lineup" at the moment you look, so the result could change after the game. |
| Receiving points double | Possible from the data, but it touches most starters at once and swamps the game. Left out to keep the deck small. |
| Two-point conversions or special-teams touchdowns count extra | Possible, but in most games it would change nothing. |

---

## 5. Turning it on

1. Apply `20261003030000` and `20261004010000` if they are not applied, then `20261004020000`. Do not re-apply the earlier ones afterwards (the header of the migration explains why).
2. **Opt the league season in.** For the 2026 test season this is the Stress Test 2026 league season only (owner decision 2026-10-04). As the service role, in the Supabase SQL editor:

   ```sql
   -- Stress Test 2026 (league e72ef311-1de9-4af4-a3b5-9fb1326a9c5f), league season 257699ec-ef0d-466f-95cb-ec10a5b34d69
   update public.league_seasons
      set chaos_cards_enabled = true
    where id = '257699ec-ef0d-466f-95cb-ec10a5b34d69'
      and league_id = 'e72ef311-1de9-4af4-a3b5-9fb1326a9c5f'
   returning id, league_id, chaos_cards_enabled;   -- expect exactly one row, chaos_cards_enabled = true

   -- Check that nothing else is opted in: expect exactly that one row.
   select id, league_id from public.league_seasons where chaos_cards_enabled;
   ```

   The column is false for every league season after the migration; the migration opts nobody in (PROVEN, test). To opt out again before the deal: the same statement with `false`. Opting out **after** the deal does not remove dealt cards (see "Turning it off").
3. Set `CHAOS_CARDS_ENABLED=true` in the Vercel production environment and redeploy. The flag and the opt-in are both required: the flag alone deals nothing (PROVEN, test and unit test).
4. Tell managers the rules in section 1 before Week 13, and no later than the day cards are dealt.
5. After Week 12 is final and before the first Week 13 kickoff (2026-12-04 01:15 UTC, PROVEN from production `real_games` on 2026-10-04), check the weekly job's `{"job":"chaos-cards", ...}` log line, the `chaos_cards_dealt` feed event, and run the audit query.

### Operator: the deal deadline alert, and dealing by hand

**The alert.** Each run of the weekly job, with the flag on, checks every **opted-in** league season after its deal attempt. A league season that is not opted in is skipped after one read and never raises the alert (PROVEN, unit test). If an opted-in league season has open Chaos Week matchups and no deal, and the time is past **Tuesday 12:00 America/New_York** of Week 13's week (the last Tuesday noon before the first Week 13 kickoff in `real_games` that is not postponed or canceled; for 2026 that is 2026-12-01 17:00 UTC), the job writes one error line per league season per run:

```json
{"job":"chaos-cards","error":"deal-deadline-missed","leagueSeasonId":"...","hoursUntilFirstKickoff":36,"firstKickoff":"2026-12-04T01:15:00.000Z","deadline":"2026-12-01T17:00:00.000Z","reason":"the deal failed","action":"..."}
```

The same objects are returned as `chaosCards.alerts` in the job's report, which is what the cron route returns. The alert never throws and runs after scoring and week close, so it cannot block them (PROVEN, unit test). It repeats on every run until the cards are dealt or Chaos Week is final. After the first kickoff `hoursUntilFirstKickoff` is negative and the action says the deal is no longer possible. One limit: when the deal attempt itself failed, the job still ends with an error as before, so the cron response is that error; the alert line is in the logs.

**Dealing by hand.** Before the first Week 13 kickoff, in the Supabase SQL editor (or any session that is not a signed-in app user):

```sql
select public.deal_chaos_week_cards('<league_season_id>'::uuid, 13);
```

It returns `status: dealt` and the five cards, or `status: exists` with the cards already dealt (it never deals twice). It raises "Rule cards are not enabled for this league season" unless the league season is opted in (step 2 above). Then run the audit:

```sql
select public.audit_chaos_week_deal('<league_season_id>'::uuid, 13);   -- expect dealt: true, matches: true, repeats: 0
```

To find league seasons that need it:

```sql
select m.league_season_id, count(*) as chaos_matchups
from public.matchups m
join public.league_seasons ls on ls.id = m.league_season_id and ls.chaos_cards_enabled
where m.week = 13 and m.event_type = 'chaos' and not m.is_final
  and not exists (select 1 from public.chaos_card_deals d where d.league_season_id = m.league_season_id and d.week = 13)
group by m.league_season_id;
```

**After the first Week 13 kickoff the deal is refused.** `deal_chaos_week_cards` raises "Week 13 has already kicked off; rule cards can no longer be dealt" (PROVEN, test). There is no override: that league season plays Chaos Week without cards. The function also refuses a signed-in user, a week with no Chaos Week matchups, and matchups that are final or lack seeds.

Turning it off: unset the variable and redeploy, or set `chaos_cards_enabled = false` for the league season. Either way no new deal is made; with the variable unset the pages also stop showing cards. **Cards already dealt keep scoring**, because scoring is in the database and follows the deal, not the flag or the opt-in (PROVEN, test: opting out after the deal leaves the five draws untouched). To play Chaos Week without cards after a deal, an operator has to delete that league season's row in `chaos_card_deals` before any Week 13 game is final (the draws and selections go with it) and recompute the week's matchups. PROVEN (test): after that delete, the next recompute scores the lineup total and removes the stored build-up.

---

## 6. Decisions needed

Confirmed or decided on 2026-10-04 and removed from this list:

- Second round: the Chaos Clause basis, raid finality and deadline, selections being public and locking at kickoff, cards revealed when dealt, the old question of a card that only one side could benefit from (by the Bounty change), whether the automatic captain locks at kickoff (it does), and how the automatic rule treats a postponed or canceled game (the starter is skipped).
- Third round: the Bounty window (Week 14 only), the twist list and its multipliers (final as built), what happens to a selected player who is dropped or traded (void, choose again, otherwise automatic), and league scope (a per-league-season opt-in; Stress Test 2026 only this season).
- Closed by the build, not by a decision: "a not-yet-started starter is dropped or traded between a kickoff and the recording of the lock". The rule is now evaluated before every lineup and roster change (section 4, "What the replay can and cannot see").

All of these are recorded at the top of this document.

Still open. Each has a working default in the build.

1. **Raid penalty severity: built so the lender still scores the taken starter; the harsher alternative removes his points from the lender.** The owner's rule says the raid "takes" the higher seed's best-ranked starter and is meant to punish a manager who empties the bench to dodge the raid. It does not say whether the higher seed loses that starter's points. Built: the raider adds the starter's Week 13 points; the higher seed keeps the starter in its lineup and still scores him.
2. **An automatic raid made after the deadline can take a player whose game has already been played.** This only happens when a raid becomes void after the deadline. Built: the best-ranked bench player is taken whether or not he has played, because the ranking uses nothing from Week 13 and skipping played players would let the higher seed dodge the raid by dropping the raided player late. The alternative is to take only players still to play, and to fall through to the penalty when there are none.
3. **Confirm the no-hindsight rule for automatic selections.** Built (section 4, "No hindsight: the evaluation mark"): once an earlier game has been played, benching or dropping a better-ranked later player, or clearing a named selection, does not hand the automatic captain or Wild Slot to the player who has already played; only players still to play are considered. This changes what the second-round build did in those cases. It was not asked for; it follows from the owner's reason for the kickoff lock (no picking with hindsight).
4. **Announcement.** When and where managers are told about rule cards, the automatic selections, the raid penalty, void selections and the tiebreak basis. Nothing in this build sends that message.
