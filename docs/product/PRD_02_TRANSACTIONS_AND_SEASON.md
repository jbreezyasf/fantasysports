# Big Exec PRD v1.2 — Sections 16–34

# 16. Free Agency and Waivers

## 16.1 Free agency

Current free-agent acquisition code exists.

Before beta, prove:

- eligible player can be added;
- required drop is handled;
- duplicate ownership is impossible;
- roster limits remain valid;
- transaction is logged;
- Locker Room event is correct;
- mobile flow is easy.

## 16.2 Waivers

### LOCKED Season 1 principle

Waivers remain available after the trade deadline and are a league-integrity mechanism. A manager who drops a player does not get to direct that player to a preferred franchise. The player enters the waiver process so every eligible franchise has an opportunity to claim them.

### Priority

Waiver priority is weighted toward the teams lowest in the **official standings** at the time the waiver run is processed. Lower-ranked teams receive priority ahead of higher-ranked teams.

Required deterministic ordering:

1. lower official standing / winning percentage first;
2. lower Points For as a secondary competitive tie-break when needed;
3. deterministic final tie-break such as claim timestamp or a documented league rule.

Before standings are meaningful, the system may use a documented preseason fallback such as reverse draft order.

### Required waiver behavior

- dropped players enter waivers for the configured hold period;
- managers may submit claims while the player is on waivers;
- a full-roster claim includes the player to be dropped if the claim wins;
- waiver claims resolve automatically;
- one winning franchise receives the player atomically;
- losing claims receive a clear result;
- a player dropped by a successful claim enters waivers when required by league rules;
- an ineligible/locked player cannot be dropped to manipulate availability;
- all outcomes are auditable.

### Product intent

The waiver system should reduce late-season collusion and super-team creation while giving struggling teams a better opportunity to remain competitive.

---

# 17. Trading

Trading should feel like operating a front office.

### Required flow

1. select franchise;
2. view roster;
3. choose requested asset(s);
4. choose offered asset(s);
5. propose;
6. recipient sees viewed state;
7. recipient accepts, rejects, or counters;
8. proposal expires when appropriate;
9. commissioner review/veto if configured;
10. ownership moves atomically;
11. invalid future lineups are corrected or flagged;
12. transaction enters league history;
13. public completion event appears in Locker Room.

### Required states

- Proposed
- Viewed
- Countered
- Accepted
- Rejected
- Withdrawn
- Expired
- Commissioner Review
- Completed
- Vetoed

### Private Trade Rooms

General private DMs are not required for V1.

Trade participants receive a private Trade Room tied to the negotiation.

Completed trade becomes a public league event.

---

## 17.1 Trade Deadline

### LOCKED

Every Pro Football league has a clearly published trade deadline. The Season 1 default should align with the real NFL trade deadline for that season, while remaining a commissioner-visible/configurable league setting when product rules permit.

After the deadline:

- no new trade may be proposed;
- no pending trade may be accepted;
- a pre-deadline offer cannot be used to bypass the cutoff;
- managers may still reject or withdraw an existing proposal for cleanup;
- waivers and free-agent acquisition continue according to league rules.

The deadline must be enforced at the authoritative server/database boundary, not only by hiding UI controls.

### Integrity goal

The trade deadline exists partly to prevent eliminated or disengaged managers from giving premium players to contenders and creating late-season super teams. After the deadline, player movement occurs through the league-wide waiver/free-agent system rather than negotiated trades.

---

# 18. Matchups

Display:

- franchises;
- current score;
- starters;
- player points;
- live/final state;
- remaining players;
- projected score only when trustworthy;
- contextual situation;
- winner/final result.

Contextual examples:

- YOU NEED 4.7 FROM YOUR TE.
- TWO PLAYERS LEFT.
- WIN AND YOU'RE IN.

Any playoff/scenario message must come from deterministic scenario logic, not an LLM guessing.

---

# 19. Data Ingestion and Live Scoring

