# Big Exec PRD v1.2 — Sections 35–46

# 35. Secondary Capability — League History Import

### Status
**FUTURE / PART 2** for implementation.  
**RESEARCHED NOW** so the data model does not paint Big Exec into a corner.

The purpose is not to operate another platform's current season for the user.

The purpose is:

> Allow an established friend group to bring its meaningful past into Big Exec without pretending the group was created in 2026.

---

# 36. What Users Should Be Able to Preserve

History import should be tiered because source platforms expose different depth.

## Legacy Core — highest priority

Preserve:

- league name;
- league founding year;
- season year;
- team/franchise names;
- owner/manager identity;
- final standings;
- wins/losses/ties;
- points for;
- points against where available;
- playoff seed;
- playoff finish;
- champion;
- runner-up;
- last-place finish where wanted.

## Legacy Matchups

When source data exists:

- every weekly matchup;
- score;
- winner/loser;
- playoff matchup;
- championship matchup.

This unlocks:

- all-time H2H;
- rivalry record;
- closest games;
- blowouts;
- winning/losing streaks;
- "who owns who";
- highest score;
- lowest score;
- luck/all-play retrospectives.

## Legacy Draft

When source data exists:

- draft type;
- draft order;
- draft slot;
- round;
- pick;
- player;
- franchise;
- traded draft pick where relevant.

## Legacy Transactions

When source data exists:

- trades;
- adds;
- drops;
- waivers;
- FAAB;
- trade tree/history.

## Legacy Milestones

Optional manual additions:

- memorable championship names;
- rivalry trophies;
- rule changes;
- commissioner notes;
- league eras;
- renamed franchises;
- expansion/contraction;
- manager changes.

---

# 37. The Important Identity Problem

A "team" and a "person" are not always the same historical entity.

Across ten years:

- a manager may change team names;
- a franchise may change owners;
- two teams may merge history by league convention;
- a league may move ESPN → Yahoo → Sleeper;
- a manager may miss one season and return.

Big Exec therefore needs separate concepts:

### Manager identity
The human participant.

### Franchise identity
The persistent Big Exec franchise.

### Historical franchise-season identity
What that team was called and who owned it in a specific imported season.

### Alias
Previous team/franchise names attached to a lineage.

Do not destroy historical truth merely to force old data into the current franchise name.

---

# 38. Recommended Import Data Model

Keep imported history isolated from current authoritative competition tables at first.

Recommended entities:

- `legacy_leagues`
- `legacy_sources`
- `legacy_import_runs`
- `legacy_seasons`
- `legacy_managers`
- `legacy_franchise_seasons`
- `legacy_matchups`
- `legacy_drafts`
- `legacy_draft_picks`
- `legacy_transactions`
- `legacy_awards`
- `legacy_aliases`
- `legacy_source_payloads`
- `legacy_mapping_decisions`

### Core rule

> **Imported history is read-only legacy truth until explicitly reconciled. It must never alter the active-season score, lineup, roster, waiver order, or standings.**

---

# 39. Import UX

## Step 1 — Add League History

Commissioner chooses:

- Sleeper
- Yahoo
- ESPN
- MyFantasyLeague
- CSV / spreadsheet
- Manual history

## Step 2 — Connect or Upload

Depending on platform:
- enter league ID/username;
- authorize with official OAuth;
- upload supported file;
- enter structured manual data.

Do not ask users to paste sensitive session cookies into Big Exec as a normal production workflow.

## Step 3 — Discover Seasons

Show:

- seasons found;
- source;
- available data depth;
- missing data.

User selects which seasons to preserve.

## Step 4 — Map Managers

Example:

`J Breezy` (2018–2021)  
`Juanita` (2022–2025)

Big Exec asks whether these are:
- same manager;
- different managers;
- unknown.

Do not guess.

## Step 5 — Map Franchise Lineage

Example:

`Milwaukee Ballers`  
→ renamed  
`Executive Order`

The commissioner may map both to one Big Exec franchise lineage while preserving the old names.

## Step 6 — Choose Import Depth

- Core History
- Matchups
- Drafts
- Transactions
- Everything available

## Step 7 — Conflict Review

Show:

- duplicate season;
- conflicting champion;
- missing manager;
- unknown franchise;
- source mismatch;
- incomplete week.

## Step 8 — Preview

Before writing:

- seasons;
- champions;
- all-time record;
- H2H;
- manager mappings;
- unresolved issues.

## Step 9 — Import to Legacy Vault

Import is initially read-only.

## Step 10 — Publish History

Commissioner confirms.

The history becomes visible in:

- franchise record book;
- rivalry page;
- league history;
- championship wall;
- all-time records.

---

# 40. Import Sources — Current Feasibility Research

## Sleeper

