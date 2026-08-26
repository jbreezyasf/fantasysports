# Big Exec Recap Video V2 — Product Requirements & Creative Specification

**Version:** 1.0  
**Date:** August 23, 2026  
**Product:** Big Exec Fantasy Sports  
**Status:** Approved direction / implementation-ready  

## 1. Product Decision

Big Exec recap videos must no longer function primarily as animated scorecards or kinetic-typography slide decks.

The recap is a **mini sports story**.

> **Text supports the story. Text is not the story.**

Every standard recap must contain actual visual action, including at least one reenacted fantasy-scoring moment. The target V2 experience is 2–5 reenacted hero moments depending on recap tier.

## 2. Verified Current Renderer Baseline

The existing recap renderer is already a usable technical foundation:

- Service path: `services/recap-renderer`
- Primary beta renderer: self-hosted **PixiJS + headless Chromium + FFmpeg**
- Render jobs hydrate from `recap_scripts` and ordered `recap_scenes`
- Independent `16:9` and `9:16` jobs already exist
- Completed MP4 media can upload to Cloudflare R2
- Public media origin can be `https://media.bigexecfs.com`
- The renderer deliberately does not determine official scores, winners, awards, or fantasy truth

### Current visual limitation

`services/recap-renderer/src/browser/render.ts` currently draws a shared arcade/stadium background and switches among a small group of text-forward scenes such as:

- `stadium_open`
- `score_reveal`
- `arcade_star`
- `winner_moment`

That implementation explains the current motion-word-slide feel.

### V2 architectural decision

Do **not** throw away the queue, worker, FFmpeg encoder, R2 publishing, or provider-neutral renderer interface merely to change the creative direction.

The primary V2 rebuild belongs in:

1. recap data/story selection;
2. scene schema;
3. PixiJS composition;
4. character/asset system;
5. effects;
6. audio;
7. render QA.

## 3. Product Goal

A manager should watch their matchup recap and feel that Big Exec turned fantasy statistics into a tiny sports universe.

The recap should be:

- dramatic;
- funny when appropriate;
- competitive;
- franchise-specific;
- visually identifiable as Big Exec;
- understandable without reading paragraphs;
- re-watchable;
- shareable.

## 4. Visual Identity

### Primary style

**Premium mini claymation sports world**

Characteristics:

- sculpted/clay-like miniature characters;
- tactile physical texture;
- exaggerated sports movement;
- miniature stadium environments;
- cinematic lighting and camera movement;
- franchise-color uniforms without unauthorized official marks;
- expressive poses;
- readable scoreboard graphics;
- original Big Exec VFX.

### Licensing boundary

V2 characters should be **position-based visual surrogates**, not exact athlete likeness recreations.

Avoid:

- official NFL/team logos without rights;
- copied uniforms;
- player headshots;
- facial likeness recreation;
- broadcast footage;
- official highlight clips.

Use:

- original QB/RB/WR/TE/K/DST clay characters;
- Big Exec franchise colors;
- original stadiums;
- original effects;
- factual statistics/player names only within applicable data rights.

## 5. Signature Effects Library

### ROCKET ARM

**Trigger examples:** passing TD, 40+ yard completion, top-impact QB moment.

Visual:

- QB wind-up;
- shoulder/arm charge glow;
- ball release flare;
- rocket-like ball trail;
- camera whip/follow;
- catch/impact flash.

### FIRE TRAIL

**Automatic trigger:** `rushing_td && yards >= 20`

Visual:

- handoff;
- burst through the gap;
- effect starts once the runner breaks free;
- fire/smoke speed trail;
- defenders falling behind;
- end-zone finish.

### MAGNET HANDS

For major receiving moments:

- catch focus;
- brief time dilation;
- ball-to-hands snap/ease;
- catch glow;
- turn upfield.

### SHOCKWAVE

For interception, sack, turnover, or defensive TD:

