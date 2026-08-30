# Big Exec UX/UI — P0 Page-by-Page Product Specification

**Status:** CANONICAL P0 PRODUCT REQUIREMENT  
**Date:** August 30, 2026  
**Applies to:** All authenticated Big Exec product surfaces, mobile and desktop  
**Product principle:** A working feature is not beta-ready until the user flow is understandable, visually coherent, responsive, and consistent with the Big Exec franchise experience.

---

## 1. P0 Decision

UX/UI is a **P0 workstream**, not end-of-project polish.

Engineering and UX/UI advance together:

> Build/validate the functional flow → complete its UX/UI → run mobile + desktop QA → then advance the gate.

A gate does not pass merely because its backend is functional if the associated manager/commissioner experience is confusing, visually unfinished, inaccessible, or inconsistent with this specification.

---

# 2. Global Product Shell

## 2.1 Persistent left-side navigation

All authenticated Big Exec pages use the same left-side navigation model.

### Primary navigation

1. **Front Office** — Home / franchise command center
2. **Matchup** — Current weekly matchup and live scoring
3. **Locker Room** — League conversation + public event feed
4. **League** — Standings, schedule, rankings, playoffs, history entry points
5. **Stadium** — Franchise environment, Owner's Office, legacy, banners, monuments, awards

These five destinations are the persistent primary product navigation.

### Secondary navigation

Secondary destinations should live under the appropriate primary destination instead of creating an overloaded permanent rail.

Examples:

- Schedule → League
- Standings → League
- History & Legacy → League
- Playoffs → League
- Commissioner controls → contextual commissioner menu
- Settings/Profile → manager/avatar menu
- Draft Room / Free Agency → Front Office action card
- Trade Room → Front Office action card
- League News → Front Office action card

### Desktop behavior

- Persistent left rail on every authenticated page.
- Big Exec brand mark at top.
- Primary destination icons + labels.
- Active destination visually obvious.
- Manager/profile/settings control at bottom of rail.
- Rail must not change order between pages.

### Mobile behavior

The product remains mobile-first, but the navigation concept stays left-oriented:

- top-left navigation trigger;
- opens a left-side navigation drawer/sheet;
- same five primary destinations and same order as desktop;
- do not replace the product with a different information architecture on mobile.

Persistent narrow icon rail may be evaluated for larger mobile/tablet layouts, but it must not reduce usable gameplay width below an acceptable touch experience.

---

# 3. Global Visual / IP Rules

## 3.1 Original Big Exec awards only

Across **all pages, stadiums, offices, recaps, illustrations, 3D assets, icons, trophies, banners, monuments, and animations**:

### Do not use

- the Super Bowl/Lombardi Trophy shape or silhouette;
- NFL award/trophy lookalikes;
- recognizable league/team championship trophy geometry;
- official NFL/team logos;
- copied uniforms;
- professional player photographs or recognizable player likenesses without rights.

### Do use

- original Big Exec awards;
- original franchise crests;
- original banners;
- original monuments/statues;
- original stadium/office environments;
- factual player names/statistics where permitted by provider/data rights.

## 3.2 Big Exec Champions Trophy

Big Exec must have its **own original league championship trophy**.

### Working product name

**Big Exec Champions Trophy**

### Visual direction

The trophy must not resemble the Lombardi Trophy or another major professional sports trophy.

Recommended original design language:

- architectural rather than football-shaped;
- black obsidian/charcoal central tower;
- angular gold crown/ring geometry around the upper third;
- vertical executive/monument silhouette;
- Big Exec mark integrated into the structure;
- no football mounted on a pedestal;
- no silver football silhouette;
- title year and franchise name on an original base/plaque system.

### Product behavior

- Winning a Big Exec League Championship adds the Champions Trophy to that franchise's **Owner's Office**.
- Repeat championships increase the visible championship history without duplicating an identical physical object unnecessarily unless the design intentionally supports a trophy collection.
- Championship years must be inspectable.
- Historical championships persist across seasons.
- The trophy should become a recognizable Big Exec brand asset across championship recaps, history, league news, and winner presentation.

---

# 4. Front Office / Home

The Front Office is the user's primary franchise command center.

It should answer immediately:

1. Who am I managing?
2. How is my franchise doing?
3. What league am I in?
4. What should I do next?
5. What is happening in my league?

## 4.1 Header

