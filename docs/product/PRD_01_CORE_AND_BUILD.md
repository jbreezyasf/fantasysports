# Big Exec PRD v1.2 — Sections 1–15

# 1. Executive Decision

Big Exec Fantasy Sports is a **fantasy sports application**.

Season 1 is not a companion-product experiment.

The primary objective is:

> **A real 10-person beta league must be able to draft, manage rosters, set lineups, add/drop players, trade, communicate, compete, experience live scoring, complete the season, and finish believing they just had one of the best fantasy seasons they have ever played.**

Big Exec does not need to beat every incumbent fantasy platform in Year 1.

It does need to be:

- active;
- accurate;
- reliable;
- easy to use;
- socially alive;
- visually polished;
- differentiated enough to create memorable league culture.

The companion/history-import capability remains strategically valuable, but it is **secondary** and must not displace the standalone Season 1 build.

---

# 2. Product Promise

> **Build your franchise. Draft real athletes. Compete with your people. Build a legacy.**

Big Exec combines:

- traditional fantasy competition;
- easy drafting;
- franchise/GM ownership;
- persistent franchise identity;
- social league interaction;
- trading;
- rankings;
- special competition weeks;
- rivalries;
- anti-churn competition;
- weekly awards;
- AI league storytelling;
- shareable recaps;
- stadium progression;
- long-term league history.

### Product Thesis

Fantasy gameplay earns trust.

Franchise ownership creates identity.

Competition creates stakes.

League interaction creates relationships.

History creates meaning.

Entertainment makes the season memorable.

---

# 3. Season 1 Success Standard

Season 1 succeeds if the beta group can complete the entire season without needing a second fantasy platform to operate the league.

The beta should not require manual intervention for ordinary league operations.

### The beta group must be able to:

1. create accounts;
2. create/join the league;
3. create franchises;
4. prepare for the draft;
5. complete a 10-manager snake draft;
6. view complete rosters;
7. set and change legal lineups;
8. see players lock at real game start;
9. add/drop available players;
10. use waivers;
11. propose, negotiate, accept/reject, and complete trades;
12. communicate in the Locker Room;
13. view matchups and scores;
14. receive correct standings;
15. experience the special competition calendar;
16. participate after championship elimination;
17. complete playoffs and the secondary postseason;
18. generate persistent records, awards, rivalries, achievements, and championship history;
19. return to a preserved franchise after the season.

### Experience standard

At no point should the beta group feel that they are performing QA for basic functionality that should already have been internally tested.

Their feedback should primarily answer:

- Is this fun?
- Is this clear?
- Is this visually strong?
- Does this feel different?
- What is annoying?
- What would make you come back?
- Did this feel like a living league?

---

# 4. Product Status Vocabulary

Every feature in this PRD should be labeled using both **decision status** and **build status** where relevant.

## Decision status

- **LOCKED** — approved product decision.
- **RECOMMENDED** — default unless testing proves a better option.
- **TBD** — unresolved and must be decided before the affected feature ships.
- **FUTURE** — intentionally outside current launch scope.

## Build status

- **PROVEN** — directly verified in current production behavior/data or current deployed code plus execution evidence.
- **BUILT** — implementation exists but may still need current end-to-end QA.
- **BUILT-PARTIAL** — important parts exist but required behavior is incomplete.
- **BUILT-BROKEN** — implementation exists with a proven defect.
- **SCHEMA-ONLY** — data model exists but the product flow has not produced real production behavior.
- **NOT STARTED** — required implementation does not exist.
- **SIMULATION-PASSED** — deterministic simulation succeeded but human/deployed flow is not yet proven.
- **UNVERIFIED** — prior claim exists but has not been revalidated.

No project gate may use the word **PASS** without an associated evidence record.

---

# 5. Historical Implementation Snapshot — August 23, 2026

This section preserves the verified August 23 baseline that informed this PRD. It is **not the authoritative current implementation status**. Current implementation evidence belongs in `docs/GATE_STATUS.md` and must be revalidated against the deployed build, production data, and current repository before work is planned.

## 5.1 Current deployment/data facts

