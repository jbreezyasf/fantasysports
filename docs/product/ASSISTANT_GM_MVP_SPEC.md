# Big Exec Assistant GM — MVP Product & Build Spec

**Status:** APPROVED EXPERIMENT / FEATURE BRANCH  
**Date:** August 31, 2026  
**Initial sport:** Pro Football  
**Role:** Private, per-manager Assistant GM  

## 1. Product role

The Big Exec manager is the franchise owner/GM. The Assistant GM is the one trusted front-office person allowed to challenge the owner, disagree with a move, keep receipts, and talk a little trash about players while staying loyal to the franchise.

This is **not** positioned as an AI coach. The user owns the franchise and makes every roster decision.

### Character target

- trusted veteran front-office partner;
- favorite uncle / dad energy;
- grumpy enough to be funny;
- direct but not demeaning toward the manager;
- roasts players and situations more than the owner;
- admits misses;
- celebrates good owner decisions without becoming flattering or generic;
- always speaks from the perspective of protecting *our franchise*.

Examples of acceptable tone:

- “Boss, we need a receiver. I know you like your RB room. You also have enough running backs to start a small farm.”
- “Your boy gave us 4.8 again. Loyalty is a fine quality. It is not a roster strategy.”
- “That was a hell of a pickup. Don’t get used to me saying that.”

Unacceptable:

- personal insults toward the manager;
- harassment, slurs, threats, or humiliation;
- invented injuries, stats, roster state, transactions, or league facts;
- pretending a recommendation was executed;
- posting publicly without manager approval.

## 2. Authority boundary

Fantasy Core remains authoritative for rosters, lineups, scores, standings, transactions, locks, and official outcomes.

The Assistant GM may:

- recommend;
- explain;
- compare;
- challenge;
- summarize;
- remember prior recommendations when persistence is added;
- generate private personality text around deterministic inputs.

The Assistant GM may **not**:

- add/drop a player;
- submit a waiver claim;
- change a lineup;
- propose/accept/reject a trade;
- alter a draft pick;
- determine fantasy scores or official results.

Every transaction remains an explicit owner action through existing Big Exec workflows.

## 3. MVP objective

Get a safe version into the product quickly enough to test whether managers:

1. understand and enjoy the Assistant GM relationship;
2. ask for roster help;
3. act on recommendations;
4. remain more engaged when their team is struggling;
5. prefer the character over generic fantasy advice.

The MVP must work before a paid fantasy-intelligence vendor is required.

## 4. MVP data sources

### Current Big Exec data

Use only current server-side Big Exec league data for factual claims:

- current league and current season;
- authenticated manager membership;
- manager-owned franchise;
- roster entries;
- current lineup rows;
- player ownership / availability;
- Big Exec internal rankings built from `fantasy_player_scores` / `fantasy_team_scores` when available;
- deterministic fallback rankings when score data is absent.

### Future intelligence adapter

The Assistant GM recommendation contract must allow later enrichment from licensed external sources such as:

- projections;
- rest-of-season projections;
- injuries/practice participation;
- depth chart role;
- news;
- usage/snap/target/carry data;
- multi-sport equivalents.

No vendor-specific fields should be required by the MVP UI.

## 5. Recommendation architecture

```text
Big Exec league truth
        ↓
Deterministic Assistant GM decision context
        ↓
Structured recommendations / warnings / confidence
        ↓
Personality layer
        ↓
Private Assistant GM conversation
```

The LLM must not be asked to discover roster truth from memory or invent unavailable data.

## 6. MVP capabilities

### A. Per-manager on/off

- feature is private to the authenticated manager;
- MVP setting may be browser-local, keyed by authenticated user + league;
- production persistence moves to Supabase after UX validation;
- when OFF, no generative call is made.

### B. Front-office brief

On entry, show a deterministic briefing containing:

- current franchise;
- roster count;
- position needs based on roster configuration;
- lineup holes for the selected/current week;
- top available targets from Big Exec ranking data;
- explicit note when richer projection/injury/news data is not yet connected.

### C. Waiver / free-agent help

Answer questions such as:

- Who should I pick up?
- What position do I need?
- Who are the best available players?
- Who would I drop first?

MVP recommendation quality is limited to current Big Exec ranks/score history and roster construction. The Assistant GM must label that limitation instead of pretending to know current injuries/projections that are not present.

