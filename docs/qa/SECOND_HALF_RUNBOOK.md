# Second-Half Runbook: Week 10 through the Championship

**Written:** 2026-10-03, during NFL Week 4 of the 2026 season.
**Scope:** what has to happen each week from Week 10 to the end of the season, which database function does it, what that function needs, and what it writes.

## Evidence labels

- **PROVEN (body)**: read in the function's production definition (`pg_get_functiondef`, project `njjiqdqhmcbxblwhfade`, 2026-10-03) or in the repository source named.
- **PROVEN (rehearsal)**: also executed locally by `supabase/tests/second_half_rehearsal.sql`, which runs the unmodified production bodies (hash-checked against production) for a 10-team league from the Circuit to season close. The rehearsal uses synthetic scores on tables shaped like production; it is not a production run.
- **UNVERIFIED**: not established. Nothing in this section has ever been run in production for a live league.

No Week 10 to 17 step has been executed in production for the 2026 season. The 2026 seasons of both active 10-team leagues have matchups for Weeks 1 to 9 only (PROVEN, production data 2026-10-03).

## The short version

1. Every week, the weekly job closes the week on its own once every real game is final. That part needs nobody.
2. The next week's matchups do **not** exist until someone creates them. Today that is a commissioner button on the schedule page, once per week, nine times (Weeks 10 to 17 plus season close).
3. This branch adds an automated path for step 2. It is **off** until two things are done, in this order:
   1. apply `supabase/migrations/20261003060000_system_advance_fantasy_season.sql`;
   2. set `SECOND_HALF_AUTOMATION_ENABLED=true` in the Vercel production environment.
4. With the flag off (the default), nothing changes and the commissioner buttons remain the only way.

## Why the job cannot simply call the generators

PROVEN (body, rehearsal): every generator and postseason function starts with

```
if not exists(select 1 from league_members where league_id=p_league_id and user_id=auth.uid() and role='commissioner')
  then raise exception 'Commissioner access required'
```

The scheduled job connects with the service key and has no user, so `auth.uid()` is null and each of these functions refuses it. The rehearsal confirms the refusal.

`system_advance_fantasy_season(p_league_season_id, p_week)` (new, not applied) is the way through: it checks preconditions, then calls the production function for that week as the league's commissioner for the rest of that one transaction. It changes none of the existing functions. Only the service role may execute it.

## What happens every week (already automatic)

| Step | Done by | Preconditions | Writes | Evidence |
|---|---|---|---|---|
| Rescore the week | `calculate_pro_football_week_scores`, then `recompute_matchup(id, false)` for each open matchup | called by the live job (every minute) and the weekly job (every 15 minutes), September to January | `fantasy_player_scores`, `fantasy_team_scores`, `matchups.home_points/away_points` | PROVEN (body; `apps/web/vercel.json`, `scripts/import-balldontlie-nfl-*.mjs`) |
| Close the week | `recompute_matchup(id, true)` for each open matchup | every real game of the week is terminal (see the note on canceled and postponed games) | `matchups.is_final`, `winner_season_franchise_id`; `standings` wins, losses, ties, points, streak; one `matchup_final` feed event; `CHAOS_GIANT_KILLER` achievement where earned | PROVEN (body, rehearsal) |
| Carry lineups forward | `carryLineupsForward` in `scripts/finalize-complete-football-weeks.mjs` | next week still open | `lineups` rows for the next week, only for empty slots | PROVEN (repository source) |
| Publish the weekly recap | `publish_finalized_league_week(league_season_id, week)` | at least one matchup and none open in that week, otherwise returns null | `recap_matchup_moments`, `recap_scripts`, `recap_scenes`, `recap_renders`, `league_news_stories` | PROVEN (body). Not rehearsed. |

Notes:

- The weekly job decides which week it is from the first real game within four days either side of now (PROVEN, repository source). Real games exist for Weeks 1 to 18 of 2026; Week 17 runs 2027-01-01 to 2027-01-05 UTC (PROVEN, production data). The cron schedule covers September to January (PROVEN, `vercel.json`).
- Canceled and postponed games: in production today `recompute_matchup` refuses to finalize while any game is not `final`, so a canceled game blocks the close. That is fixed on branch `fix/week-close-canceled-and-postponed-games`, which is separate from this one. Production had no canceled or postponed game on 2026-10-03 (PROVEN, production data).
- **Weekly awards are not automatic.** `generate_weekly_awards(league_id, week)` is commissioner-only, needs every matchup of the week final, and writes `weekly_awards` (highest score, biggest blowout, closest win) and one `weekly_awards` feed event (PROVEN, body). The only caller is a commissioner action in `apps/web/app/social/actions.ts`. This branch does not automate it.

## Week by week

"Standings order" below always means: wins descending, then points for descending, then franchise id (PROVEN, body). Tied games (the `ties` column) and head-to-head results are not used.

Every generator returns `status: 'exists'` and writes nothing if its week already has matchups, so pressing a button twice, or the job asking twice, is harmless (PROVEN, body, rehearsal).

Every function takes a league id and acts on that league's season with the highest `season_year` (PROVEN, body). It does not use the `is_current` flag.

