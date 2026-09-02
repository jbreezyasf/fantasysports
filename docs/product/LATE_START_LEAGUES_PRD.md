# Big Exec Late-Start Leagues — Product Requirements

Status: Implementation-ready specification  
Initial sport: Pro Football  
Future scope: Sport-agnostic enrollment and historical-period simulation

## 1. Product decision

Big Exec permits a new Pro Football league to form, fill all manager seats, draft, and activate after the regular season begins, up to the platform's published football late-entry cutoff. For the initial release, that cutoff is the Pro Football trade deadline configured for the sport-season.

After a late league drafts, Big Exec automatically reconstructs every completed scoring period before the league's live activation period. It generates legal historical lineups from the players selected in that league's draft, scores scheduled matchups, and publishes the resulting standings. Managers begin live play with an established record instead of starting at 0–0.

This capability applies independently to each sport-season. Closing football enrollment must not close basketball, baseball, hockey, or any other supported sport.

## 2. Goals

- Let commissioners start a legitimate league after opening day without manual score entry.
- Preserve the full Big Exec experience: invitations, franchise naming, draft, standings, schedule, Assistant GM, and optional Executive League purchase.
- Produce deterministic, auditable, repeatable historical results.
- Prevent managers from using hindsight to alter simulated weeks.
- Build a reusable period-based framework for future sports.

## 3. Commercial and enrollment rules

### 3.1 What closes at the cutoff

At `late_entry_cutoff_at`:

- New football league-season creation closes.
- Joining or accepting an invitation into a not-yet-active football league closes.
- A late football league must have every required manager seated and its draft completed before the cutoff.
- Existing active football leagues and their managers continue normally.
- Account registration remains open.
- Enrollment in other open sport-seasons remains available.
- Existing eligible leagues may still purchase or activate Big Exec Executive League under the separate commercial policy; the late-entry cutoff is not itself an Executive upgrade cutoff.

There is no automatic grace period after the cutoff. Product support may resolve a documented payment or platform incident without changing official results.

### 3.2 Cutoff authority

Use a sport-season platform cutoff as the hard ceiling. A commissioner-configurable league trade deadline may make a league close earlier, but must never extend enrollment beyond the platform cutoff.

Effective cutoff:

`min(sport_season.late_entry_cutoff_at, league_season.trade_deadline_at)`

The UI must display the exact date, time, and timezone before league creation, invitation acceptance, and draft launch.

## 4. Activation-period rule

The backfill set is every officially completed scoring period before the activation period.

- If the draft and backfill finish before the current period's first game begins, that current period may be the first live period.
- If any game in the current period has begun, that period is not partially played. The league activates for the next period, and the current period joins the historical backfill set only after its official statistics are complete.
- A league cannot become active while required historical statistics are incomplete or under correction.

The user-facing confirmation must state both the simulated period range and the first live period before the draft begins.

## 5. Historical roster and lineup rules

### 5.1 Frozen draft roster

Only the roster produced by the completed late draft may be used for historical periods. Trades, waiver claims, free-agent additions, drops, IR moves, and later lineup edits are never applied retroactively.

### 5.2 Optimal legal historical lineup

For each manager and each backfilled period, Big Exec selects the highest-scoring lineup that was legal under that league's roster slots and scoring rules, using official historical player statistics.

This best-ball-style reconstruction is required because managers could not have made contemporaneous start/sit decisions. It removes manual hindsight while ensuring every manager is treated by the same algorithm.

Deterministic tie-break order:

1. Higher period fantasy points.
2. Earlier selection in the league's draft.
3. Stable canonical player identifier.

Players with zero points remain eligible when needed to create a legal lineup. Players lacking an official historical record receive zero only when the data provider explicitly represents no qualifying production; missing or unsettled data blocks activation.

### 5.3 No post-draft rewrite

After a historical result is finalized, normal roster transactions do not change it. A controlled administrative rescore may run only when official statistical corrections or a verified software defect require it. Every rescore must be audited.

## 6. Schedule, scoring, and standings

- Generate the league's canonical full-season schedule before backfill.
- Score each historical matchup through the same authoritative scoring engine used for live periods.
- Update wins, losses, ties, points for, points against, all-play record, and any canonical power-ranking inputs.
- Label historical matchups and derived items as `SIMULATED_LATE_START` in internal records and clearly in commissioner-facing history.
- Generate league records and period awards only after the entire backfill batch validates.
- Suppress per-period push notifications and historical transaction chatter; publish one completion summary instead of flooding managers.
- Any recap generated for a backfilled period must say that it was simulated from the post-draft roster.

