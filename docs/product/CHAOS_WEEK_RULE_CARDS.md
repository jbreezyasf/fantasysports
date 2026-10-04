# Chaos Week Rule Cards

**Status 2026-10-04:** built on branch `feat/chaos-week-rule-cards`. Migration written, **not applied**. Flag `CHAOS_CARDS_ENABLED` is **off**. Nothing here is live for any league.

**Owner decisions this implements (2026-10-04, fixed):** one rule card per Chaos Week matchup, both managers of a game play under it; the deck holds Captain, Wild Slot, Raid, Upset Bounty and scoring twists; only the lower seed raids, and only from the opponent's bench; Chaos Week has full stakes.

Evidence labels follow `AGENTS.md`. **PROVEN (test)** means executed in `supabase/tests/chaos_week_rule_cards.sql` on a local Postgres 16 with synthetic data, or in the unit tests named. Nothing in this document has run in production.

---

## 1. The rules, as managers should read them

Week 13 is Chaos Week: 1 plays 10, 2 plays 9, 3 plays 8, 4 plays 7, 5 plays 6, using the standings after Week 12.

This season each of the five Chaos Week games is dealt one **rule card**. Both teams in a game play under the same card. The five games get five different cards.

- The cards are dealt by Big Exec when the Chaos Week schedule is created, after Week 12 is final. You see your card right away, on your matchup page and on your lineup page.
- A card changes how **that one game** is scored. Your players' own fantasy scores do not change anywhere else in the app.
- Chaos Week counts in full. The score after the card is applied is the score of the game, and it goes into the standings that decide playoff seeding.
- "Lower seed" and "higher seed" mean the two teams' places in the standings when Chaos Week was created. In the 3 v 8 game, the team ranked 8th is the lower seed.

### The cards

| Card | What it does | What you do | Deadline |
|---|---|---|---|
| **Captain** | Your captain's fantasy points count double in this game. | Name one of your Week 13 starters as captain. | Before your captain's game kicks off. You can change your captain until then. |
| **Wild Slot** | One extra player's Week 13 points are added to your total. | Name one player from your active roster, any position, who is not already starting. | Before that player's game kicks off. You can change the pick until then. |
| **Raid** | The lower seed adds the Week 13 points of one player from the higher seed's bench. | Lower seed only: pick one player from your opponent's bench. | Before the first Week 13 kickoff. A raid cannot be changed once made. |
| **Upset Bounty** | If the lower seed wins, it goes to the front of the waiver order for the following fantasy week. | Nothing. | None. |
| **Tight End Takeover** | Every starting tight end scores double, for both teams. | Nothing. | None. |
| **Golden Boot** | Every starting kicker scores triple, for both teams. | Nothing. | None. |
| **Iron Curtain** | Each starting D/ST scores double, for both teams. A negative D/ST score is doubled too. | Nothing. | None. |
| **Ground Control** | All rushing points scored by starters count double, for both teams. | Nothing. | None. |
| **Air Show** | All passing points scored by starters count double, for both teams. Interceptions are part of passing points, so they cost double too. | Nothing. | None. |
| **Slippery Hands** | Every fumble lost by a starter costs triple, for both teams. | Nothing. | None. |

### Details that matter

**Captain**
- Your captain must be in your starting lineup. A starting kicker or D/ST can be captain.
- No captain named means no bonus. Nothing is chosen for you.
- Once your captain's game has kicked off, the captain cannot be changed or removed.
- If you move your captain to the bench before kickoff, that choice stops counting and you can name another starter.
- Double means double: a captain who scores negative points costs you twice.

**Wild Slot**
- The player must be on your active roster and must not be one of your starters. Any position, including a second quarterback, a kicker or a D/ST.
- The pick locks when that player's game kicks off.
- While a player is your Wild Slot pick, you cannot also move them into your starting lineup. Clear the Wild Slot first.
- No pick means no extra points.

**Raid**
- Only the lower seed raids. The higher seed has nothing to choose.
- The target must be on the higher seed's roster and outside their starting lineup **at the moment the raid is made**.
- The raid must be made before the first Week 13 kickoff, so the higher seed still has time to plan.
- One raid. It cannot be changed or cancelled.
- The raided player stays on the higher seed's roster. The higher seed cannot move that player into its Week 13 starting lineup after the raid. Other weeks are not affected.
- The whole league sees the raid in the feed as soon as it is made.
- No raid means nothing changes.

**Upset Bounty**
- Earned only by a win. A tie earns nothing.
- It lasts from the moment the game is final until the last Week 14 kickoff. During that time the franchise goes ahead of every franchise without a bounty on any waiver claim. If two franchises hold a bounty, the normal waiver order decides between them.
- It does not change the score of the game.

