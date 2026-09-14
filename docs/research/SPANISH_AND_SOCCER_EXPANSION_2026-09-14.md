# Spanish localization and fantasy soccer expansion — September 14, 2026

## Decision

Spanish localization is a strong expansion for Big Exec. Fantasy soccer is also commercially credible, but it should be a separate sport launch after football scoring and core season operations are proven. The recommended first soccer market is Spanish-speaking fans in the United States and Mexico, followed by a broader Latin American rollout. A free-to-play private-league pilot limits regulatory exposure while measuring retention and willingness to pay.

## Evidence

- LALIGA reports that its official fantasy game reached a record 1.3 million unique daily users and created more than 1.5 million private leagues in 2025/26. This proves material demand for Spanish-language fantasy soccer, while also showing that the incumbent is strong: [LALIGA Fantasy 2026/27 announcement](https://www.laliga.com/noticias/laliga-fantasy-ya-esta-disponible-para-la-temporada-2026-27).
- The incumbent monetizes through Premium features, ad-free subscriptions, sponsored public leagues, and rewarded ads that grant in-game budget: [LALIGA Fantasy terms](https://www.laliga.com/en-ES/legal/laliga-fantasy/conditions-of-use), [Daily Reward](https://www.laliga.com/noticias/la-recompensa-diaria-aterriza-en-laliga-fantasy).
- LALIGA Fantasy separates Spain, Global, and MENA regions because content, features, and prize eligibility differ. Big Exec should also model market and legal region separately from interface language: [LALIGA Fantasy terms](https://www.laliga.com/en-ES/legal/laliga-fantasy/conditions-of-use).
- Biwenger runs long-lived regional competitions and sells Premium leagues/credits, evidence that community identity and paid league upgrades work beyond the official game: [Biwenger regional competition](https://biwenger.as.com/blog/disfruta-de-la-vii-edicion-de-la-liga-por-comunidades-de-biwenger-fantasy/).
- Entry-level soccer data is inexpensive enough for a controlled pilot. API-Football publicly lists $19–$39 monthly tiers; Sportmonks lists €29 for five leagues, €99 for 30, and €249 for 120, including fixtures, live scores, lineups, players, injuries, and statistics: [API-Football pricing](https://www.api-football.com/pricing), [Sportmonks pricing](https://www.sportmonks.com/football-api/plans-pricing/).

## Spanish product plan

The entire site can be localized, including the public website, account flows, league creation, draft, lineup, matchup, Locker Room, waivers, trades, commissioner tools, email, notifications, PWA metadata, Assistant GM, accessibility text, dates, numbers, and errors.

Use this locale order:

1. A language the person explicitly selected.
2. Their saved account preference.
3. Browser `Accept-Language` on the first visit.
4. English.

English remains the default and the language switch stays visible. Browser locale can suggest Spanish automatically, but should not keep overriding a person's saved choice. Start with clear neutral Latin American Spanish (`es-419`) and have native reviewers from the first target market review sports terms and tone. Store fantasy events as structured facts and translate the display template at render time; do not store system events only as English sentences. Manager-written Locker Room and trade messages remain in the language written unless a separate opt-in translation feature is added.

Implementation estimate (planning range, not a vendor quote):

| Work | Estimated effort/cost |
| --- | ---: |
| Locale foundation, routing, cookie/profile preference, date/number formatting | 40–70 engineering hours |
| Extract and translate current product/UI/email/PWA strings | 60–110 engineering hours |
| Native Spanish sports-language review and accessibility QA | $3,000–$10,000 |
| Regression testing across both languages | 20–40 engineering hours |
| Ongoing localization | roughly 10–20% added effort for copy-heavy features |

The release gate should require English and Spanish parity for every included workflow, mobile and desktop checks, screen-reader labels, overflow caused by longer Spanish copy, email rendering, notification links, and preference persistence.

## Soccer product and monetization

Big Exec should not try to beat LALIGA Fantasy by becoming another generic player-market game. The strongest opening is the existing Big Exec promise applied to soccer: persistent clubs, a premium club world, private friend leagues, rivalry identity, an accessible Spanish Assistant GM, explainable scoring, and stronger league banter.

Recommended revenue stack:

| Offer | Role | Test price |
| --- | --- | ---: |
| Free | One private league, core roster/scoring/chat | $0 |
| Club+ | Deeper customization, Assistant GM analysis, history and advanced alerts | $4.99–$7.99/month or local equivalent |
| League Executive | Commissioner upgrade, richer formats, recap media, awards and admin tools | $39–$79/season |
| Sponsored leagues | Brand-funded competitions, prizes and placements | Contract pricing |
| Rewarded ads | Optional engagement reward for free users | Test only after retention is healthy |

Prices are test hypotheses. Local purchasing power and app-store pricing need country experiments. Do not sell competitive advantage that damages trust; premium should improve information, expression, convenience, and league production.

## Cost envelope

A one-league pilot using the existing platform can start with public data tiers around $19–€99/month. A polished soccer launch is materially larger because it needs soccer-specific rosters, transfer windows, formations, scoring, substitutes, postponed matches, multi-match gameweeks, provider reconciliation, visual design, Spanish content, and operational QA.

Planning ranges:

| Stage | Build estimate | Monthly operations |
| --- | ---: | ---: |
| One-competition private beta | 600–1,000 engineering hours | $100–$750 plus support |
| Multi-competition commercial launch | 1,200–2,500 engineering hours | $750–$5,000 before marketing/support staff |
| Licensed brand/player imagery or enterprise data | Vendor negotiation | Potentially well above self-serve API pricing |

These are Big Exec planning estimates, not quotes. Player likenesses, club marks, league marks, prizes, and paid-entry contests require separate rights and legal review. Spain's gaming law defines paid participation tied to uncertain sports outcomes broadly enough that a paid-entry/prize model needs jurisdiction-specific counsel; subscription features and free private leagues are the safer starting structure: [Spain Law 13/2011](https://www.boe.es/buscar/act.php?id=BOE-A-2011-9280).

## Recommended validation sequence

1. Finish the football beta and measure activation, weekly return, lineup completion, message activity, and paid interest.
2. Localize football fully into Spanish. This tests the language system without adding a second scoring engine.
3. Interview 20–30 Spanish-speaking fantasy soccer players across U.S. Hispanic and Mexican audiences.
4. Prototype one competition with private leagues and no paid entry.
5. Test the Club+ and League Executive offers before expanding data coverage.
6. Add Spain and additional Latin American markets only after terminology, payments, taxes, privacy, promotions, and prize rules are reviewed per country.

## Go/no-go measures for the pilot

Proceed to a larger launch if the pilot reaches at least 60% draft completion, 50% Week 4 league retention, 35% weekly lineup completion, 20% of active managers posting/reacting in the Locker Room, and 5–8% paid conversion or equivalent sponsor revenue. These are internal test thresholds, not market benchmarks.