### Top-left

Display as a compact franchise identity block:

- **Team / Franchise Name** — highest visual priority
- **Manager Name**
- **Current Record** — W-L-T where applicable

Optional supporting elements:

- franchise crest;
- current rank;
- streak badge where meaningful.

### Top-right

Display:

- **League Name**

Optional secondary context:

- current week;
- season year;
- commissioner badge only when the current user is commissioner.

Do not let league context overpower franchise identity.

---

## 4.2 Four primary Front Office cards

The Front Office has four primary action cards:

1. **Draft Room / Free Agency** — stateful card
2. **Locker Room**
3. **Trade Room**
4. **League News**

The cards are major entry points, not small utility buttons.

---

## Card 1 — Draft Room → Free Agency

This card changes state based on the league lifecycle.

### Before draft is scheduled

Label: **Draft Room**

Show useful status such as:

- Draft not scheduled;
- Commissioner setup needed;
- Draft preparation available.

### Draft scheduled

Label: **Draft Room**

Show:

- date;
- local time/timezone;
- countdown;
- draft position if known;
- queue/prep status.

CTA: **Enter Draft Room** / **Prepare for Draft** depending on state.

### Draft live

The card becomes visually active/high-priority.

Show:

- **LIVE**;
- current round/pick;
- current manager;
- user's next-pick context.

CTA: **Enter Live Draft**

### Draft completed

The Draft Room card is retired as the primary action and automatically transforms into:

**Free Agency**

The user should not have to understand that the product has changed modes—the card changes for them.

### Free Agency card

Purpose:

> Acquire available players or submit waiver claims after the draft.

The card does **not** need to display the entire player pool.

It may show a compact useful preview:

- number of available/waiver players;
- next waiver-clear time;
- user's pending claims;
- one or two notable available players if trustworthy and useful.

CTA: **Open Free Agency**

Destination supports both:

- free agents;
- waiver-wire players.

---

## Card 2 — Locker Room

Purpose:

> Enter the league conversation and see what the league is reacting to.

Card preview may include:

- unread message/event count;
- latest manager post;
- latest public trade/waiver/award event;
- reaction activity.

CTA: **Enter Locker Room**

The card must feel social, not like an admin notification widget.

---

## Card 3 — Trade Room

Purpose:

> Start, review, negotiate, accept, reject, counter, or cancel player trades.

Card preview may include:

- open offers;
- offers awaiting the user;
- active private negotiation rooms;
- trade deadline countdown/status.

Example states:

- `2 Offers Waiting`
- `1 Active Negotiation`
- `Trading closes Nov 10`
- `Trading Closed`

CTA before deadline: **Enter Trade Room**

CTA after deadline: **View Trade History**

After the deadline, creation/acceptance controls are closed but historical trade rooms/results remain viewable where permitted.

---

## Card 4 — League News

**League News is preferred over Stadium as the fourth Front Office card.** Stadium already has a persistent left-nav destination and deserves its own world rather than being reduced to a utility card.

Purpose:

> Give the manager a living summary of what is happening right now in their league.

This is **Big Exec league news**, not generic copied NFL news.

News items can include deterministic/current league facts such as:

- standings movement;
- accepted trades;
- waiver claims/results where public;
- biggest fantasy performances of the week;
- highest team score;
- closest matchup;
- biggest blowout;
- rivalry result;
- Giant Killer/Chaos result;
- weekly awards;
- playoff-clinch/elimination updates;
- championship result;
- new stadium/legacy unlock;
- new recap available.

### News design

Use a sports newsroom/broadcast-card feel with clear timestamp/week context.

AI may help narrate these facts, but cannot invent league events.

CTA: **Open League News**

---

# 5. Matchup Page

Primary purpose:

> Understand the current competition at a glance, then inspect the players driving it.

## Must show

- both franchise names/crests;
- live/final fantasy score;
- manager names where useful;
- players remaining;
- starters and individual fantasy contributions;
- real-game status for each relevant player;
- current matchup status: upcoming / live / final;
- matchup story indicators only when deterministic;
- link to recap once available.

## Visual direction

Sports-broadcast energy, not spreadsheet-first.

Use:

- strong score hierarchy;
- franchise color identity;
- visual momentum/context;
- readable player rows/cards;
- clear live indicators.

Do not sacrifice score truth/readability for decoration.

---

# 6. Free Agency / Players Page

