# Chaos Week Rule Cards

**Status 2026-10-04:** built on branch `feat/chaos-week-rule-cards`. Migration written, **not applied**. Flag `CHAOS_CARDS_ENABLED` is **off**. Nothing here is live for any league.

**Owner decisions this implements (2026-10-04, fixed):** one rule card per Chaos Week matchup, both managers of a game play under it; the deck holds Captain, Wild Slot, Raid, Bounty and scoring twists; only the lower seed raids, and only from the opponent's bench; Chaos Week has full stakes.

**Owner decisions confirmed on 2026-10-04 (second round):**

| Decision | State |
|---|---|
| The Chaos Clause compares the **base lineup total**, before the card is applied. | Confirmed. Already built. |
| A raid is final once made. Its deadline is the first Week 13 kickoff. | Confirmed. Already built. |
| Selections are visible to both managers as soon as they are made, and lock at that player's kickoff. There is no in-game lock. | Confirmed. Already built. |
| Cards are dealt automatically as soon as Week 12 closes, and revealed when dealt. | Confirmed. Already built. |
| **Automatic captain.** A manager under Captain who names nobody gets a captain chosen automatically. | New. Built: section 1 "Captain", section 4 "The automatic captain". |
| **Bounty** replaces Upset Bounty and rewards whoever wins. | New. Built: section 1 "Bounty", section 4 "The Bounty waiver order". |
| **Deal deadline alert** in the weekly job, and a way for an operator to deal by hand. | New. Built: section 5. |
| A starting kicker or D/ST can be captain. | Treated as settled: the automatic-captain instruction says they are eligible "exactly as for a named captain". |

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
| **Captain** | Your captain's fantasy points count double in this game. | Name one of your Week 13 starters as captain. If you name nobody, a captain is chosen for you. | Before your captain's game kicks off. You can change your captain until then. |
| **Wild Slot** | One extra player's Week 13 points are added to your total. | Name one player from your active roster, any position, who is not already starting. | Before that player's game kicks off. You can change the pick until then. |
| **Raid** | The lower seed adds the Week 13 points of one player from the higher seed's bench. | Lower seed only: pick one player from your opponent's bench. | Before the first Week 13 kickoff. A raid cannot be changed once made. |
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
- **If you name nobody, you still get a captain.** The automatic captain is the starter in your final Week 13 lineup with the highest average fantasy points per game over their three most recent scored weeks before Week 13 (normally Weeks 10 to 12; fewer if the player has fewer). Ties go to the higher season total, then to a fixed order. A starter with no score before Week 13 ranks last. Kickers and D/ST count like anyone else. Nothing from Week 13 is used, so it cannot be picked with hindsight.
- Your lineup page tells you, before you choose, who it would be and why: "If you do not choose, your captain will be ...". It changes when your lineup changes.
- A captain you name always replaces the automatic one, whatever either of them scores.
- On the score build-up the line reads "Automatic captain" instead of "Captain bonus".
- Once your captain's game has kicked off, the captain cannot be changed or removed.
- If you move your captain to the bench before kickoff, that choice stops counting and you can name another starter. Until you do, the automatic captain applies.
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

**Bounty**
- Earned only by a win. A tie earns nothing for either team.
- **The lower seed wins:** it goes to the front of the waiver order.
- **The higher seed wins:** it moves up three places in the waiver order. It cannot pass a lower seed that won a Bounty game. If fewer than three teams are ahead of it, it goes to the top of the teams that are not lower-seed winners.
- It lasts from the moment the game is final until the last Week 14 kickoff, and applies to every waiver claim in that time. After that the normal order is back.
- When several Bounty games are won in one league, the order is: lower-seed winners first, in the normal order among themselves; then everyone else in the normal order, with each higher-seed winner moved up three places, taken one at a time from the top of the normal order.
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

The playoff tiebreak (the Chaos Clause) compares Chaos Week scores. Because each game has a different card, it compares the **lineup total** from step 1, not the total after the card. Confirmed by the owner on 2026-10-04.

---

## 2. Edge cases