## 19.1 Required game data

For every real game:

- provider game ID;
- participating teams;
- kickoff;
- game state;
- final score;
- source update time.

For every fantasy-relevant athlete:

- stable provider ID;
- raw passing stats;
- raw rushing stats;
- raw receiving stats;
- kicking stats;
- required D/ST stats;
- source update time;
- ingestion time.

## 19.2 Athlete identity

### LOCKED

Provider athlete ID must be the primary identity match for an already-mapped provider.

Name, team, and position are mutable attributes.

They must not serve as the long-term identity key after a provider mapping exists.

## 19.3 Ingestion worker

Game/stat ingestion should use a durable worker/job pattern with:

- job ID;
- checkpointing;
- idempotent upserts;
- retry/backoff;
- source timestamps;
- run status;
- error detail;
- row counts;
- alerting.

A partial feed must not silently look complete.

## 19.4 Score recomputation

During real game windows:

1. ingest game/stat updates;
2. persist raw stats;
3. calculate fantasy player scores;
4. calculate D/ST scores;
5. calculate lineup/matchup totals;
6. publish user-visible update;
7. finalize only when source games are final;
8. process corrections when required.

## 19.5 Stat corrections

Keep:
- raw source data;
- source timestamp;
- fantasy score version;
- previous result;
- corrected result;
- affected matchup;
- affected standings;
- audit record.

---

# 20. Internal QA Before Friend Beta

This is now a formal product requirement.

The development team/assistant must prove the foundational flow before inviting the friend beta.

## 20.1 Draft QA

Using current 2026 roster data:

- create a 10-franchise test league;
- run the full configured draft;
- verify all required positions;
- verify snake order;
- verify queue;
- expire at least one clock intentionally;
- verify autopick;
- reconnect at least two clients;
- create simultaneous pick attempt;
- pause/restore draft;
- use commissioner correction;
- complete all rounds;
- verify every roster.

## 20.2 Weekly replay QA

Until current 2026 game-stat ingestion is available, use verified historical game data as replay fixtures.

Replay:

raw stats  
→ player points  
→ lineup points  
→ matchup points  
→ winner  
→ standings  
→ awards  
→ story events.

## 20.3 Current/live QA

Once current 2026 game-stat ingestion exists:

- shadow-score real preseason/regular games;
- compare Big Exec results to raw stats and at least one trusted fantasy calculation;
- test score latency;
- test kickoff locks;
- test simultaneous games;
- test finalization;
- test corrections.

## 20.4 Transaction QA

Test:

- free-agent add;
- add/drop;
- invalid add;
- waiver;
- competing waiver claims;
- trade proposal;
- counter;
- accept;
- reject;
- expire;
- commissioner review;
- roster ownership after transaction.

## 20.5 Security QA

Test as:
- league member;
- non-member authenticated user;
- unauthenticated user;
- commissioner;
- normal manager.

Sensitive league RPCs must reject unauthorized calls.

## 20.6 Browser/device QA

Minimum:
- Android mobile;
- iPhone-size responsive viewport;
- desktop Chrome;
- desktop Safari-equivalent/WebKit test where feasible.

---

# 21. The Competition Engine

### Weeks 1–9 — The Circuit

10 teams play each opponent once.

### Week 10 — Rivalry Week

Pair using rivalry relationships.

### Week 11 — Revenge Week

Strategic rematches.

### Week 12 — Position Week

- #1 vs #2
- #3 vs #4
- #5 vs #6
- #7 vs #8
- #9 vs #10

### Week 13 — Chaos Week

- #1 vs #10
- #2 vs #9
- #3 vs #8
- #4 vs #7
- #5 vs #6

### Week 14 — Judgment Week

- #1 vs #4
- #2 vs #3
- #5 vs #6
- #7 vs #8
- #9 vs #10

### Weeks 15–17 — Postseason

Six teams qualify.

Seeds 1–2 receive first-round byes.

Week 17 contains the championship.