This is the post-draft acquisition center reached from the Front Office stateful card.

## Core categories

- **AVAILABLE**
- **WAIVERS**
- **ROSTERED**

## Player row/card must prioritize

- player name;
- position;
- pro team abbreviation/data as permitted;
- Big Exec rank / positional rank where available;
- current fantasy information;
- availability state;
- waiver-clear time where relevant;
- action: Add / Claim / Withdraw / Rostered.

## Interaction

- strong search;
- position filters;
- sorting;
- beginner-readable availability explanation;
- roster impact before confirm;
- drop-player selection when required;
- pending waiver state is obvious.

Do not force the user to scroll the entire player database to find a basic target.

---

# 7. Trade Room

Trade Room is a first-class Big Exec experience.

It should feel like a private Front Office negotiation environment rather than a generic transaction form.

## Trade Room landing page

Show:

- incoming offers;
- outgoing offers;
- active negotiations;
- completed trades;
- rejected/cancelled trades;
- trade deadline and countdown/status.

## Create trade flow

1. choose opposing franchise;
2. compare rosters side-by-side;
3. select assets offered;
4. select assets requested;
5. review both sides;
6. submit offer.

## Private trade room

Only authorized franchise participants may view negotiation content.

Support lifecycle states:

- proposed;
- viewed;
- countered;
- accepted;
- rejected;
- cancelled;
- expired/closed by deadline where applicable.

Accepted trade posts a public deterministic league event; private negotiation text stays private.

After the trade deadline:

- no new offers;
- no accepting old offers;
- reject/cancel/history remains available as appropriate.

---

# 8. Locker Room

Purpose:

> League group chat + public fantasy event feed.

It should feel like people are hanging out around their league, not reading a database activity log.

## Must distinguish visually

- human manager messages;
- accepted trade events;
- waiver/free-agent events where public;
- weekly awards;
- matchup finals;
- rivalry results;
- recap releases;
- championship/legacy events.

## Interaction

- reactions;
- reply/mention behavior if supported;
- unread state;
- clear timestamps;
- mobile-first composer;
- no private trade-room content in the public feed.

---

# 9. League Page

League is the competitive information hub.

Use tabs/sub-navigation rather than adding every destination to the global rail.

Recommended sub-sections:

1. **Standings**
2. **Schedule**
3. **Power / All-Play** where supported
4. **Playoffs** when relevant
5. **History & Legacy**
6. **League Settings** for commissioner-authorized users

## Standings

Avoid a dense spreadsheet feel.

Prioritize:

- rank;
- franchise;
- record;
- points for;
- streak;
- playoff position/status;
- useful special-week/rivalry context.

Advanced details can expand.

---

# 10. Stadium

Stadium remains a permanent left-navigation destination.

Purpose:

> Make franchise accomplishments physically visible and persistent.

The Stadium destination should contain connected views such as:

- **Stadium** — exterior/interior franchise environment;
- **Owner's Office** — championship trophy, major awards, franchise identity;
- **Legacy / Trophy Room** — inspect earned Big Exec achievements and title years;
- **Next Unlocks** — meaningful accomplishment-based progression.

## Owner's Office

The winner's office is where the **Big Exec Champions Trophy** lives.

A champion should immediately look different from a franchise that has never won.

Display can include original Big Exec:

- Champions Trophy;
- championship year plates;
- banners;
- rivalry markers;
- Redemption accomplishments;
- Giant Killer/Chaos monuments;
- original statues/monuments tied to Big Exec achievement types.

No NFL-style trophy/award lookalikes.

## Progression rule

Progression is accomplishment-driven, not pay-to-win and not an arbitrary XP economy.

---

# 11. League News Page

Reached from the Front Office News card and optionally from League sub-navigation.

Purpose:

> Give the league its own sports-news destination.

Recommended sections:

- **Top Story**
- **Standings Movers**
- **Biggest Performances**
- **Transactions**
- **Rivalry Watch**
- **Weekly Awards**
- **Playoff Picture** when relevant
- **Recaps**

Every published factual claim must be grounded in official Big Exec league data.

---

# 12. Draft Room

Draft Room is an event experience and must receive a dedicated visual pass alongside functional QA.

## Must support visually