**Scoring twists**
- A twist applies to both starting lineups in the same way. Bench players are never affected.
- Tight End Takeover and Golden Boot go by the player's position, so a tight end in the FLEX slot is doubled too.

### How your score is built

The matchup page shows, for each team:

1. **Lineup total**: your nine starters, scored as in any other week.
2. **Card adjustments**: one line per adjustment, naming the player and the points added or taken away.
3. **Chaos Week total**: the two added together. This is the score of the game.

### The Chaos Clause and Chaos Week

The playoff tiebreak (the Chaos Clause) compares Chaos Week scores. Because each game has a different card, it compares the **lineup total** from step 1, not the total after the card. See "Decisions needed", item 1.

---

## 2. Edge cases

| Situation | What happens | Evidence |
|---|---|---|
| A manager never makes a selection | No bonus, no extra player, no raid. Nothing is assigned automatically. The game is scored on lineup totals plus whatever the other side chose. | PROVEN (test) |
| The selected player's game is postponed or canceled | The player has no Week 13 score, so the selection adds 0. A postponed or canceled game never locks a player, so a Captain or Wild Slot choice can be changed to another eligible player until Chaos Week is complete. A raid stays as it is and adds 0. | PROVEN (test) for a postponed captain: adds 0.00, is not locked, can be replaced. LIKELY for Wild Slot, Raid and canceled games (same code path, not separately run). |
| The selected player is on a bye | Same as above: 0 points, never locks. | LIKELY. UNVERIFIED whether any team has a Week 13 bye in 2026. |
| The selected player is injured or inactive | No special handling. The selection counts whatever that player scores, which may be 0. Managers can change a Captain or Wild Slot choice until that player's kickoff. | LIKELY |
| The captain is dropped before kickoff | The existing drop logic removes a dropped player from open-week lineups. The captain is then no longer a starter, so the choice stops counting and another captain can be named. | LIKELY (combines PROVEN "captain moved out of the lineup" with existing drop behaviour; the drop path itself was not run in this test) |
| The Wild Slot pick is dropped before kickoff | The selection row stays and **still adds that player's Week 13 points**, unless the manager changes the pick. See "Decisions needed", item 4. | LIKELY (the score reads the selection and the player's score, not the roster) |
| The raided player is dropped or traded by the higher seed | The raid stands and the lower seed still receives that player's Week 13 points. The higher seed still cannot start that player in Week 13. A third franchise that acquires the player may start them. See item 4. | LIKELY |
| A player whose game has started | Cannot be dropped (existing rule) and cannot be selected, changed or cleared. | PROVEN (test) for selections |
| The adjusted totals are level | A regular-season tie, as in any other week. No Upset Bounty. | PROVEN (test) |
| The lower seed wins under another card | No bounty. The existing Chaos Giant Killer award still follows the adjusted result. | PROVEN (test) |
| Cards are not dealt before the first Week 13 kickoff | They are never dealt for that league season. Chaos Week is played without cards. | PROVEN (test): the deal is refused after kickoff |
| The commissioner creates Chaos Week by hand | The next run of the weekly job deals the cards (flag on, before kickoff). | PROVEN (unit test with a stand-in database client); not run against a real database |
| A score is corrected after the game is final | `recompute_matchup` already rewrites the points of a final matchup without touching standings. With a card, it rewrites the build-up in the same way. This is existing behaviour and was not changed. | PROVEN (body) for the existing behaviour; UNVERIFIED for a real correction |

---

## 3. How the deal is made and audited

**Who deals.** The database function `deal_chaos_week_cards(league_season_id, 13)`. Only the service role can call it, and it refuses a signed-in user. The weekly job calls it right after the season step when `CHAOS_CARDS_ENABLED` is on. The application never chooses a card and never supplies a seed. AI is not involved.

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
| Selections | `chaos_card_selections`, written only by `set_chaos_card_selection` and `clear_chaos_card_selection` |
| Bounty | `chaos_bounty_grants`, written by `recompute_matchup` at finalization, read by `process_due_waivers` |
| Score | `chaos_card_side_score(matchup, franchise)` returns base, lines and total; `recompute_matchup` uses it for `chaos` matchups with a revealed card and stores the build-up in `matchups.context.chaos_cards` |
| Lineup locks | `set_lineup_slot` refuses a raided player for the lender and a Wild Slot pick for its own franchise |
| Tiebreak | `chaos_clause_decision` compares base totals and records the adjusted totals beside them |
| Flag | `CHAOS_CARDS_ENABLED` (`1`, `true`, `on`, `yes`), read by the weekly job and by the pages |
| Pages | Matchup page: card, selection states, deadlines, score build-up. Lineup page: selection controls. |
| Text | English in `apps/web/lib/matchups/chaosCards.ts`; Spanish in the locale catalog |