| Situation | What happens | Evidence |
|---|---|---|
| A manager never makes a selection | **Captain:** the automatic captain is used (section 4). **Wild Slot, Raid:** no extra player and no raid; nothing is assigned. | PROVEN (test) |
| The automatic captain's game is postponed or canceled | It stays the automatic captain and adds 0, because the rule reads nothing about Week 13. The manager can still name another starter who will play. See "Decisions needed", item 2. | PROVEN (test) for a postponed game. LIKELY for a canceled one (same code path). |
| A named captain is moved to the bench or dropped | The named choice stops counting (as before) and the automatic captain applies until another captain is named. | PROVEN (test) for the bench. LIKELY for a drop (see the row below). |
| No starter has a score before Week 13 | The automatic captain is the starter with the smallest internal id, the same one every time. | PROVEN (test) |
| The franchise has no starters | There is no automatic captain and no bonus. | PROVEN (test) |
| A manager names a captain after the automatic captain has already played | Allowed, as long as the named player has not kicked off. See "Decisions needed", item 1. | PROVEN (test) |
| The selected player's game is postponed or canceled | The player has no Week 13 score, so the selection adds 0. A postponed or canceled game never locks a player, so a Captain or Wild Slot choice can be changed to another eligible player until Chaos Week is complete. A named captain is **not** replaced by the automatic one: a named captain always wins. A raid stays as it is and adds 0. | PROVEN (test) for a postponed named captain: adds 0.00, is not locked, is not replaced automatically, can be replaced by the manager. LIKELY for Wild Slot, Raid and canceled games (same code path, not separately run). |
| The selected player is on a bye | Same as above: 0 points, never locks. | LIKELY. UNVERIFIED whether any team has a Week 13 bye in 2026. |
| The selected player is injured or inactive | No special handling. The selection counts whatever that player scores, which may be 0. Managers can change a Captain or Wild Slot choice until that player's kickoff. | LIKELY |
| The captain is dropped before kickoff | The existing drop logic removes a dropped player from open-week lineups. The captain is then no longer a starter, so the choice stops counting, the automatic captain applies, and another captain can be named. | LIKELY (combines PROVEN "captain moved out of the lineup" with existing drop behaviour; the drop path itself was not run in this test) |
| The Wild Slot pick is dropped before kickoff | The selection row stays and **still adds that player's Week 13 points**, unless the manager changes the pick. See "Decisions needed", item 4. | LIKELY (the score reads the selection and the player's score, not the roster) |
| The raided player is dropped or traded by the higher seed | The raid stands and the lower seed still receives that player's Week 13 points. The higher seed still cannot start that player in Week 13. A third franchise that acquires the player may start them. See item 4. | LIKELY |
| A player whose game has started | Cannot be dropped (existing rule) and cannot be selected, changed or cleared. | PROVEN (test) for selections |
| The adjusted totals are level | A regular-season tie, as in any other week. A tied Bounty game earns nothing for either team. | PROVEN (test) |
| A team wins under another card | No bounty. The existing Chaos Giant Killer award still follows the adjusted result. | PROVEN (test) |
| Two teams are exactly level in the standings while a bounty is in force | The Bounty order places every franchise, so it breaks that tie by the franchise's internal id. With no bounty in force the tie is broken by claim time, as before. | PROVEN (body). Not separately run. |
| Cards are not dealt by Tuesday 12:00 New York time of Week 13's week | The weekly job logs a `deal-deadline-missed` error line for that league season on every run and returns it in its report (section 5). An operator can deal by hand until the first Week 13 kickoff. | PROVEN (unit test with a stand-in database client); not run against a real database |
| Cards are not dealt before the first Week 13 kickoff | They are never dealt for that league season. Chaos Week is played without cards. | PROVEN (test): the deal is refused after kickoff |
| The commissioner creates Chaos Week by hand | The next run of the weekly job deals the cards (flag on, before kickoff). | PROVEN (unit test with a stand-in database client); not run against a real database |
| A score is corrected after the game is final | `recompute_matchup` already rewrites the points of a final matchup without touching standings. With a card, it rewrites the build-up in the same way. This is existing behaviour and was not changed. | PROVEN (body) for the existing behaviour; UNVERIFIED for a real correction |