---

# 22. All-Play

All-play is a real second competitive ladder.

Each week every franchise's score is compared against the other nine franchises.

Example:

If a team has the third-highest score:
- it defeats seven teams;
- loses to two;
- weekly all-play result = 7–2.

Use all-play for:

- secondary competitive identity;
- power ranking input;
- tie-breaks where approved;
- anti-churn;
- "unlucky team" context.

Do not let all-play replace official H2H standings.

---

# 23. Rankings

Keep three distinct concepts:

## Official Standings
Determines playoffs.

## All-Play
Measures performance against the league every week.

## Power Rankings
Entertainment/analysis built from deterministic inputs.

AI may narrate power rankings.

AI cannot decide official standings.

---

# 24. Anti-Churn

Core principle:

> **A manager who cannot win the championship must still have something meaningful to win.**

Countermeasures:

- all-play;
- Rivalry Week;
- Revenge Week;
- Position Week;
- Chaos Week;
- Judgment Week;
- weekly awards;
- franchise records;
- stadium unlocks;
- redemption/secondary postseason;
- rivalry trophies;
- recognition.

### Critical metric

**Percentage of mathematically eliminated managers who continue setting valid weekly lineups.**

---

# 25. Secondary Postseason

The secondary competition must have its own identity and status.

It must not look like "the losers bracket."

Possible rewards:

- permanent title;
- trophy;
- stadium feature;
- next-season entrance;
- approved draft-position incentive;
- historical record.

Core requirement:

> **All 10 managers should still have a reason to open Big Exec in Week 17.**

---

# 26. Locker Room

League-wide social environment.

Content:

- manager messages;
- reactions;
- trades;
- add/drop events;
- waiver wins;
- final scores;
- matchup previews;
- awards;
- rivalry events;
- commissioner announcements;
- recaps;
- AI smack talk.

Most league culture should remain public to the league.

---

# 27. AI

AI is a narrator and advisor.

## AI Commissioner

Can explain:
- rules;
- scoring;
- schedule;
- deterministic playoff scenarios;
- transactions.

It may only narrate scenario output produced by deterministic code.

## AI Trade Analyst

Advisory only.

## AI Power Rankings

Narrates deterministic ranking data.

## AI League Reporter

Writes:
- previews;
- recaps;
- rivalry stories;
- awards;
- deterministic playoff-scenario explanation.

## AI Smack Talk

Modes:
- Respectful
- Playful
- Petty
- Roast

Manager approves before posting.

---

# 28. Visual System

The visual direction is already established.

Do not redesign from zero.

## Experience target

**Luxury Front Office × Sports Broadcast × Championship Locker Room × Franchise Video Game**

Do not become:
- generic SaaS;
- spreadsheet-heavy;
- sportsbook;
- casino;
- overwhelming analytics terminal.

## Core brand

- Big Exec
- Big Exec Fantasy Sports
- bigexecfs.com
- Run the Franchise. Own the Season.
- Everybody drafts. Big Execs build franchises.

## Existing palette

Primary:
- Exec Gold `#D4AF37`
- Exec Black `#0B0B0B`
- Charcoal around `#1E1E1E`
- White
- metallic silver/light gray

Approved accent system includes:
- purple;
- blue;
- green;
- red.

## Typography direction

- Monument Extended — headline/brand direction
- Rajdhani Bold — subhead direction
- Inter/Poppins — body/UI direction

## Gold rule

Gold signals:
- primary action;
- victory;
- status;
- premium moment.

Do not make every surface gold.

## Beta visual acceptance

Every beta-critical screen must:
- use the established shell;
- use the real logo/mark assets;
- have coherent spacing;
- be responsive;
- have strong empty/loading/error states;
- avoid placeholder styling;
- look intentional on mobile and desktop.

---

# 29. Mobile Navigation

Primary:

- FRONT OFFICE
- MATCHUP
- PLAYERS
- LEAGUE
- LOCKER ROOM

