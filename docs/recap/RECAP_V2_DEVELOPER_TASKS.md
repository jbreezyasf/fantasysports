# Big Exec Recap Video V2 — Developer Task Breakdown

**Version:** 1.0  
**Date:** August 23, 2026  
**Grounded against current repository:** `jbreezyasf/fantasysports`

## 1. Current Architecture to Keep

The current renderer already provides proven infrastructure.

### Existing files

- `services/recap-renderer/src/types.ts`
  - `RecapScene`
  - `RenderJob`
  - `RenderPackage`
  - provider-neutral `RecapRenderer`

- `services/recap-renderer/src/worker.ts`
  - claims jobs through `claim_recap_render`
  - hydrates `recap_scripts`
  - hydrates ordered `recap_scenes`
  - completes/fails render jobs

- `services/recap-renderer/src/selfHosted.ts`
  - PixiJS browser bundle via esbuild
  - Playwright headless Chromium
  - canvas frame capture
  - FFmpeg H.264 MP4 encoding
  - optional Cloudflare R2 upload

- `services/recap-renderer/src/browser/render.ts`
  - current text-forward visual composition
  - primary creative-rebuild target

### Architectural decision

Keep queue, worker, FFmpeg, R2, and renderer interface unless benchmark evidence shows they cannot meet the V2 performance target.

The first problem to solve is **what is rendered**, not immediately **how jobs are queued or encoded**.

---

# 2. Workstream A — Recap Truth & Story Engine

## A1. Inventory authoritative inputs

**Priority:** P0  
**Owner:** Backend / QA

Verify exact production sources for:

- final matchup score;
- winner;
- roster contribution;
- player fantasy-point totals;
- touchdown type;
- touchdown yards;
- provider event/play detail;
- rivalry status/history;
- standings context;
- achievements;
- stadium unlocks.

### Acceptance

Every desired V2 scene has one of:

1. proven direct data;
2. deterministic derived data;
3. explicit visual fallback.

No scene spec may quietly assume unavailable event detail.

## A2. Add recap schema/version

**Priority:** P0

Recommended:

- existing renderer output = `recap_version: 1`
- clay/action renderer = `recap_version: 2`

### Acceptance

- old stored recaps remain playable;
- V2 scenes are never accidentally interpreted by V1 code;
- template/render version is persisted for reproducibility.

## A3. Create typed `RecapPayloadV2`

**Files:**

- `services/recap-renderer/src/types.ts`
- shared package/backend module used for recap creation

Add:

- primary story type;
- story tags;
- typed moments;
- franchise visual data;
- final score;
- MVP;
- legacy context;
- optional audio cues.

### Acceptance

The story-generation boundary is typed and validated. Official facts are not carried only as arbitrary free-form payload strings.

## A4. Deterministic story classifier

Implement:

- standard;
- blowout;
- nail-biter;
- comeback;
- rivalry;
- upset;
- superstar carry;
- Chaos/Giant Killer;
- championship.

### Acceptance

Unit fixture for every classifier. Fixed inputs always return the same classification.

## A5. Deterministic moment selector

Candidate ranking factors:

- fantasy scoring contribution;
- touchdown;
- yardage;
- lead impact;
- late-game importance;
- rivalry/championship context;
- rarity;
- final dagger.

### Acceptance

- deterministic ordering;
- no duplicate moment;
- every moment stores its source;
- every selected moment carries an importance score.

## A6. MVP selector

Use authoritative fantasy contribution and deterministic tie-breaking.

---

# 3. Workstream B — Scene Architecture

## B1. Split monolithic `render.ts`

Current target:

`services/recap-renderer/src/browser/render.ts`

Recommended structure:

```text
src/browser/
  render.ts
  core/
    camera.ts
    easing.ts
    stage.ts
    text.ts
    color.ts
  scenes/
    ColdOpen.ts
    MatchupIntro.ts
    StorySetup.ts
    PassingPlay.ts
    RushingPlay.ts
    ReceivingPlay.ts
    DefensivePlay.ts
    TurningPoint.ts
    ScoreProgression.ts
    FinalScore.ts
    MvpSpotlight.ts
    LegacyUnlock.ts
    EndCard.ts
  characters/
    ClayPlayer.ts
    poses.ts
    palette.ts
  effects/
    RocketArm.ts
    FireTrail.ts
    MagnetHands.ts
    Shockwave.ts
    GoldCelebration.ts
  stadium/
    Field.ts
    Crowd.ts
    Scoreboard.ts
    Lights.ts
    LegacyFeatures.ts
```