Backfilled games are official league results after activation. They count toward standings and playoff qualification.

## 7. Draft behavior

The late league still receives the complete Big Exec draft experience:

- Manager invitations and seat verification.
- Franchise/team naming.
- League settings confirmation.
- Draft order generation.
- Live draft with normal timers and accessibility support.
- Draft results and roster validation.

Draft recommendations may consider future availability and the forthcoming live period. They must not optimize for already completed games, because historical lineups use actual points and could otherwise encourage hindsight exploitation. During a late draft, Assistant GM must disclose that missed periods will use optimal legal lineups.

## 8. Assistant GM and voice requirements

The voice knowledge base is the first retrieval layer for stable questions about late entry, simulated periods, cutoff dates, and activation status. Live facts—such as the current cutoff timestamp, draft completion, job progress, standings, or a player's historical points—must come from authoritative tools/state.

Required voice confirmations include:

- “Your draft must finish before [cutoff].”
- “Weeks 1 through 4 will be simulated. Week 5 will be your first live week.”
- “Historical weeks use the highest-scoring legal lineup from the players your league drafts.”
- “Moves you make after the draft will not change those simulated weeks.”

Accessibility voice input, spoken output, screen explanation, and confirmation of consequential actions remain free. Executive League unlocks Assistant GM Pro+ intelligence, not basic access.

## 9. Processing and state model

Suggested league activation states:

- `FORMING`
- `DRAFT_READY`
- `DRAFT_IN_PROGRESS`
- `BACKFILL_PENDING`
- `BACKFILLING`
- `BACKFILL_VALIDATION_FAILED`
- `READY_FOR_ACTIVATION`
- `ACTIVE`

The backfill job must:

- Be asynchronous, retryable, and idempotent.
- Use a unique key per league-season and scoring period.
- Store scoring rules/version, source-stat version, generated lineup, matchup result, and timestamps.
- Commit no partial standings visible to managers.
- Validate roster legality, matchup completeness, standings totals, and period coverage before atomic publication.
- Resume safely after interruption without duplicating games, awards, or records.

## 10. Data model requirements

Add or equivalent:

- `sport_seasons.late_entry_cutoff_at`
- `league_seasons.activation_period`
- `league_seasons.late_start_status`
- `league_seasons.backfill_started_at`
- `league_seasons.backfill_completed_at`
- `historical_lineups` with source `LATE_START_OPTIMAL`
- `historical_backfill_runs` with version, status, error, and audit metadata
- Result provenance on simulated matchups

Do not derive the cutoff solely from application code or a commissioner-editable field.

## 11. Failure and recovery behavior

- If the draft misses the cutoff, do not start it or activate the league; explain the closure and preserve league configuration for a future eligible season where practical.
- If official statistics are unavailable, hold the league in `BACKFILL_PENDING` and display a truthful status.
- If validation fails, keep standings unpublished, alert operations, and provide a retry path.
- If a stat correction arrives, run the normal controlled rescore pipeline and preserve before/after audit values.
- Commissioners cannot manually edit generated historical lineups in V1.

## 12. Metrics

- Late leagues created, filled, drafted, and activated.
- Conversion rate before the cutoff.
- Time from draft completion to active standings.
- Backfill failure and retry rate.
- Executive League attachment rate for late leagues.
- Manager retention through the first live period.
- FAQ containment rate and transfers to live-state tools/support.

## 13. Acceptance criteria

1. A fully seated football league can draft and activate before the effective cutoff.
2. The same operation is rejected at or after the effective cutoff.
3. Other open sports remain available after football closes.
4. Every completed pre-activation period has one legal, deterministic lineup per manager.
5. Historical results use only drafted players and cannot be changed by later transactions.
6. Matchups and standings match a clean replay through the canonical scoring engine.
7. Managers see one atomic set of results and a clear simulated-history label.
8. A backfill retry creates no duplicates.
9. Missing official statistics block activation rather than silently creating unreliable scores.
10. Voice and text can explain the cutoff, simulated range, first live period, and reconstruction rules from the knowledge base.
11. Executive League can be purchased for an eligible late league and grants Assistant GM Pro+ to every manager.

## 14. Out of scope for V1

- Importing rosters or standings from a competing platform.
- Manual historical lineup selection.
- Joining an already-active league as a replacement manager.
- Commissioner overrides that extend the platform enrollment cutoff.
- Partial-period live activation.