### Week 10: Rivalry Week

- **When:** after Week 9 is final.
- **Function:** `generate_rivalry_week(league_id, 10)`. Commissioner button: schedule page, event `rivalry`.
- **Preconditions in the body:** commissioner; no Week 10 matchups yet. It does **not** check that Week 9 is final or that there are 10 franchises (PROVEN, body). The system path adds both checks.
- **What it does:** first one game per designated row in `rivalries` (highest `rivalry_score` first, franchise A at home), skipping a row if either franchise is already paired. Remaining franchises are paired by repeating the closest finished Circuit games (same home side) until there are five games (PROVEN, body, rehearsal for both branches).
- **Writes:** up to 5 `matchups` rows, `event_type = 'rivalry'`. No feed event.
- **Production data:** the 10-Manager History Lab league has five designated rivalries covering all ten franchises; Stress Test 2026 has none (PROVEN, production data).

### Week 11: Revenge Week

- **When:** after Week 10 is final.
- **Function:** `generate_revenge_week(league_id, 11)`. Button: event `revenge`.
- **Preconditions in the body:** commissioner; no Week 11 matchups. No check that Week 10 is final (PROVEN, body).
- **What it does:** walks finished games of Weeks 1 to 10 that had a winner, closest margin first, and gives each loser a home game against the franchise that beat it, skipping franchises already paired, until five games. A fallback pairs any franchises still unpaired (PROVEN, body). In the rehearsal all five games came from the main rule; the fallback was not exercised (UNVERIFIED).
- **Writes:** 5 `matchups`, `event_type = 'revenge'`. No feed event.

### Week 12: Position Week

- **When:** after Week 11 is final.
- **Function:** `generate_position_week(league_id, 12)`. Button: event `position`.
- **Preconditions in the body:** commissioner; no Week 12 matchups; exactly 10 standings rows.
- **What it does:** standings order 1v2, 3v4, 5v6, 7v8, 9v10, better rank at home (PROVEN, body, rehearsal).
- **Writes:** 5 `matchups`, `event_type = 'position'`. No feed event.

### Week 13: Chaos Week

- **When:** after Week 12 is final.
- **Function:** `generate_chaos_week(league_id, 13)`. Button: event `chaos`.
- **Preconditions in the body:** commissioner; no Week 13 matchups; exactly 10 standings rows.
- **What it does:** standings order 1v10, 2v9, 3v8, 4v7, 5v6, better rank at home; each matchup records both seeds in `context` (PROVEN, body, rehearsal).
- **Writes:** 5 `matchups`, `event_type = 'chaos'`; one `chaos_week_created` feed event. When the week closes, a lower seed that wins earns `CHAOS_GIANT_KILLER` (PROVEN, body, rehearsal).

### Week 14: Judgment Week

- **When:** after Week 13 is final.
- **Function:** `generate_judgment_week(league_id, 14)`. Button: event `judgment`.
- **Preconditions in the body:** commissioner; no Week 14 matchups; exactly 10 standings rows.
- **What it does:** standings order 1v4, 2v3, 5v6, 7v8, 9v10 (PROVEN, body, rehearsal).
- **Writes:** 5 `matchups`, `event_type = 'judgment'`; one `judgment_week_created` feed event.

### Week 15: Postseason seeding, quarterfinals, redemption semifinals

- **When:** after Week 14 is final.
- **Function:** `initialize_postseason(league_id)`. Button: postseason phase `seed`.
- **Preconditions in the body:** commissioner; no `postseason_seeds` rows yet; no open Week 14 matchup; exactly 10 standings rows.
- **What it does:** seeds 1 to 10 in standings order. Seeds 1 to 6 are the championship bracket, 7 to 10 the redemption bracket. Week 15 games: 3v6 and 4v5 (`playoff_qf`), 7v10 and 8v9 (`redemption_sf`), better seed at home. Seeds 1 and 2 have no game (PROVEN, body, rehearsal).
- **Writes:** 10 `postseason_seeds`; 4 `matchups`; `league_seasons.status = 'postseason'`. No feed event.

### Week 16: Championship semifinals

- **When:** after Week 15 is final.
- **Function:** `generate_postseason_week16(league_id)`. Button: phase `week16`.
- **Preconditions in the body:** commissioner; no Week 16 `playoff_sf` matchups; both quarterfinals final.
- **What it does:** seed 1 hosts the lower-seeded quarterfinal winner, seed 2 hosts the other (PROVEN, body, rehearsal).
- **Writes:** 2 `matchups`, `event_type = 'playoff_sf'`. The redemption bracket has no Week 16 game (the function returns `redemption_status: 'rest_week'`). Six franchises have no matchup this week.

### Week 17: Championship and Redemption final

- **When:** after Week 16 is final.
- **Function:** `generate_postseason_week17(league_id)`. Button: phase `week17`.
- **Preconditions in the body:** commissioner; no Week 17 `championship` or `redemption_final` matchup; both semifinals final; both redemption semifinals final.
- **What it does:** the two semifinal winners play the `championship`; the two Week 15 redemption winners play the `redemption_final` (PROVEN, body, rehearsal). Home side is whichever source matchup has the lower row id, not the better seed (PROVEN, body).
- **Writes:** 2 `matchups`. Six franchises have no matchup this week.