---

## 3. How the deal is made and audited

**Who deals.** The database function `deal_chaos_week_cards(league_season_id, 13)`. Only the service role can call it, and it refuses a signed-in user. The weekly job calls it right after the season step when `CHAOS_CARDS_ENABLED` is on, so cards are dealt in the run that closes Week 12 and creates Chaos Week. If that does not happen, section 5 describes the alert and how an operator deals by hand. The application never chooses a card and never supplies a seed. AI is not involved.

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
| Bounty | `chaos_bounty_grants` (`grant_kind` is `first` or `up_three`), written by `recompute_matchup` at finalization; `chaos_bounty_waiver_order(league_season)` turns the grants in force into the league's waiver order; `process_due_waivers` sorts claims by it |
| Score | `chaos_card_side_score(matchup, franchise)` returns base, lines and total; `recompute_matchup` uses it for `chaos` matchups with a revealed card and stores the build-up in `matchups.context.chaos_cards` |
| Automatic captain | `chaos_auto_captain(matchup, franchise)` ranks the starters; `chaos_captain_expected_points(league_season, week, athlete, team)` gives the number they are ranked by. `chaos_card_side_score` calls it, and so do the pages. |
| Lineup locks | `set_lineup_slot` refuses a raided player for the lender and a Wild Slot pick for its own franchise |
| Tiebreak | `chaos_clause_decision` compares base totals and records the adjusted totals beside them |
| Flag | `CHAOS_CARDS_ENABLED` (`1`, `true`, `on`, `yes`), read by the weekly job and by the pages |
| Pages | Matchup page: card, selection states, deadlines, score build-up. Lineup page: selection controls. |
| Text | English in `apps/web/lib/matchups/chaosCards.ts`; Spanish in the locale catalog |

**Inert by default.** With the flag off no cards are dealt, the pages query nothing about cards and render nothing. With no card dealt, `recompute_matchup` returns and writes exactly what it did before (PROVEN, test: 140 recompute calls run through both versions with identical results, including a whole Chaos Week with no cards and a Week 14 closed while cards existed). With no bounty grant in force, `process_due_waivers` ranks claims exactly as before (PROVEN, test).

### The automatic captain

**Why an average and not a projection.** The owner asked for the "highest projected starter". Weekly projections do not exist in this product: `supabase/schema/tables.sql` and production (read 2026-10-04, PROVEN) have one projection column, `fantasy_player_market_values.projected_points`, which is per season (the table has no week column) and holds 0 rows. Until weekly projections exist, the rule below stands in.

**The rule, exactly.** For a franchise under the Captain card with no named captain that counts (none named, or the named player is no longer one of its starters):

1. Take every starter in the franchise's Week 13 lineup as it stands when the score is computed (at finalization, the final lineup). Bench players are never considered.
2. For each, take the weeks before Week 13 in which that player (or D/ST) has a score in this league season, keep the three most recent, and average the points of those weeks, rounded to two decimals. Fewer than three weeks: average what there is. None: no average.
3. Rank by average, highest first; a starter with no average ranks last. Ties: higher total over all weeks before Week 13, then the smaller asset id (as text).
4. The first is the automatic captain. Its Week 13 points are doubled like a named captain's, negative points included.

**Properties.** It reads nothing about Week 13 except the lineup, so there is no hindsight in the ranking (PROVEN, test: changing Week 13 scores does not change the choice). It is computed inside `chaos_card_side_score`, the function that builds the matchup total, on every recompute; nothing is stored between runs, so the total and the captain cannot disagree. A named captain who is in the lineup always wins. The adjustment line in `matchups.context.chaos_cards` and in the `matchup_final` feed payload carries `automatic: true`, the basis (`recent_average_v1`), the average, the number of weeks counted, the season total, and under `compared` the same numbers for every starter in rank order.