### Acceptance

`render.ts` becomes scene orchestration rather than a single file containing every drawing rule.

## B2. Reusable camera system

Build helpers for:

- pan;
- zoom;
- shake;
- whip;
- focus target;
- slow motion/eased time.

### Acceptance

At least two action scenes use the same camera abstraction.

## B3. Character rig abstraction

Minimum components:

- head;
- torso;
- arms;
- legs;
- helmet;
- football;
- shadow;
- franchise-color uniform layers.

Required poses:

- idle;
- set/dropback;
- throw;
- sprint;
- catch;
- tackle;
- interception;
- celebrate;
- dejected.

### Acceptance

One character implementation can be recolored/reproportioned without copying scene code.

---

# 4. Workstream C — Signature VFX

## C1. Rocket Arm

**Automatic candidate:** passing hero moment.

Components:

- charge glow;
- throwing-arm energy;
- release flare;
- ball trail;
- camera follow;
- catch impact.

### Acceptance

Visible and readable in 9:16 and 16:9.

## C2. Fire Trail

**Locked automatic rule:** `rushing_td && yards >= 20`

Components:

- normal handoff start;
- acceleration threshold;
- flame/smoke particles after breakout;
- defender lag/parallax;
- end-zone burst.

### Tests

- 19-yard TD → no automatic Fire Trail
- 20-yard TD → Fire Trail
- 50-yard TD → Fire Trail

## C3. Magnet Hands

For receiving hero moment:

- catch focus;
- short time dilation;
- hand glow;
- ball snap/ease;
- turn upfield.

## C4. Shockwave

For turnover, sack, defensive TD:

- impact ring;
- camera shake;
- lighting pulse;
- possession transition.

## C5. Gold Celebration

For final/championship:

- stadium light sweep;
- gold confetti;
- winner pose;
- franchise crest;
- earned legacy feature when relevant.

---

# 5. Workstream D — Clay Visual Asset Kit

## D1. Choose beta asset strategy

### Option A — Procedural Pixi clay look

Pros:
- fastest iteration;
- no external animation renderer;
- easy recoloring.

Cons:
- visual ceiling lower.

### Option B — Pre-rendered sprite/sequence assets

Pros:
- stronger physical/clay look;
- can create more sophisticated poses externally.

Cons:
- larger asset library;
- more storage/asset management.

### Recommended beta path

**Hybrid:** reusable prebuilt clay-style character parts/poses + PixiJS movement, lighting, camera, particles, scoreboard and compositing.

## D2. Create position character kit

Required:

- QB;
- RB;
- WR/TE;
- defender;
- generic D/ST group.

Variation:

- skin tones;
- body sizes;
- helmet silhouette;
- franchise colors.

### Licensing acceptance

No official logo or exact copied NFL uniform.

## D3. Stadium kit

Create:

- field base;
- end zone;
- crowd layers;
- tunnel;
- stadium lights;
- scoreboard;
- championship banner location;
- rivalry feature hooks;
- Giant Killer/Redemption hooks.

---

# 6. Workstream E — Audio

## E1. Extend render package with audio timeline

```ts
type AudioCue = {
  atMs: number;
  assetKey: string;
  gain?: number;
};
```

## E2. Add licensed/original SFX

- intro hit;
- crowd;
- ball throw;
- Rocket Arm;
- Fire Trail;
- catch;
- tackle/turnover;
- touchdown;
- final score;
- celebration.

## E3. Update FFmpeg mix

Current `selfHosted.ts` produces video-only H.264.

Update it to:

- add music/SFX inputs;
- mix timeline;
- normalize audio;
- encode AAC;
- keep H.264/yuv420p/faststart.

### Acceptance

Output plays on Android Chrome, iPhone/Safari-class playback, and desktop browsers.

A missing optional SFX must use a documented fallback, not silently fail the render.

---

# 7. Workstream F — Renderer Performance

## F1. Benchmark current frame model

Current path:

PixiJS canvas → Playwright screenshot → PNG sequence → FFmpeg.

Measure for 45-second clay recap:

- total render time;
- browser capture time;
- FFmpeg time;
- CPU;
- memory;
- temp disk;
- R2 upload time;
- output size.

Test both:

- 720×1280, capture 12 FPS, encode 24 FPS;
- 1280×720, capture 12 FPS, encode 24 FPS.

## F2. Beta performance target

Initial target:

**45-second recap renders within approximately 2–4 minutes on the current VPS under single-job load.**

This is a target to validate, not a current fact.

If slower:

1. reduce particle cost;
2. optimize textures;
3. avoid expensive per-frame filters;
4. pre-render repetitive character motion;
5. only then evaluate deeper renderer changes.

Do not replace architecture before measurement.

---

# 8. Workstream G — Web/App Integration

## G1. Recap creation controls

Commissioner/admin:

- Quick / Standard / Featured;
- Hype / Rivalry / Funny / Clean;
- Generate;
- Preview;
- Regenerate;
- Publish.

## G2. Status states

Recommended:

- `story_pending`
- `queued`
- `rendering`
- `ready`
- `failed`

## G3. Viewer UI

Show:

- poster/thumbnail;
- video;
- final score;
- replay;
- share;
- matchup link;
- Locker Room link;
- franchise legacy link.

---

# 9. Workstream H — Historical Recaps

Use the five-season QA History Lab for:

- archived championship recap;
- rivalry retrospective;
- dynasty montage;
- stadium/legacy unlock;
- historical season-story testing.

### Truth rule

Synthetic fantasy fixtures are QA data. Never imply that a synthetic reenacted play is an actual historical NFL play unless a provider event confirms it.

---

# 10. Test Matrix

## Rendering

- 9:16
- 16:9
- long franchise names
- missing optional MVP fields
- sparse event detail
- 2 moments
- 5 moments
- rivalry
- comeback
- championship
- retry after failure

## Visual

- dark vs dark franchise colors
- light vs light colors
- same-color opponents
- character/background contrast
- text safe zones
- mobile crop
- effect visibility

## Truth

- final score
- winner
- TD type
- yards
- player fantasy points
- MVP
- rivalry record
- championship record
- stadium unlock

---

# 11. Initial File Plan

### Modify

- `services/recap-renderer/src/types.ts`
- `services/recap-renderer/src/browser/render.ts`
- `services/recap-renderer/src/selfHosted.ts`
- `services/recap-renderer/src/worker.ts` only if hydration contract changes

### Add

- `services/recap-renderer/src/browser/scenes/*`
- `services/recap-renderer/src/browser/characters/*`
- `services/recap-renderer/src/browser/effects/*`
- `services/recap-renderer/src/browser/stadium/*`
- `services/recap-renderer/src/browser/core/*`
- `services/recap-renderer/src/browser/audio/*`
- story-classification tests
- moment-selection tests
- scene render fixtures

### Database migration

Add as needed:

- recap version;
- typed story metadata;
- template version;
- audio cue metadata;
- thumbnail/poster metadata.

---

# 12. Deletion Authorization

Complete deletion/replacement in this project is approved when it materially helps build the product correctly.

### Safe candidates to replace

- V1 text-forward scene drawing logic;
- obsolete scene kinds after compatibility decision;
- helpers used only by the slide-style renderer.

### Do not delete without replacement proof

- render queue;
- render job history;
- provider-neutral renderer contract;
- R2 publishing;
- historical recap records;
- self-hosted worker that currently performs successful encoding.

Deletion should remove wrong behavior, not proven infrastructure.

---

# 13. Developer Definition of Done

- [ ] Story classifier deterministic and tested.
- [ ] Moment selector deterministic and tested.
- [ ] Recap schema V2 versioned.
- [ ] Passing action scene renders.
- [ ] Rushing action scene renders.
- [ ] Rocket Arm renders.
- [ ] Fire Trail 20+ yard rule passes tests.
- [ ] Final score/winner remain authoritative.
- [ ] MVP scene works.
- [ ] Clay visual language is consistent.
- [ ] 9:16 passes.
- [ ] 16:9 passes.
- [ ] Five History Lab archetypes render.
- [ ] R2 output is playable.
- [ ] Renderer health remains green.
- [ ] Failures are observable/retryable.
- [ ] User review confirms recap no longer feels like a motion-text slide presentation.