- impact ring;
- camera shake;
- field-light pulse;
- possession/color transition.

### EXEC CELEBRATION

For major wins/championships:

- stadium light sweep;
- gold confetti;
- franchise crest;
- celebrating clay characters;
- stadium/legacy unlock callout where appropriate.

## 6. Story Types

The story engine must classify a matchup deterministically before rendering.

| Type | Trigger concept | Narrative emphasis |
|---|---|---|
| `standard` | no stronger classifier | best plays + winner |
| `blowout` | margin above threshold | domination |
| `nail_biter` | final margin under threshold | tension |
| `comeback` | winner materially trailed | reversal |
| `rivalry` | designated rivalry | history + pride |
| `upset` | lower-ranked team beats materially higher-ranked team | disruption |
| `superstar_carry` | unusually concentrated scoring contribution | hero performance |
| `chaos` | Chaos Week / Giant Killer context | upset theater |
| `championship` | title final | legacy |

A matchup may carry multiple tags, but one **primary story type** controls scene ordering.

## 7. Recap Moment Contract

```ts
type RecapMomentKind =
  | 'passing_td'
  | 'rushing_td'
  | 'receiving_td'
  | 'defensive_td'
  | 'interception'
  | 'sack'
  | 'long_play'
  | 'lead_change'
  | 'dagger'
  | 'mvp';

type RecapMoment = {
  id: string;
  kind: RecapMomentKind;
  order: number;
  franchiseId: string;
  athleteId?: string;
  athleteName?: string;
  position?: string;
  yards?: number;
  fantasyPoints?: number;
  touchdown?: boolean;
  scoreBefore?: number;
  scoreAfter?: number;
  importance: number;
  visualEffect?: 'rocket_arm' | 'fire_trail' | 'magnet_hands' | 'shockwave' | 'gold_burst';
  source: 'provider_event' | 'derived_stats' | 'matchup_state';
};
```

### Truth rule

AI may narrate deterministic facts after the moment list is built.

AI may not invent:

- a play;
- yards;
- score;
- winner;
- lead change;
- comeback;
- MVP;
- standings implication.

## 8. Recap Payload V2

```ts
type RecapPayloadV2 = {
  recapVersion: 2;
  leagueId: string;
  leagueSeasonId: string;
  matchupId: string;
  week: number;
  storyType: string;
  storyTags: string[];
  home: FranchiseVisual;
  away: FranchiseVisual;
  finalScore: {
    home: number;
    away: number;
    winnerFranchiseId: string;
    margin: number;
  };
  moments: RecapMoment[];
  mvp?: {
    athleteId?: string;
    athleteName: string;
    franchiseId: string;
    position?: string;
    fantasyPoints: number;
  };
  context?: {
    rivalryRecord?: string;
    standingsImpact?: string;
    playoffImpact?: string;
    achievementUnlock?: string;
    stadiumUnlock?: string;
  };
};
```

## 9. Scene Library V2

Required MVP scene types:

1. `cold_open`
2. `franchise_matchup_intro`
3. `story_setup`
4. `passing_play`
5. `rushing_play`
6. `receiving_play`
7. `defensive_play`
8. `turning_point`
9. `score_progression`
10. `final_dagger`
11. `final_score`
12. `mvp_spotlight`
13. `legacy_unlock`
14. `end_card`

### Fallback rule

A recap may never degrade into a sequence of only text slides.

If event detail is sparse, use:

- a generic position-specific clay football action based on verified stat profile;
- score progression;
- final score;
- MVP;
- legacy scene.

## 10. Default 45–50 Second Shot Template