**Replacing the average with a real projection.** Replace the body of `chaos_captain_expected_points` and nothing else. It must keep returning `expected` (higher is better, null ranks last), `season_total` (first tie-break) and `basis` (a new name, so stored results say which method chose them).

**Pages.** Both pages call `chaos_auto_captain` and show what it returns; the TypeScript does no ranking. The two functions run with the caller's rights and read only tables league members can already read (PROVEN, test with the production read policies copied in: a member gets the answer, a user outside the league gets nothing).

### The Bounty waiver order

Defined in `chaos_bounty_waiver_order`. It returns no rows unless at least one grant is in force, and then `process_due_waivers` sorts exactly as before (PROVEN, test: ten claims ranked identically by the old and new functions with the fixture's real standings, with set standings, and with level standings).

With a grant in force:

1. **Normal order.** Every franchise of the league season by the existing rule (franchises with no games played first, by draft position descending; then winning percentage ascending; then points for ascending), then franchise id.
2. **Lower-seed winners** (`first` grants) come first, in normal order among themselves.
3. **Everyone else** follows in normal order. Then each higher-seed winner (`up_three` grant), taken in normal order, moves up three places within this second group, or to its top when fewer than three are ahead.

PROVEN (test), 10-team league, N1 first in the normal order and N10 last:

| Grants | Resulting order |
|---|---|
| Upset winner N8, favourite winner N6 | N8, N1, N2, N6, N3, N4, N5, N7, N9, N10 |
| Favourite winners N5 and N6 (adjacent) | N1, N5, N6, N2, N3, N4, N7, N8, N9, N10 |
| Favourite winner N2 only | N2, N1, N3, N4, N5, N6, N7, N8, N9, N10 |
| Favourite winner N2, upset winner N9 | N9, N2, N1, N3, N4, N5, N6, N7, N8, N10 |
| Upset winners N4, N9; favourite winners N3, N7, N10 | N4, N9, N3, N1, N7, N2, N10, N5, N6, N8 |

The same orders were read back from `process_due_waivers` itself (the `priority_rank` it writes on ten claims).

**Security.** RLS is on for all five tables. Authenticated users have `SELECT` only; league members read their league's draws and selections once the card is revealed; a user outside the league reads nothing (PROVEN, test). Every function has a fixed `search_path`.

### Assumptions added while implementing

Each is as simple as it could be made while staying enforceable. Items that need the owner are repeated in section 6.

1. Cards are revealed at the moment they are dealt. (Confirmed 2026-10-04.)
2. Seeds are the Chaos Week seeds recorded by `generate_chaos_week` (standings rank after Week 12).
3. A captain can be any starter, including K and D/ST. Negative captain points are doubled.
4. A captain moved to the bench before kickoff stops counting and can be replaced.
5. The Wild Slot accepts any active-roster asset that is not starting, including a D/ST.
6. A raid is final when made; its deadline is the first Week 13 kickoff that is not postponed or canceled. (Confirmed 2026-10-04.)
7. The raided-player lock applies to the lender only, for Week 13 only.
8. The Bounty window is from finalization to the last Week 14 kickoff, and covers every claim in that window.
9. Selections are visible to the whole league as soon as they are made, like lineups. (Confirmed 2026-10-04.)
10. Twist multipliers: TE x2, K x3, D/ST x2, rushing x2, passing x2, fumbles lost x3.
11. A selection survives a later drop or trade of the player (section 2).
12. The automatic captain uses the lineup as it stands at each recompute and is not frozen at any kickoff (section 6, item 1).
13. The automatic captain ignores postponements and cancellations (section 6, item 2).
14. "Moves up three places" is counted among the franchises that are not lower-seed Bounty winners.

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

### Operator: the deal deadline alert, and dealing by hand

**The alert.** Each run of the weekly job, with the flag on, checks every league season after its deal attempt. If the league season has open Chaos Week matchups and no deal, and the time is past **Tuesday 12:00 America/New_York** of Week 13's week (the last Tuesday noon before the first Week 13 kickoff in `real_games` that is not postponed or canceled; for 2026 that is 2026-12-01 17:00 UTC), the job writes one error line per league season per run:

```json
{"job":"chaos-cards","error":"deal-deadline-missed","leagueSeasonId":"...","hoursUntilFirstKickoff":36,"firstKickoff":"2026-12-04T01:15:00.000Z","deadline":"2026-12-01T17:00:00.000Z","reason":"the deal failed","action":"..."}
```

The same objects are returned as `chaosCards.alerts` in the job's report, which is what the cron route returns. The alert never throws and runs after scoring and week close, so it cannot block them (PROVEN, unit test). It repeats on every run until the cards are dealt or Chaos Week is final. After the first kickoff `hoursUntilFirstKickoff` is negative and the action says the deal is no longer possible. One limit: when the deal attempt itself failed, the job still ends with an error as before, so the cron response is that error; the alert line is in the logs.

**Dealing by hand.** Before the first Week 13 kickoff, in the Supabase SQL editor (or any session that is not a signed-in app user):

```sql
select public.deal_chaos_week_cards('<league_season_id>'::uuid, 13);
```

It returns `status: dealt` and the five cards, or `status: exists` with the cards already dealt (it never deals twice). Then run the audit:

```sql
select public.audit_chaos_week_deal('<league_season_id>'::uuid, 13);   -- expect dealt: true, matches: true, repeats: 0
```

To find league seasons that need it:

```sql
select m.league_season_id, count(*) as chaos_matchups
from public.matchups m
where m.week = 13 and m.event_type = 'chaos' and not m.is_final
  and not exists (select 1 from public.chaos_card_deals d where d.league_season_id = m.league_season_id and d.week = 13)
group by m.league_season_id;
```

**After the first Week 13 kickoff the deal is refused.** `deal_chaos_week_cards` raises "Week 13 has already kicked off; rule cards can no longer be dealt" (PROVEN, test). There is no override: that league season plays Chaos Week without cards. The function also refuses a signed-in user, a week with no Chaos Week matchups, and matchups that are final or lack seeds.

Turning it off: unset the variable and redeploy. The pages stop showing cards and no new deal is made. **Cards already dealt keep scoring**, because scoring is in the database. To play Chaos Week without cards after a deal, an operator has to delete that league season's row in `chaos_card_deals` before any Week 13 game is final (the draws and selections go with it) and recompute the week's matchups. PROVEN (test): after that delete, the next recompute scores the lineup total and removes the stored build-up.

---

## 6. Decisions needed

Confirmed on 2026-10-04 and removed from this list: the Chaos Clause basis, raid finality and deadline, selections being public and locking at kickoff, cards revealed when dealt, and (by the Bounty change) the old question of a card that only one side could benefit from. They are recorded at the top of this document.

Still open. Each has a working default in the build.

1. **Should the automatic captain lock once that player has kicked off?** Built: no. A named captain always wins, so a manager who has named nobody can watch the automatic captain play on Thursday and then either keep it or name a Sunday starter instead. A manager who names a captain has no such second look. The same manager can also change which starter is the automatic captain by changing the lineup among players who have not kicked off. Alternative: once the automatic captain's game has kicked off with no captain named, the automatic captain is fixed.
2. **The automatic captain and a postponed or canceled game.** Built: the rule reads nothing about Week 13, so a starter whose game is postponed can be the automatic captain and adds 0. Alternative: skip starters whose game is not going to be played.
3. **Bounty window.** Built: from the game going final until the last Week 14 kickoff, applied to every waiver claim in that time. Alternatives: one claim only; a fixed number of days; until Week 15 kickoff.
4. **A selected player who is later dropped or traded.** Built: the Wild Slot pick and the raid still count. Should a dropped Wild Slot pick stop counting? Should the higher seed be blocked from dropping a raided player?
5. **The twist list and its multipliers** (assumption 10), including that Air Show doubles interception losses and Golden Boot is triple, not double.
6. **Announcement.** When and where managers are told about rule cards, the automatic captain and the tiebreak basis. Nothing in this build sends that message.
7. **Late-start and test leagues.** Cards are dealt to any league season with open `chaos` matchups in Week 13 while the flag is on. Should some leagues be excluded?