**Inert by default.** With the flag off no cards are dealt, the pages query nothing about cards and render nothing. With no card dealt, `recompute_matchup` returns and writes exactly what it did before (PROVEN, test: 140 recompute calls run through both versions with identical results, including a whole Chaos Week with no cards and a Week 14 closed while cards existed).

**Security.** RLS is on for all five tables. Authenticated users have `SELECT` only; league members read their league's draws and selections once the card is revealed; a user outside the league reads nothing (PROVEN, test). Every function has a fixed `search_path`.

### Assumptions added while implementing

Each is as simple as it could be made while staying enforceable. Items that need the owner are repeated in section 6.

1. Cards are revealed at the moment they are dealt.
2. Seeds are the Chaos Week seeds recorded by `generate_chaos_week` (standings rank after Week 12).
3. A captain can be any starter, including K and D/ST. Negative captain points are doubled.
4. A captain moved to the bench before kickoff stops counting and can be replaced.
5. The Wild Slot accepts any active-roster asset that is not starting, including a D/ST.
6. A raid is final when made; its deadline is the first Week 13 kickoff that is not postponed or canceled.
7. The raided-player lock applies to the lender only, for Week 13 only.
8. The Upset Bounty window is from finalization to the last Week 14 kickoff, and covers every claim in that window.
9. Selections are visible to the whole league as soon as they are made, like lineups.
10. Twist multipliers: TE x2, K x3, D/ST x2, rushing x2, passing x2, fumbles lost x3.
11. A selection survives a later drop or trade of the player (section 2).

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
2. Set `CHAOS_CARDS_ENABLED=true` in the Vercel production environment and redeploy.
3. Tell managers the rules in section 1 before Week 13, and no later than the day cards are dealt.
4. After Week 12 is final and before the first Week 13 kickoff (2026-12-04 01:15 UTC, PROVEN from production `real_games` on 2026-10-04), check the weekly job's `{"job":"chaos-cards", ...}` log line, the `chaos_cards_dealt` feed event, and run the audit query.

Turning it off: unset the variable and redeploy. The pages stop showing cards and no new deal is made. **Cards already dealt keep scoring**, because scoring is in the database. To play Chaos Week without cards after a deal, an operator has to delete that league season's row in `chaos_card_deals` before any Week 13 game is final (the draws and selections go with it) and recompute the week's matchups. PROVEN (test): after that delete, the next recompute scores the lineup total and removes the stored build-up.

---

## 6. Decisions needed

Nothing below was guessed silently; each has a working default in the build. Item 1 was requested for explicit confirmation.

1. **Which Chaos Week score does the Chaos Clause use?** Built: the **base lineup total**, so a playoff tie is not decided by which card a game happened to draw. Both numbers are recorded. The alternative is the adjusted total, which is the number in the standings and on the scoreboard. Managers will need to be told which one it is.
2. **Upset Bounty window.** Built: from the game going final until the last Week 14 kickoff, applied to every waiver claim in that time. Alternatives: one claim only; a fixed number of days; until Week 15 kickoff.
3. **Raid deadline and finality.** Built: before the first Week 13 kickoff, one raid, no changes. Should the lower seed be allowed to change a raid before the deadline?
4. **A selected player who is later dropped or traded.** Built: the Wild Slot pick and the raid still count. Should a dropped Wild Slot pick stop counting? Should the higher seed be blocked from dropping a raided player?
5. **Are selections public before kickoff?** Built: yes, visible to the league at once. Alternative: hidden from the opponent until the player kicks off.
6. **When are cards revealed?** Built: when dealt, which is when Chaos Week is generated (soon after Week 12 closes). Alternative: a set reveal time, for example Wednesday evening.
7. **The twist list and its multipliers** (assumption 10), including that Air Show doubles interception losses and Golden Boot is triple, not double.
8. **Upset Bounty gives the higher seed nothing.** Is a card that only one side can benefit from acceptable?
9. **Captain eligibility.** Built: any starter, including K and D/ST.
10. **Announcement.** When and where managers are told about rule cards and the tiebreak basis. Nothing in this build sends that message.
11. **Late-start and test leagues.** Cards are dealt to any league season with open `chaos` matchups in Week 13 while the flag is on. Should some leagues be excluded?