| Time | Scene | Purpose |
|---|---|---|
| 0:00–0:03 | Cold open | Immediate hook |
| 0:03–0:07 | Franchise matchup | Establish franchises |
| 0:07–0:10 | Story setup | Rivalry/upset/comeback context |
| 0:10–0:16 | Hero play #1 | Major action |
| 0:16–0:22 | Hero play #2 | Major action |
| 0:22–0:28 | Turning point | Momentum change |
| 0:28–0:32 | Score progression | Explain game arc |
| 0:32–0:38 | Final dagger | Closing action |
| 0:38–0:43 | Final score | Result |
| 0:43–0:48 | MVP / legacy | Player + stadium/history |
| 0:48–0:50 | End card | Big Exec / Locker Room |

## 11. Character System

Create modular original clay characters for:

- QB;
- RB;
- WR/TE;
- K;
- DB;
- LB/DL;
- generic D/ST group.

Variation dimensions:

- skin tone;
- body proportions;
- helmet silhouette;
- jersey/helmet franchise colors;
- sleeve combinations;
- simple visible hair/facial-hair silhouettes where useful.

Required poses:

- idle;
- QB dropback;
- throw;
- run;
- catch;
- tackle;
- intercept;
- celebrate;
- dejected.

## 12. Stadium Integration

Recaps should reflect franchise progression where possible:

- base stadium;
- rivalry environment feature;
- championship banner;
- Giant Killer feature;
- Redemption feature;
- other earned stadium progression.

Historical playback must not falsely show a future unlock as if it existed in that historical season unless labeled as a present-day legacy view.

## 13. Audio

Required audio categories:

- intro hit;
- crowd bed;
- throw/ball whoosh;
- Rocket Arm sound;
- Fire Trail speed/fire sound;
- catch impact;
- Shockwave;
- touchdown sting;
- final score sting;
- celebration.

Use original/licensed/royalty-safe assets.

Voiceover is optional after visual V2 works.

## 14. Output Formats

Keep current renderer support for:

- `9:16` — primary mobile/share format;
- `16:9` — matchup page/desktop/weekly-show format.

Current 720×1280 and 1280×720 are acceptable beta starting points. Evaluate 1080×1920 after performance measurement.

## 15. Recap Tiers

### Quick — 15–25 seconds
- intro;
- one hero play;
- final;
- MVP.

### Standard — 35–55 seconds
- 2–4 hero plays;
- story arc;
- final;
- MVP.

### Featured — 50–75 seconds
- 4–6 hero plays;
- stronger rivalry/history context;
- premium intro/outro.

## 16. Product Controls

Commissioner/admin:

- Generate recap
- Preview
- Regenerate
- Quick / Standard / Featured
- Hype / Rivalry / Funny / Clean tone
- Publish / Unpublish

League member:

- Play
- Replay
- Share
- Open Matchup
- Open Locker Room
- View franchise legacy

## 17. Acceptance Criteria

### Technical

- [ ] Winner equals authoritative matchup winner.
- [ ] Final score equals authoritative matchup score.
- [ ] Every visualized event maps to deterministic data.
- [ ] Every normal recap contains at least one reenacted action scene.
- [ ] Standard recap contains at least two action scenes when data supports them.
- [ ] No more than 30% of runtime is dominated by static/text-only presentation.
- [ ] 9:16 and 16:9 both render.
- [ ] R2 media URL records successfully.
- [ ] Worker can retry failure.
- [ ] Render/scene schema version is stored.

### Creative

- [ ] Mini claymation character style is obvious.
- [ ] Franchise identity is obvious without reading fine print.
- [ ] Passing hero play can show Rocket Arm.
- [ ] 20+ yard rushing TD can show Fire Trail.
- [ ] Defensive turnover can show Shockwave.
- [ ] Final win contains physical celebration, not only text.
- [ ] Video feels like sports action rather than a presentation deck.

## 18. Beta Gate

V2 is beta-ready when these five test archetypes all render and pass truth + creative QA:

1. blowout;
2. nail-biter;
3. comeback;
4. rivalry;
5. championship/legacy.

## 19. North-Star Recap Question

> **Would a manager who already knows the final score still want to watch this?**

If the answer is no, the recap has not yet become entertainment.