**PROVEN:**
- production is deployed through Vercel;
- the production database is Supabase project `njjiqdqhmcbxblwhfade`;
- the 2026 Pro Football competition season exists in production;
- 7,409 athlete rows currently exist;
- 3,012 athletes are active;
- 976 active athletes are currently QB/RB/WR/TE/K;
- athlete data was updated as recently as August 23, 2026;
- 3,012 Sportradar provider IDs exist;
- 1,071 nflverse provider IDs exist;
- two drafts exist and both are completed;
- each completed draft contains 10 WR selections;
- there is currently no live draft;
- 26 lineup rows exist;
- one trade exists;
- 67 Locker Room/feed events exist;
- one final matchup exists;
- zero rivalries currently exist;
- zero franchise achievements currently exist;
- zero stadium-feature unlock rows currently exist;
- zero weekly awards currently exist;
- zero championships currently exist.

## 5.2 Draft-player-pool correction

A previous audit statement said the draft had "zero wide receivers."

That statement is **not an accurate description of the whole system**.

### What is proven

Production contains:
- 401 active WR rows;
- completed drafts with WR selections.

### Separate proven defect

The current deployed draft page requests active QB/RB/WR/TE/K players, sorts by `position` and `display_name`, and limits the result to 500 rows.

With the current production population and that ordering, the first 500 rows contain:

- K: 39
- QB: 121
- RB: 202
- TE: 138
- WR: 0

Therefore:

> **The current fresh available-player query can exclude WRs because of its ordering plus 500-row cap.**

This must be fixed.

It must **not** be described as "Big Exec has no WRs" or "WRs have never been drafted."

## 5.3 Draft realtime/timer/autopick

**PROVEN current state:**
- `drafts` and `draft_picks` are not currently in the Supabase Realtime publication;
- current public draft functions include `initialize_snake_draft`, `make_draft_pick`, and `start_draft`;
- no production draft autopick/expiry function was found;
- no `draft_queues` table currently exists.

**Build status:** BUILT-PARTIAL.

The current draft can store and complete picks, but the required Season 1 live-draft behavior is incomplete.

## 5.4 2026 roster data vs game-stat data

These must not be confused.

**Current 2026 roster/player data exists and is being synced.**

However:

**Current production `real_games` and `athlete_game_stats` game-stat rows are still 2025 Week 1 fixtures/data.**

The most recent verified game-stat ingestion represented 2025 Week 1, not 2026 preseason or regular-season scoring.

Therefore:
- 2026 draft/roster QA can use current player data;
- full 2026 live-scoring QA still requires a working 2026 game-stat ingestion path;
- 2025 real-game data can be replayed as a historical scoring fixture until current live game ingestion is available.

## 5.5 Free agency

A current server action exists that calls `claim_free_agent`.

**Build status:** BUILT, current end-to-end QA still required.

## 5.6 Waivers

There is currently no `waivers` table and no `waiver_claims` table.

**Build status:** NOT STARTED for the full waiver system.

## 5.7 Trading

A transactional trade path exists and one production trade record exists.

The full PRD negotiation lifecycle is not yet proven.

**Build status:** BUILT-PARTIAL.

Required states still include:
- Proposed;
- Viewed;
- Countered;
- Accepted;
- Rejected;
- Withdrawn;
- Expired;
- Commissioner Review;
- Completed;
- Vetoed.

## 5.8 Live scoring

Production has a scoring data model and historical Week 1 rows.

The current Sportradar client in the web app implements a draft/roster snapshot, not game box-score ingestion.

**Build status:** BUILT-PARTIAL / NOT PROVEN FOR 2026 LIVE GAME DAY.

## 5.9 Scheduler

`pg_cron` is not currently installed.

**Build status:** NOT STARTED as a general unattended season scheduler.

This matters for:
- draft clock expiry;
- autopick;
- waiver runs;
- game/stat sync;
- score recomputation;
- matchup finalization;
- weekly awards;
- special-week generation;
- reminders.

## 5.10 Database version control

The repository's `supabase/` directory currently contains only a README.

**Build status:** operational risk.

The production database logic must be reconciled into version-controlled migrations before the system is treated as safely maintainable.

## 5.11 CI

The repository currently declares an npm project/lockfile while the CI workflow uses pnpm.

