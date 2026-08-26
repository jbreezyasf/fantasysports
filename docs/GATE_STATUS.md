# Big Exec Authoritative Gate Status

> **CANONICAL STATUS DOCUMENT**
>
> Gate numbering is controlled by `docs/PRODUCT_PRD.md`. The older Gate 1–5 numbering is retired.
>
> A gate may only be marked **PASS** using current supporting evidence. Historical PASS labels do not transfer automatically into this gate model.
>
> **Current posture:** REVALIDATION REQUIRED. Codex/development must inspect the current repository, active deployment, production database, and actual user flows before changing a gate status.

---

## Gate 0 — Platform Trust

**STATUS:** REVALIDATION REQUIRED

### Required PASS evidence

- version-controlled database migrations reconciled with production;
- CI runs the repository's real install/typecheck/test/build path;
- production/staging/preview environment boundaries are explicit;
- secrets and public configuration are handled safely;
- sensitive RPC/auth boundaries are tested;
- unattended scheduler/jobs are proven;
- observability exists for beta-critical failures;
- production deployment verification is part of the release path.

### Evidence log

Populate only after current-state inspection.

---

## Gate 1 — Draft Night Works

**STATUS:** NOT PASSED

### Must prove

- complete fantasy-eligible player pool;
- rankings;
- personal queue;
- server-authoritative timer;
- autopick;
- realtime pick propagation;
- reconnect/recovery;
- duplicate-pick protection;
- commissioner pause;
- commissioner correction/undo with audit trail;
- full 10-manager production-equivalent draft;
- complete legal rosters at finish.

### Evidence log

Populate only after execution.

---

## Gate 2 — Team Management Works

**STATUS:** NOT PASSED

### Must prove

- roster management;
- lineup management;
- individual kickoff locks;
- free-agent add/drop;
- inverse-standings waiver processing;
- trade deadline enforcement;
- complete trade state lifecycle;
- atomic ownership changes;
- mobile and desktop usability.

### Evidence log

Populate only after execution.

---

## Gate 3 — Game Day Works

**STATUS:** NOT PASSED

### Must prove

- current-season game/stat ingestion;
- 6-point touchdown scoring across supported TD categories;
- fantasy-player score calculation;
- D/ST calculation;
- lineup/matchup score calculation;
- acceptable score latency;
- simultaneous games;
- refresh/reconnect behavior;
- finalization;
- stat corrections and audit trail.

### Evidence log

Populate only after execution.

---

## Gate 4 — Season Runs Itself

**STATUS:** NOT PASSED

### Must prove

- Weeks 1–9 Circuit;
- Rivalry Week;
- Revenge Week;
- Position Week;
- Chaos Week;
- Judgment Week;
- official standings;
- all-play where required;
- weekly awards;
- playoff seeding;
- Redemption tournament;
- championship;
- automatic transitions;
- season close;
- unattended weekly operation.

### Evidence log

Populate only after execution.

---

## Gate 5 — League Feels Alive

**STATUS:** NOT PASSED

### Must prove

- Locker Room;
- public league events;
- rivalry history/context;
- all-play and rankings presentation;
- awards/achievements;
- stadium/franchise progression;
- useful notifications;
- deterministic story events;
- Recap V2 action-first visual quality;
- polished mobile/desktop experience.

### Evidence log

Populate only after execution.

---

## Gate 6 — Friend Beta

**STATUS:** NOT STARTED

Entry requires Gates 0–5 to satisfy the beta-entry acceptance criteria defined in the PRD.

### Beta measures

- draft completion;
- valid weekly lineup rate;
- weekly active managers;
- transactions;
- social activity;
- eliminated-manager retention;
- recap use/share behavior;
- defect rate;
- enjoyment;
- renewal intent.

---

## Gate 7 — Commercialization

**STATUS:** NOT STARTED

Requires legal/trademark/data-rights/privacy/moderation/app-store review plus a validated cost model and unit economics.

---

# Status Update Rule

When updating any gate, record:

1. date;
2. exact environment/deployment/commit;
3. test performed;
4. expected result;
5. actual result;
6. supporting logs/query/test output;
7. remaining blockers.

Do not use a simulation result as production proof.