### After Week 17: close the season

- **When:** after both Week 17 games are final.
- **Function:** `close_league_season(league_id)`. Button: phase `close`.
- **Preconditions in the body:** commissioner; championship final and redemption final both final **with a winner**.
- **Writes:** 2 `championships` rows (winner, runner-up, final matchup); `LEAGUE_CHAMPION` and `REDEMPTION_CHAMPION` in `franchise_achievements` (the redemption payload records `next_season_reward: first_choice_snake_draft_slot`); `league_seasons.status = 'complete'`; one `season_complete` feed event. Calling it again returns `already_closed: true` and writes nothing (PROVEN, body, rehearsal).

## The automated path (this branch)

- **Where:** `scripts/advance-fantasy-season.mjs`, called by the weekly job (`scripts/import-balldontlie-nfl-weekly-stats.mjs`) after the week-close step.
- **Rule:** for each league season, find its latest week that has matchups. If that week is 9 to 17 and every matchup in it is final, run the step for the following week (the table above; after Week 17, close the season). One step per league per run. Leagues with no matchups, with an open latest week, or already complete are skipped.
- **Extra checks in `system_advance_fantasy_season`:** 10 franchises with standings; the previous week exists and is entirely final; the season is the league's latest; no tied postseason game; and after the generator runs, the new week must have the expected number of games with every franchise at most once, otherwise the whole step is rolled back.
- **Failure handling:** a failing league is logged and reported and the other leagues still advance; the run is then reported as failed. If the migration is not applied, the job logs `system-advance-function-not-applied` once and does nothing.
- **Side effect to know about:** feed events written by Chaos Week, Judgment Week and season close name the league's commissioner as the actor, because the production functions record `auth.uid()` (PROVEN, rehearsal).
- **Evidence:** unit tests in `tests/advance-fantasy-season.test.mjs` (fake database); the SQL function is exercised end to end by the rehearsal. The JavaScript and the SQL function have **not** been run against each other, and neither has run in production (UNVERIFIED).

### Turning it on

1. Merge. With the flag unset nothing changes.
2. Apply `supabase/migrations/20261003060000_system_advance_fantasy_season.sql`.
3. Set `SECOND_HALF_AUTOMATION_ENABLED=true` (accepted values: `1`, `true`, `on`, `yes`) in Vercel production and redeploy.
4. The first real step will be Week 10, after the Week 9 games finish (last Week 9 kickoff is 2026-11-10 01:15 UTC). Check the weekly job's log line `{"job":"season-advance", ...}` and the schedule page that day.

### Turning it off

Unset the variable and redeploy. Matchups already created stay. The commissioner buttons keep working either way and are safe to press at any time: they return `exists` if the job got there first.

## Where the product document and the functions differ

The competition structure in `docs/product/PRD_02_TRANSACTIONS_AND_SEASON.md` section 21 matches the functions for Weeks 10 to 17: same event per week, same pairings for Position, Chaos and Judgment, six qualifiers, byes for seeds 1 and 2, championship in Week 17. Differences and gaps:

1. **Week 17 participation.** Section 25 requires that "all 10 managers should still have a reason to open Big Exec in Week 17". The functions give only four franchises a Week 17 game and only four a Week 16 game (PROVEN, body, rehearsal).
2. **No tiebreak for playoff games.** A tied matchup is final with no winner (PROVEN, body). With a tied quarterfinal, `generate_postseason_week16` fails with a NOT NULL error on `away_season_franchise_id` (PROVEN, rehearsal); a tied final makes `close_league_season` refuse forever. The PRD does not define a tiebreak. The automated path stops with "A postseason matchup ended in a tie; a commissioner decision is required"; there is currently no tool for making that decision.
3. **Standings tiebreak.** The PRD ranks franchises "#1 to #10" without defining ties. The functions use wins, then points for; tied games do not count for anything (PROVEN, body).
4. **Postseason games change the standings.** Closing a playoff game adds a win and a loss to the same `standings` rows as the regular season (PROVEN, rehearsal). Seeding is taken before that, so the bracket is not affected, but the standings page will show postseason results mixed in after Week 15.
5. **Rivalry and Revenge do not check the previous week.** The commissioner button for Week 10 or 11 can be pressed early and will build the week from whatever results exist (PROVEN, body). The automated path refuses.

## Still unverified

- Any of this in production: no live league has reached Week 10.
- The end-to-end path cron route to JavaScript to `system_advance_fantasy_season` in a deployed environment.
- `publish_finalized_league_week` and the recap pipeline for special-event and postseason weeks.
- How the schedule, matchup, standings and Front Office pages present Weeks 10 to 17, a franchise with no game in Week 16 or 17, and a completed season. `docs/UX_UI_PAGE_SPEC.md` was not reviewed against these states.
- The Revenge Week and Rivalry Week fallback pairings (not reached in the rehearsal).
- Whether lineups carried into Weeks 16 and 17 for franchises without a game cause any display problem.
- Vercel environment values and whether the weekly cron is healthy on every run.