- current pick / manager;
- round / pick number;
- server-authoritative timer;
- pause state;
- player search/filter;
- Big Exec rankings;
- personal queue;
- roster needs;
- drafted-player history/feed;
- commissioner controls separated from manager controls;
- reconnect state;
- mobile pick confirmation.

The user should never wonder:

- whose turn it is;
- how much time is left;
- what they already drafted;
- what positions they still need;
- whether their pick was accepted.

---

# 13. History & Legacy

History lives under League and connects back into Stadium/Owner's Office.

Must support:

- season archive;
- champions;
- runner-up;
- Redemption champion;
- final standings;
- rivalry head-to-head;
- all-time franchise records;
- historic recaps;
- franchise name/owner lineage where applicable;
- stadium/legacy consequences.

History should feel like the league has existed for years, not like an imported CSV viewer.

---

# 14. Commissioner Experience

Commissioner controls should be powerful but contextual.

Do not create a separate visual universe for commissioners.

Commissioner-only tools may include:

- league setup;
- draft schedule/start/pause/correction;
- rivalry setup;
- special-week/postseason administration where manual intervention is allowed;
- league settings;
- test/data lab where appropriate.

Destructive/irreversible actions require clear confirmation and auditability.

---

# 15. Authentication / Onboarding

Even though the primary UX focus is authenticated fantasy gameplay, login/onboarding must be visually connected to Big Exec.

Must support:

- sign in;
- sign up;
- invite acceptance;
- league join;
- franchise identity setup;
- clear error states;
- clear recovery state.

First-time managers should understand the next required action without fantasy expertise.

---

# 16. Responsive / Accessibility Acceptance

Every P0 page must be checked on mobile and desktop.

Required:

- no horizontal overflow for normal flows;
- touch targets sized appropriately;
- readable type hierarchy;
- keyboard navigation;
- visible focus;
- semantic labels;
- reduced-motion behavior;
- color is not the only status indicator;
- live/dynamic updates announced appropriately where practical;
- loading, empty, success, locked, disabled, and error states designed intentionally.

---

# 17. Page-by-Page P0 Work Order

Functional QA and UX work should move together in this order:

## P0-A — Global shell

- [ ] persistent desktop left navigation;
- [ ] mobile left navigation drawer;
- [ ] consistent page header/content shell;
- [ ] active route behavior;
- [ ] profile/settings placement;
- [ ] remove conflicting bottom/top primary navigation patterns.

## P0-B — Front Office

- [ ] top-left franchise / manager / record;
- [ ] top-right league name;
- [ ] four action cards;
- [ ] Draft Room → Free Agency lifecycle transformation;
- [ ] Locker Room preview;
- [ ] Trade Room preview;
- [ ] League News preview.

## P0-C — Draft Room

- [ ] complete functional 10-manager QA;
- [ ] rankings/queue/timer visual hierarchy;
- [ ] roster-needs presentation;
- [ ] commissioner controls;
- [ ] mobile draft QA.

## P0-D — Team management surfaces

- [ ] Free Agency / waiver UX;
- [ ] roster UX;
- [ ] lineup UX;
- [ ] Trade Room UX;
- [ ] kickoff/lock state clarity.

## P0-E — Game Day

- [ ] Matchup page visual redesign;
- [ ] live/final state hierarchy;
- [ ] player scoring contribution UX;
- [ ] recap entry point.

## P0-F — League

- [ ] standings;
- [ ] schedule;
- [ ] power/all-play;
- [ ] playoffs;
- [ ] history entry point.

## P0-G — League Alive

- [ ] Locker Room;
- [ ] League News;
- [ ] Stadium;
- [ ] Owner's Office;
- [ ] original Big Exec Champions Trophy;
- [ ] History & Legacy;
- [ ] Recap V2.

## P0-H — Cross-product polish

- [ ] loading states;
- [ ] empty states;
- [ ] success states;
- [ ] error/failure states;
- [ ] responsive QA;
- [ ] accessibility QA;
- [ ] visual consistency review.

---

# 18. Definition of Done

A page is not visually complete because it has black/gold colors.

For each page, completion requires:

1. correct functional flow;
2. information hierarchy appropriate to the user's task;
3. established Big Exec franchise identity;
4. mobile usability;
5. desktop usability;
6. loading/empty/error/locked states;
7. accessibility basics;
8. no unauthorized/pro-league visual IP;
9. production or production-equivalent review;
10. evidence recorded before the associated gate is marked PASS.