The latest production commit's visible combined status shows Vercel success, not a passing test/typecheck/build CI gate.

**Build status:** CI NOT PROVEN AS PROTECTING MAIN.

## 5.12 Proven security defects still present

Current production function definitions confirm:

- `build_matchup_recap` still skips league-membership enforcement when `auth.uid()` is null;
- `award_matchup_achievements` has no authorization guard;
- `sync_franchise_stadium_features` has no authorization guard.

These are not speculative audit findings. They were rechecked against current production function definitions on August 23, 2026.

**Build status:** BUILT-BROKEN / security remediation required before public beta exposure.

---

# 6. Development Principle

## Fantasy Core = Truth

The Fantasy Core determines:

- athlete eligibility;
- rosters;
- lineups;
- raw statistics;
- fantasy scores;
- matchup winners;
- standings;
- playoff qualification;
- postseason results;
- official awards based on deterministic rules.

AI does not decide any official result.

## Entertainment Layer = Emotion

AI, motion, recap media, commentary, rivalry presentation, stadiums, and storytelling may:

- explain;
- dramatize;
- celebrate;
- contextualize.

They may not alter the truth.

---

# 7. Season 1 Priority Order

The development priority is:

1. **Draft reliably**
2. **Manage a roster easily**
3. **Set/lock lineups correctly**
4. **Add/drop and process waivers**
5. **Trade reliably**
6. **Ingest current stats**
7. **Score and finalize matchups correctly**
8. **Run the season automatically**
9. **Make competition/social layers feel alive**
10. **Make every beta-critical screen visually excellent**
11. **Expand media and advanced history features**

Visual polish is **not** deferred until the end.

Once a beta-critical screen's functional flow is stable, the established Big Exec visual system should be applied immediately.

However:

> **No visual work may be used as evidence that a gameplay gate passed.**

---

# 8. The Big Exec Season Loop

**Join League  
→ Create Franchise  
→ Draft Team  
→ Manage Roster  
→ Set Lineup  
→ Compete  
→ Add/Drop/Waiver/Trade  
→ Talk  
→ Build Rivalries  
→ Special Competition Weeks  
→ Playoffs / Secondary Competition  
→ Championship  
→ Awards  
→ Preserve History  
→ Return Next Season**

---

# 9. League Formation

### LOCKED
Season 1 is optimized for exactly **10 franchises**.

The current competition engine is designed around 10-team special-week pairings.

The product and documentation should describe the V1 rule honestly:

> **Big Exec V1 Pro Football leagues contain 10 franchises.**

Configurable league size is a future expansion.

### Commissioner sets

- league name;
- season;
- draft date/time;
- draft timer;
- scoring profile;
- roster configuration;
- waiver model;
- trade rules;
- postseason rules;
- manager invitations.

---

# 10. Franchise Creation

The franchise persists across seasons even when the player roster resets.

Managers control:

- franchise name;
- franchise abbreviation;
- original franchise mark/avatar;
- colors within brand-safe constraints;
- manager identity;
- stadium/environment;
- championship history;
- rivalry history;
- awards;
- records;
- aliases/history.

The user is not merely maintaining a temporary roster.

They are building a franchise.

---

# 11. Drafting

## 11.1 Draft type

### LOCKED
Snake Draft.

Round 1:
1 → 2 → 3 → ... → 10

Round 2:
10 → 9 → 8 → ... → 1

Continue alternating.

## 11.2 Draft Headquarters

Before draft day display:

- league name;
- draft date/time;
- timezone;
- countdown;
- manager readiness;
- draft order;
- roster configuration;
- scoring format;
- player rankings;
- personal queue;
- injury/status information;
- commissioner announcements;
- clear "Enter Draft Room" state.

## 11.3 Live Draft Room

Required for beta:

- current round;
- current pick;
- visible clock;
- manager on the clock;
- snake draft board;
- complete eligible player pool;
- search;
- position filters;
- ranking;
- player status;
- team;
- bye week when reliable;
- my roster;
- personal queue;
- draft activity;
- realtime pick propagation;
- reconnection;
- autopick;
- commissioner pause;
- commissioner undo/correction;
- duplicate-pick prevention;
- mobile-first controls.

## 11.4 Draft pool implementation rule