### D. Lineup help

- identify empty required starter slots;
- compare roster construction;
- never claim a player has a favorable matchup unless that signal exists in supplied data;
- link the manager back to existing Team HQ to make the actual lineup change.

### E. Trade discussion

MVP may discuss roster needs and known league rosters. It must not calculate a false “trade value” score unless a deterministic trade-value source is later added.

### F. Private personality conversation

Quick prompts:

- Who should I grab?
- What’s wrong with my roster?
- Who should I start?
- Give me the front-office brief.

Free-form chat is allowed but constrained to the supplied league context.

## 7. MVP memory

For the fastest testable version:

- conversation history is stored in browser local storage per authenticated manager + league;
- no cross-user or public memory;
- no server-side long-term “receipts” yet.

Production memory phase should add durable, auditable records for:

- recommendations;
- owner accepted/ignored decisions;
- outcomes;
- Assistant GM misses/hits;
- manager risk preferences;
- recurring roster patterns.

## 8. AI model behavior

Default model for free-form private conversation: a cost-sensitive model suitable for high-volume text.

If `OPENAI_API_KEY` is missing or the model call fails:

- the feature must fail soft;
- deterministic briefing/recommendation data still displays;
- a personality-styled deterministic fallback response is returned;
- the manager is never told a roster fact that was not supplied by Big Exec.

## 9. Privacy / permissions

- server action authenticates the caller;
- caller must be a member of the requested league;
- Assistant GM data is scoped to that league/member;
- no private Assistant GM conversation is posted to Locker Room;
- no other league manager can request another manager’s private Assistant GM context;
- client-provided roster facts are never trusted as authority.

## 10. UX placement

MVP route:

- `/assistant-gm` — convenience route to the authenticated manager’s league;
- `/leagues/[leagueId]/assistant-gm` — private Assistant GM office.

Visual direction:

- extend existing Big Exec Front Office / luxury command-center styling;
- use existing components/classes first;
- no new global-navigation destination in the MVP;
- Assistant GM remains contextual to the Front Office, not one of the five canonical global destinations.

## 11. Analytics to add after interaction validation

- Assistant GM enabled rate;
- weekly active Assistant GM users;
- questions per active manager;
- recommendation CTA clicks;
- waiver/add-drop activity after Assistant GM use;
- lineup completion after Assistant GM use;
- eliminated-manager Assistant GM use;
- Week 6+ retention correlation;
- thumbs-up/down or “helpful” rating;
- accepted vs ignored recommendation rate once decision receipts exist.

## 12. Acceptance criteria — MVP branch

### Functional

- [ ] authenticated manager can open `/assistant-gm`;
- [ ] user is redirected to a league they actually belong to;
- [ ] non-member cannot open another league’s Assistant GM;
- [ ] Assistant GM shows the user’s franchise/roster context;
- [ ] top available targets exclude rostered players;
- [ ] deterministic position-need logic has unit tests;
- [ ] user can turn Assistant GM on/off;
- [ ] OFF prevents free-form AI calls;
- [ ] quick prompts work;
- [ ] free-form question works when `OPENAI_API_KEY` is present;
- [ ] deterministic fallback works without the key;
- [ ] no transaction is executed by Assistant GM.

### Truth / safety

- [ ] every factual roster/availability claim comes from current Big Exec data loaded server-side;
- [ ] unavailable projection/injury/news context is explicitly labeled as unavailable;
- [ ] LLM output is framed as advice, not official result;
- [ ] server action re-fetches context instead of trusting hidden client JSON;
- [ ] no public Locker Room posting occurs.

### QA

- [ ] `npm test` passes;
- [ ] `npm run typecheck` passes;
- [ ] `npm run build` passes;
- [ ] preview route tested authenticated on desktop;
- [ ] preview route tested at mobile viewport;
- [ ] refresh preserves local on/off + conversation state;
- [ ] unauthorized league access is rejected/redirected.

## 13. Next phase after MVP signal

1. persist settings + memory in Supabase with RLS;
2. add recommendation receipts and outcome tracking;
3. add licensed projection/injury/news provider through a vendor-neutral intelligence adapter;
4. add richer start/sit and trade recommendation engines;
5. add game-day event triggers with rate limits;
6. add optional personality intensity modes;
7. extend the same Assistant GM contract to Basketball, Baseball, Hockey, and later sports.