Contextual:
- Draft Room
- Trades
- Alerts
- Commissioner

---

# 30. Licensing / Visual Restrictions

Current V1 risk-reduction direction:

- no official league logos;
- no official team logos;
- no copied uniforms;
- no player headshots;
- no athlete-likeness avatars;
- no official video highlights without rights;
- no sports betting/odds;
- no real-money wagering.

Functional names/statistics and provider usage require appropriate rights review before broad commercialization.

---

# 31. Platform Trust Gate

Before beta-critical feature work is called production-ready:

- production schema is captured in version control;
- database changes are migration-based;
- CI actually runs;
- production/staging boundaries are explicit;
- hard-coded production fallbacks are removed;
- sensitive RPC authorization is fixed;
- trust metrics exist;
- scheduler exists;
- system has enough observability to diagnose failures.

---

# 32. Authoritative Product Gates

This v1.1 gate system supersedes conflicting gate numbering in older repo documents.

## GATE 0 — Platform Trust

Prove:
- version-controlled DB;
- CI;
- safe environments;
- auth/RPC protection;
- scheduler;
- observability.

## GATE 1 — Draft Night Works

Prove with a full 10-franchise internal draft:
- player pool;
- rankings;
- queue;
- timer;
- realtime;
- autopick;
- reconnect;
- pause;
- correction;
- complete rosters.

## GATE 2 — Team Management Works

Prove:
- roster;
- lineup;
- kickoff lock;
- free agency;
- waiver;
- trade lifecycle.

## GATE 3 — Game Day Works

Prove:
- current stat ingestion;
- score calculation;
- score latency;
- multi-game concurrency;
- refresh;
- finalization;
- correction.

## GATE 4 — Season Runs Itself

Prove:
- weekly schedule;
- special weeks;
- standings;
- awards;
- playoff seeding;
- secondary tournament;
- championship;
- automatic transitions.

## GATE 5 — League Feels Alive

Prove:
- Locker Room;
- rivalry;
- all-play;
- rankings;
- awards;
- useful notifications;
- deterministic story events.

## GATE 6 — Friend Beta

Run the real 10-manager season.

Measure:
- draft success;
- weekly active managers;
- valid lineup rate;
- transactions;
- social activity;
- eliminated-manager retention;
- recap use;
- usability defects;
- enjoyment;
- renewal intent.

## GATE 7 — Commercialization

Before broad launch:
- legal review;
- trademark review;
- provider/data-rights review;
- privacy;
- moderation;
- app-store requirements;
- cost model;
- unit economics.

---

# 33. Trust Metrics

Track:

- scoring incidents;
- ingestion failures;
- ingestion latency;
- score latency;
- duplicate draft attempts;
- reconnect failures;
- autopick failures;
- incorrect roster locks;
- waiver processing failures;
- trade-resolution failures;
- stat-correction failures;
- matchup-finalization failures;
- scheduler failures.

Trust metrics are an operational feature, not an analytics afterthought.

---

# 34. Kill Conditions

## Kill #1 — Scoring cannot be trusted
Do not publicly launch the standalone engine until corrected.

## Kill #2 — Draft reliability is weak
Do not use a real beta group to discover fundamental draft failure.

## Kill #3 — Big Exec is only an incumbent with gold graphics
Strengthen the differentiated game loop.

## Kill #4 — Unique features do not improve retention
Rework them.

## Kill #5 — Switching cost consistently blocks adoption
History import/companion capability becomes more important, but does not retroactively redefine Season 1 without evidence.

## Kill #6 — Licensing economics break the product
Change visual/data strategy.

## Kill #7 — Real-money gaming becomes necessary
Reassess the concept.

## Kill #8 — Multi-sport expansion harms Pro Football
Stop expansion until football is excellent.

## Kill #9 — Media outranks gameplay
Freeze optional media work while Fantasy Core defects remain.

## Kill #10 — League is not socially alive
The emotional loop is missing.

---