### Verified official capability
Sleeper's read-only API exposes:
- user leagues;
- league configuration;
- rosters;
- league users;
- weekly matchups;
- playoff brackets;
- transactions;
- drafts;
- draft picks;
- traded picks.

A league response contains `previous_league_id`, which provides a natural path for following a league's season chain.

### Constraint
Sleeper's official API documentation states the free read-only API is for non-commercial use and instructs commercial users to contact Sleeper for licensing.

### Product implication
Sleeper is technically the cleanest first automated history connector, but commercial production use requires rights/terms review before Big Exec relies on it.

## Yahoo Fantasy Sports

### Verified official capability
Yahoo provides an official Fantasy Sports API supporting Football, Baseball, Basketball, and Hockey data and uses OAuth for protected/private user data.

### Product implication
Yahoo is a strong candidate for an approved OAuth history importer.

A proof-of-concept must verify exact historical season depth before the UI promises specific old-year details.

## ESPN

### Current research finding
The commonly used ESPN fantasy-history endpoints are not documented as a supported public developer API comparable to Yahoo's Fantasy Sports API.

Community-maintained documentation reports increasing authentication restrictions on historical data, often requiring ESPN session cookies.

### Product implication
Do **not** design the standard Big Exec import flow around asking users to hand over `espn_s2` / `SWID` cookies.

Safer initial options:
- structured user export/upload;
- CSV;
- manual Legacy Core entry;
- approved third-party data export;
- future sanctioned integration if one becomes available.

## MyFantasyLeague

MyFantasyLeague publicly emphasizes persistent league history and manually transferring prior history into its service.

### Product implication
MFL is relevant to experienced long-running leagues.

Before building a direct connector, verify a current supported export/API contract.

CSV/manual history should remain a universal path.

---

# 41. Universal Import Fallback

No provider should be allowed to block the entire history feature.

Big Exec should define its own import templates.

## `league_seasons.csv`

- season_year
- league_name
- champion
- runner_up
- notes

## `franchise_seasons.csv`

- season_year
- team_name
- manager_name
- wins
- losses
- ties
- points_for
- points_against
- playoff_seed
- final_finish

## `matchups.csv`

- season_year
- week
- home_team
- away_team
- home_score
- away_score
- matchup_type

## Optional `draft_picks.csv`

- season_year
- round
- pick
- team_name
- player_name

## Optional `transactions.csv`

- season_year
- week/date
- transaction_type
- team_from
- team_to
- asset

This gives Big Exec a stable product-owned format regardless of provider changes.

---

# 42. What History Should Become Inside Big Exec

Imported history should not merely sit on an archive screen.

It should power:

## Franchise Record Book
- all-time W/L;
- championships;
- playoff appearances;
- points;
- best finish;
- worst finish;
- highest score;
- biggest win;
- streaks.

## Rivalry
- all-time H2H;
- playoff meetings;
- championship meetings;
- current streak;
- biggest blowout;
- closest result.

## Championship Wall
Every title with:
- season;
- franchise;
- manager;
- runner-up;
- final score when available.

## League Timeline
- league founded;
- platform moves;
- franchise renames;
- championships;
- major rivalry moments;
- commissioner-entered milestones.

## Draft History
- past first-round picks;
- best/worst retrospective outcomes if Big Exec later adds deterministic analysis;
- traded-pick trees where supported.

---

# 43. Import Editing and Corrections

Historical data can be messy.

Commissioner should be able to correct imported history, but every manual correction must store:

- original value;
- corrected value;
- correction timestamp;
- acting commissioner;
- optional reason;
- source reference.

Never silently overwrite the source snapshot.

---

# 44. Multiple Platform Eras

A single league may have:

**ESPN 2014–2018  
→ Yahoo 2019–2022  
→ Sleeper 2023–2026  
→ Big Exec 2027**

Big Exec should eventually allow those sources to map into one continuous league history.

The user should not have to choose one provider as the "real" history.

The canonical historical object is the **friend group/league**, not the software provider.

---

# 45. Companion Mode — Future, Not Foreground

A future companion mode may allow a league to remain operational on another platform while Big Exec imports/read-only syncs:

- scores;
- standings;
- rivalry data;
- recaps;
- rankings;
- franchise history.

This remains a **secondary expansion path**.

It should be evaluated only after:
- the standalone beta is working;
- import feasibility is proven;
- provider rights are understood;
- users demonstrate demand.

---

# 46. Community Signal Around History

Current community discussion consistently shows demand for preserving:

- champions;
- standings;
- all-time records;
- H2H;
- streaks;
- historical matchup scores;
- previous drafts;
- trade trees;
- cross-platform league continuity.

The strongest product implication is not "build companion first."

It is:

> **Do not make experienced leagues choose between Big Exec and their history.**

History import reduces switching pain while the standalone product remains the destination.

---
