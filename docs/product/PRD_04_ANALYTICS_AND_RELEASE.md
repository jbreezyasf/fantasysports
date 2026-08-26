# Big Exec PRD v1.2 — Sections 47–53

# 47. Analytics

## Activation
- invites accepted;
- franchise created;
- draft participation;
- draft completion;
- first valid lineup.

## Engagement
- weekly active managers;
- valid lineup rate;
- add/drop activity;
- waiver activity;
- trades;
- Locker Room activity;
- rivalry interaction;
- all-play views;
- recap views.

## Retention
- managers inactive 7+ days;
- eliminated-manager lineup rate;
- Week 1 → Week 10 retention;
- Week 14 → Week 17 retention;
- season renewal;
- franchise return.

## Import future metrics
- import started;
- import completed;
- seasons imported;
- unresolved mapping rate;
- imported league → current Big Exec league conversion.

---

# 48. V1 Out of Scope

Do not allow scope creep around:

- sports betting;
- odds;
- props;
- real-money wagering;
- official league logos;
- official team logos;
- player photography;
- official highlights;
- general private DMs;
- complicated dynasty mechanics;
- arbitrary XP;
- pay-to-win;
- generative AI deciding scores;
- every league size;
- every sport at launch;
- automated historical import from every provider before the standalone beta works;
- companion mode as a replacement for the standalone Season 1 product.

---

# 49. North Star

> **How many Big Exec leagues remain socially and competitively active throughout the entire season?**

Supporting indicators:

- active managers per league;
- valid weekly lineups;
- eliminated-manager participation;
- league interactions;
- all-play participation;
- rivalry participation;
- competition participation;
- renewal intent;
- franchise return rate.

---

# 50. Defensible Product Loop

**Draft  
→ Own  
→ Manage  
→ Compete  
→ Talk  
→ Build Rivalries  
→ Create History  
→ Earn Recognition  
→ Watch the Story  
→ Build Legacy  
→ Return Next Season**

For established leagues, future import adds:

**Bring Your History  
→ Keep Building It Here**

---

# 51. Immediate Product Direction

Without implementing changes in this PRD session, the next development phase should be governed by this sequence:

1. establish the clean current-state evidence log;
2. fix proven security and environment risks;
3. make the 10-manager draft production-ready;
4. internally QA the complete draft;
5. complete roster/free-agent/waiver/trade flows;
6. build and validate current 2026 game/stat ingestion;
7. replay historical real data through the full weekly pipeline;
8. shadow-test current games;
9. automate season transitions;
10. perform full internal season rehearsal;
11. polish every beta-critical screen against the established Big Exec brand;
12. bring in the friend beta only after foundational acceptance criteria pass.

History import design can be refined in parallel as research/data-model work, but it must not consume the critical path until the standalone beta foundation is secure.

---

# 52. Research Sources for History Import

## Primary / official

- Sleeper API documentation: `https://docs.sleeper.com/`
- Yahoo Fantasy Sports API documentation: `https://developer.yahoo.com/fantasysports/guide/`
- Yahoo API overview: `https://developer.yahoo.com/api/`
- MyFantasyLeague feature/history overview: `https://home.myfantasyleague.com/features`

## Secondary / community research

Community discussions reviewed during v1.1 research showed recurring demand for:
- league history preservation;
- cross-platform continuity;
- head-to-head history;
- championships;
- all-time standings;
- matchups;
- streaks;
- draft history;
- transaction/trade-tree history.

ESPN import feasibility should be treated as **unverified for a supported commercial integration** until a sanctioned technical path is identified.

---

# 53. Final Product Position

Most fantasy platforms already know how to run a roster.

Big Exec must run a trustworthy fantasy league **and** make the group feel like they own a persistent sports universe together.

> **Most fantasy platforms help you manage a roster. Big Exec lets you run a franchise, build rivalries, compete for something all season, preserve the history that matters, and leave behind a legacy.**

The fantasy engine earns trust.

The competition system creates stakes.

The social system creates relationships.

The visual system creates identity.

The entertainment system creates emotion.

The history system creates continuity.

The anti-churn system makes sure losing the championship does not mean losing the reason to play.

## **Everybody drafts. Big Execs build franchises.**
