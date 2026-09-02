> **CANONICAL PRODUCT DOCUMENT**
>
> This document is the authoritative Big Exec Fantasy Sports product specification.
>
> It supersedes conflicting earlier PRDs, companion-first recommendations, reconciliation documents, old gate numbering, and prior strategy drafts.
>
> Current production evidence may reveal that implementation has drifted from this specification. In that case, implementation status should be corrected; the product specification must not be silently rewritten.

# Big Exec Fantasy Sports
## Product Requirements Document & Product Specification

**Version:** 1.3  
**Date:** August 30, 2026  
**Supersedes:** Big Exec Fantasy Sports PRD v1.2 (August 25, 2026)  
**Product Type:** Mobile-first fantasy franchise platform  
**Initial Sport:** Pro Football  
**Season 1 Primary Mode:** Standalone Big Exec fantasy league  
**Initial Reference League:** 10 managers  
**Core Positioning:** **Run the Franchise. Own the Season.**

---

## Canonical PRD Parts

Codex/developers must read all files below before making material product decisions:

1. `docs/product/PRD_01_CORE_AND_BUILD.md` — Sections 1–15
2. `docs/product/PRD_02_TRANSACTIONS_AND_SEASON.md` — Sections 16–34
3. `docs/product/PRD_03_HISTORY_IMPORT.md` — Sections 35–46
4. `docs/product/PRD_04_ANALYTICS_AND_RELEASE.md` — Sections 47–53
5. `docs/UX_UI_PAGE_SPEC.md` — canonical P0 product shell, navigation, page hierarchy, Front Office cards, Trade Room, Stadium/Owner's Office, League News, original award/trophy rules, and page-by-page visual acceptance

6. `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_PRD.md` — approved $99 league-season offer, Standard versus Pro+ boundary, accessibility protection, entitlement, voice, cost-control, safety, and release requirements
7. `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_TASKS.md` — Codex execution backlog for the approved feature

The four split PRD files, `docs/UX_UI_PAGE_SPEC.md`, and approved feature PRDs listed here together form the current canonical Big Exec product specification. Do not treat this index alone as the complete specification.

---

## P0 UX/UI Decision — v1.3

UX/UI is a **P0 workstream** and must advance alongside functional engineering rather than being deferred until the end of beta preparation.

The product flow is:

> Functionality → internal QA → page UX/UI completion → mobile + desktop QA → gate evidence.

### Global authenticated navigation

The persistent primary destinations are:

1. Front Office
2. Matchup
3. Locker Room
4. League
5. Stadium

Desktop uses a persistent left navigation rail. Mobile preserves the same left-oriented information architecture through a left-side drawer/sheet.

### Front Office primary cards

The Front Office has four primary action cards:

1. Draft Room → automatically becomes Free Agency after the draft is completed
2. Locker Room
3. Trade Room
4. League News

Stadium remains a persistent navigation destination rather than consuming a Front Office action-card slot.

### Original championship identity

Big Exec must use original trophy/award designs. No product surface may imitate recognizable NFL awards or trophies, including the Lombardi Trophy silhouette.

The original **Big Exec Champions Trophy** lives in the winning franchise's Owner's Office within the Stadium experience and persists as franchise legacy across seasons.


---

## Approved Monetization Decision — Executive League

The initial paid offer is **Big Exec Executive League Season Pass — $99 one-time per league, sport, and season**. It includes **Assistant GM Pro+** for every manager in the covered league. Assistant GM Pro+ is not a separate Stripe product at launch. Core gameplay and accessibility voice capabilities remain available without the Executive entitlement. See `docs/product/EXECUTIVE_LEAGUE_ASSISTANT_GM_PRD.md`.
