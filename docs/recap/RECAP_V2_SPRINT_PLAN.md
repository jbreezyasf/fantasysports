# Big Exec Recap Video V2 — Sprint & Ticket Plan

**Version:** 1.0  
**Date:** August 23, 2026  
**Planning note:** This is dependency sequencing, not a promise of elapsed calendar time.

---

# Sprint 0 — Truth, Audit & Baseline

## Goal
Prove what the current renderer and current matchup data can support before visual replacement.

### BE-RV2-001 — Capture V1 baseline
**Priority:** P0  
**Owner:** QA / Engineering

Save representative current recap outputs:

- standard matchup;
- blowout;
- rivalry/championship if available.

**Acceptance**

- record render duration;
- record file size;
- record scene kinds;
- capture 9:16 and 16:9 playback;
- document exactly why each feels slide-based.

### BE-RV2-002 — Recap data-source inventory
**Priority:** P0  
**Owner:** Backend

Map exact sources for:

- final score;
- winner;
- player fantasy points;
- touchdowns;
- yards;
- provider event detail;
- standings;
- rivalry;
- achievements;
- stadium unlocks.

**Acceptance**
Every V2 visual requirement has a direct source, deterministic derived source, or explicit fallback.

### BE-RV2-003 — Define V2 truth contract
**Priority:** P0  
**Owner:** Backend

Add typed `RecapPayloadV2` and `RecapMoment`.

**Acceptance**
No official result depends on AI prose.

### BE-RV2-004 — Add recap/template versioning
**Priority:** P0

Preserve V1 history while enabling V2.

---

# Sprint 1 — Story Engine

## Goal
Make Big Exec know what story happened before making it prettier.

### BE-RV2-010 — Story classifier
Build deterministic categories:

- standard;
- blowout;
- nail-biter;
- comeback;
- rivalry;
- upset;
- superstar carry;
- Chaos/Giant Killer;
- championship.

**Acceptance**
Fixture tests for every category.

### BE-RV2-011 — Moment selector
Rank 2–6 candidate hero moments.

**Acceptance**

- deterministic;
- no duplicate moments;
- source stored;
- importance stored;
- sparse-data fallback tested.

### BE-RV2-012 — MVP selector
Use authoritative fantasy contribution.

**Acceptance**
Tie-breaking deterministic.

### BE-RV2-013 — Scene planner
Convert story + moments into ordered V2 scene list.

**Acceptance**
A standard recap never plans only text scenes.

---

# Sprint 2 — Clay World Foundation

## Goal
Replace flat slide grammar with a physical sports-world grammar.

### BE-RV2-020 — Modularize browser renderer
Split `services/recap-renderer/src/browser/render.ts` into reusable modules.

**Acceptance**
Scene orchestration separated from scene drawing.

### BE-RV2-021 — Clay character primitive
Build reusable original character.

**Acceptance**
Supports:

- franchise color;
- skin variation;
- body variation;
- throw;
- run;
- catch;
- celebrate.

### BE-RV2-022 — Mini stadium foundation
Build:

- field;
- crowd;
- lights;
- scoreboard;
- end zone;
- legacy hooks.

**Acceptance**
Works in both aspect ratios.

### BE-RV2-023 — Camera/tween helpers
Add:

- pan;
- zoom;
- shake;
- whip;
- slow-motion ease.

**Acceptance**
At least two action scenes reuse them.

---

# Sprint 3 — First Hero Plays

## Goal
Create the first recap that visibly cannot be mistaken for a deck.

### BE-RV2-030 — Passing-play scene
Clay QB → wind-up → throw → receiver/catch/end zone.

### BE-RV2-031 — Rocket Arm effect
**Acceptance**

- tied to verified passing highlight;
- visible in 9:16 and 16:9;
- does not obscure the ball/catch/score.

### BE-RV2-032 — Rushing-play scene
Handoff → gap → breakout → end zone.

### BE-RV2-033 — Fire Trail effect
**Locked automatic rule:** `rushing_td && yards >= 20`

**Acceptance tests**

- 19-yard rushing TD → no automatic Fire Trail
- 20-yard rushing TD → Fire Trail
- 50-yard rushing TD → Fire Trail

### BE-RV2-034 — Receiving hero scene
Catch focus → turn → finish.

---

# Sprint 4 — Defense, Score & Ending

### BE-RV2-040 — Defensive scene
Support:

- interception;
- sack;
- defensive TD.

### BE-RV2-041 — Shockwave effect
Impact/camera/lighting language.

### BE-RV2-042 — Score progression
Show the scoring arc without becoming a spreadsheet.

### BE-RV2-043 — Final dagger
Select/render the final defining action when data supports it.

### BE-RV2-044 — Final-score celebration
Clay winner celebration + franchise identity.

### BE-RV2-045 — MVP spotlight
Player name + fantasy points + hero pose.

---

# Sprint 5 — Franchise Legacy

## Goal
Make recaps part of the persistent Big Exec universe.

### BE-RV2-050 — Stadium theme integration
Use franchise environment/stadium progression in recap scenes.

### BE-RV2-051 — Achievement/legacy unlock scene
Examples:

- Championship Banner;
- rivalry feature;
- Giant Killer;
- Redemption.

### BE-RV2-052 — Historical championship test
Use the five-season QA History Lab.

### BE-RV2-053 — Rivalry retrospective
Show H2H/history around designated rivalry matchups.

---

# Sprint 6 — Audio

### BE-RV2-060 — Audio cue contract
Add SFX/music timeline to V2 package.

### BE-RV2-061 — Original/royalty-safe SFX pack
Required:

- intro hit;
- crowd;
- throw;
- Rocket Arm;
- Fire Trail;
- catch;
- hit;
- turnover;
- touchdown;
- final;
- celebration.

### BE-RV2-062 — FFmpeg audio mix
Update self-hosted renderer.

**Acceptance**
H.264/AAC output plays on Android, iPhone/Safari-class playback and desktop.

### BE-RV2-063 — Audio fallback/normalization
A missing optional effect must not destroy the whole recap.

---

# Sprint 7 — Product Controls

### BE-RV2-070 — Recap tier selector
Quick / Standard / Featured.

### BE-RV2-071 — Tone selector
Hype / Rivalry / Funny / Clean.

### BE-RV2-072 — Preview/regenerate
Do not auto-publish experimental creative output during QA.

### BE-RV2-073 — Publish to league
Expose from appropriate matchup/history/Locker Room surfaces.

### BE-RV2-074 — Share flow
Mobile share/copy-link behavior.

---

# Sprint 8 — Renderer Performance & Reliability

### BE-RV2-080 — Benchmark clay renderer
Measure:

- capture time;
- encode time;
- total render time;
- CPU;
- memory;
- temp disk;
- R2 upload;
- file size.

### BE-RV2-081 — Optimize only from measurements
Possible levers:

- particle count;
- texture size;
- filters;
- pre-rendered loops;
- capture FPS.

### BE-RV2-082 — Retry validation
Kill worker mid-render and verify recovery.

### BE-RV2-083 — R2 failure behavior
Confirm failure is observable/retryable.

### BE-RV2-084 — Render observability
Track:

- queued;
- rendering;
- ready;
- failed;
- median duration;
- p95 duration;
- retry count;
- bytes.

---

# Sprint 9 — Creative QA Gate

Generate five required videos.

### BE-RV2-090 — Blowout
Must feel dominant rather than informational.

### BE-RV2-091 — Nail-biter
Must preserve tension.

### BE-RV2-092 — Comeback
Must visibly show reversal.

### BE-RV2-093 — Rivalry
Must use history and franchise identity.

### BE-RV2-094 — Championship
Must feel materially larger and show legacy/stadium consequence.

---

# Sprint 10 — Beta Release Gate

### BE-RV2-100 — Mobile QA
At minimum:

- Android phone;
- iPhone-sized viewport/playback.

### BE-RV2-101 — Desktop QA

- Chrome;
- WebKit/Safari-equivalent where feasible.

### BE-RV2-102 — Truth audit
For every test recap verify:

- score;
- winner;
- event type;
- yards;
- player points;
- MVP;
- rivalry/history;
- stadium unlock.

### BE-RV2-103 — Creative acceptance
Ask reviewers:

1. Would you watch it if you already knew the score?
2. Did it feel like sports action rather than slides?
3. Was the biggest moment visually obvious?
4. Did the franchise feel personal?
5. Would you share it?

### BE-RV2-104 — Production enablement
Make V2 default only after the acceptance suite passes.

Keep V1 rollback until V2 stability is proven.

---

# Dependency Map

```text
001 / 002
   ↓
003 + 004
   ↓
010 + 011 + 012
   ↓
013
   ↓
020 + 021 + 022 + 023
   ↓
030 + 032 + 034
   ↓
031 + 033
   ↓
040 + 041 + 042 + 043 + 044 + 045
   ↓
050 + 051 + 052 + 053
   ↓
060 + 061 + 062 + 063
   ↓
070–074
   ↓
080–084
   ↓
090–094
   ↓
100–104
```

---

# V2 MVP Cut Line

## Must ship

- BE-RV2-002
- BE-RV2-003
- BE-RV2-004
- BE-RV2-010
- BE-RV2-011
- BE-RV2-013
- BE-RV2-020
- BE-RV2-021
- BE-RV2-022
- BE-RV2-023
- BE-RV2-030
- BE-RV2-031
- BE-RV2-032
- BE-RV2-033
- BE-RV2-042
- BE-RV2-044
- BE-RV2-045
- BE-RV2-080
- BE-RV2-090 through 094
- BE-RV2-100 through 104

## Immediate follow-up

- receiving-specific scene refinements;
- expanded defensive scenes;
- full audio library;
- tone selector;
- Featured tier;
- dynasty/rivalry montages;
- advanced stadium intros.

---

# Release Rule

Do not replace V1 merely because V2 can render an MP4.

V2 becomes production default only when:

- truth tests pass;
- all five story archetypes pass;
- 9:16 passes;
- 16:9 passes;
- R2 playback passes;
- mobile playback passes;
- creative review confirms the output no longer feels like a motion-word slide presentation.