Never rely on one arbitrary global row cap that can silently remove an entire position.

Preferred approaches:

1. rankings-backed eligible-player query;
2. position-aware pagination;
3. server-side search;
4. virtualization for large lists;
5. explicit count validation per required fantasy position.

Before beta, automated QA should assert that the player pool contains a healthy number of:
- QB;
- RB;
- WR;
- TE;
- K;
- D/ST.

## 11.5 Draft rankings

The draft needs an actionable order for casual players.

Rankings should support:

- overall rank;
- positional rank;
- source/version timestamp;
- search;
- filter.

The initial ranking source must be legally usable and operationally sustainable.

If external consensus ranking rights are unclear, Big Exec can begin with a deterministic internal ranking generated from prior fantasy production and current availability while a long-term data arrangement is evaluated.

## 11.6 Queue-first autopick

When a manager's clock expires:

1. validate the manager's personal queue;
2. take the highest-ranked legal queued player;
3. if no valid queued player exists, use platform ranking;
4. apply roster/eligibility rules;
5. commit atomically;
6. mark the pick as auto;
7. advance the draft;
8. notify the league.

## 11.7 Draft failure handling

Required:

- refresh/reconnect restores the draft;
- current pick restored;
- timer restored from server authority;
- queue restored;
- complete history restored;
- simultaneous duplicate selection prevented;
- disconnected manager does not halt the league;
- commissioner can pause;
- commissioner can correct/undo with audit trail;
- reconnect notification shown.

Correctness beats animation.

---

# 12. Initial Pro Football Roster

### CURRENT IMPLEMENTED REFERENCE

- QB: 1
- RB: 2
- WR: 2
- TE: 1
- FLEX: 1
- K: 1
- D/ST: 1
- Bench: 6 in the current Sportradar draft-lab configuration
- IR: 1 in the current Sportradar draft-lab configuration

### Product requirement

Bench and IR configuration must be explicitly locked before creation of the real beta league.

Do not leave the production beta dependent on hidden defaults.

---

# 13. Current Default Scoring Profile

Production currently contains a system-default profile:

**Pro Football Half-PPR**

Current approved rules include:

> **LOCKED SCORING RULE:** Every touchdown is worth 6 fantasy points, including passing, rushing, receiving, D/ST, return, and other touchdown categories supported by the scoring engine.

- Passing TD: 6
- Passing yard: 0.04
- Interception thrown: -2
- Rushing TD: 6
- Rushing yard: 0.1
- Receiving TD: 6
- Receiving yard: 0.1
- Reception: 0.5
- Fumble lost: -2
- 2-point conversion: 2
- PAT made: 1
- FG 0–39: 3
- FG 40–49: 4
- FG 50+: 5
- D/ST sack: 1
- D/ST interception: 2
- D/ST fumble recovery: 2
- D/ST blocked kick: 2
- D/ST safety: 2
- D/ST touchdown: 6
- D/ST points allowed:
  - 0: 10
  - 1–6: 7
  - 7–13: 4
  - 14–20: 1
  - 21–27: 0
  - 28–34: -1
  - 35+: -4

### LOCKED principle

The scoring table displayed to users must match the actual scoring function.

No hidden drift is acceptable.

---

# 14. Front Office

The Front Office is the franchise-management home.

It must answer:

## What needs my attention?

Maximum approximately three urgent actions:

- set lineup;
- replace injured starter;
- player on bye;
- trade offer;
- waiver decision;
- draft action;
- playoff scenario.

## How am I doing?

- record;
- standings;
- all-play rank;
- power rank;
- points;
- streak;
- next opponent;
- recent result.

## What am I building?

- championships;
- rivalry record;
- awards;
- franchise records;
- stadium achievements;
- historical seasons.

Entertainment may never hide an urgent fantasy action.

---

# 15. Lineup Management

Managers move rostered players into legal starting slots.

### Locking

Each athlete locks when their own real game begins.

Do not lock the entire weekly roster when the first game begins.

Required indicators:

- ACTIVE
- BENCH
- LOCKED
- BYE
- QUESTIONABLE
- OUT
- IR

### UX rule

Replacing a starter should be simple.

The user should not need to navigate multiple screens to make a normal lineup change.

---
