# Big Exec Data Storage, Retention, Backup, and Cost Plan

Status: Architecture decision and implementation hold  
Date: September 2, 2026  
Scope: Planning only; no production changes authorized

## Executive decision

Big Exec does not yet have a complete, canonical storage-capacity plan. Existing specifications contain useful partial decisions—Supabase as the authoritative relational database, Cloudflare R2 for recap media, no raw voice retention by default, and future transcript/cost controls—but they do not define capacity forecasts, lifecycle rules, backup recovery targets, archive behavior, or cost gates.

**Implementation hold:** Do not deploy Assistant GM persistence, late-start backfill storage, new permanent media, or material historical-import storage to production until Phases 0–2 of this plan are approved and their budgets/retention rules are represented in implementation tasks. Documentation and read-only measurement may continue.

## 1. Verified current state

### Proven

- Production project: Supabase `Fantasy All-Sports` (`njjiqdqhmcbxblwhfade`), healthy on Postgres 17.6 at review time.
- Total production database size: approximately **27 MB**.
- Largest application relations are currently small: `athletes` about 2.1 MB, `athlete_provider_ids` about 1.4 MB, `athlete_game_stats` about 1.3 MB, `matchups` about 0.9 MB, and `fantasy_player_scores` about 0.9 MB.
- Supabase Storage has **zero application buckets and zero stored objects**. Big Exec is not currently using Supabase object storage.
- The recap worker uploads MP4 files to Cloudflare R2 and records their public URLs in Supabase when R2 credentials are configured.
- The worker also retains finished MP4s on its persistent Docker volume. No cleanup/lifecycle mechanism exists in the inspected worker.
- Two current 27-second beta recap files measured about 0.32 MB and 0.38 MB. This is not a reliable V2 capacity baseline because the approved clay/action V2 will contain much more visual motion and audio.
- The Assistant GM PRD says raw voice audio should not be stored by default and requires a future conversation-retention policy and cost ledger.
- No repository document combines database, AI, voice, media, backup, retention, and multi-year cost planning.

### Unverified

- Current Cloudflare R2 object count, stored bytes, lifecycle configuration, versioning, and monthly invoice.
- Current VPS persistent-volume capacity, free disk, snapshots, and backup policy.
- Current Supabase billing plan/add-ons and actual monthly invoice.
- Final V2 recap bitrate/file size under production visuals and audio.
- Final Assistant GM usage per beginner-heavy league.

These items must be measured before a public paid launch forecast is treated as final.

## 2. Storage architecture

| Data class | Primary home | Why | Do not store here |
|---|---|---|---|
| Accounts, leagues, rosters, lineups, transactions, scores, standings, entitlements | Supabase Postgres | Transactional truth, constraints, RLS, queries | Video, audio, large raw provider payloads |
| Normalized sports facts and scoring records | Supabase Postgres, partition-ready | Reusable across leagues; authoritative scoring input | Repeated provider JSON per league |
| Published recap video and approved media | Cloudflare R2 | Low-cost object storage and free direct egress | Binary blobs inside Postgres |
| Temporary render frames | Worker ephemeral disk | Short-lived render workspace | Persistent Docker volume or Postgres |
| Published-render working copy | Worker volume only until R2 verification | Recovery during upload | Permanent duplicate copy |
| Raw voice | Memory/stream only by default | Privacy and cost control | Postgres, logs, R2, analytics |
| Assistant GM full transcript | Supabase Postgres, short retention | Searchable user history and support | Permanent franchise memory |
| Assistant GM structured summary/decision record | Supabase Postgres | Compact continuity and auditability | Raw audio or unbounded prompts |
| Static FAQ knowledge base | GitHub/application bundle | Versioned stable content | One database copy per league |
| Encrypted logical backups | Separate restricted backup bucket/account | Recovery independent of live database | Public media bucket |

## 3. Retention policy

| Data | Default retention | Rule |
|---|---:|---|
| Official league history, scores, standings, championships, rivalry facts | Indefinite | Core franchise legacy; use compact normalized rows |
| Drafts, waivers, trades, lineup submissions, consequential GM action audit | Minimum 3 completed seasons | Retain longer where required for league history/disputes |
| Raw provider responses | 7–30 days | Keep only for ingestion debugging; normalized facts persist |
| Full Assistant GM transcript | 90-day rolling window | User deletion available; do not use as permanent memory |
| Structured GM summaries/preferences | Current season + 13 months | Renew only with continued use/consent; separate from official truth |
| AI usage/cost ledger without conversation content | 24 months | Financial and capacity analysis |
| Raw voice recordings | **Not retained** | Delete/expire immediately after transcription; do not log |
| Generated TTS audio | Session cache or maximum 24 hours | Regenerate when needed; text remains authoritative |
| Failed/temp render frames | Maximum 24 hours | Automated cleanup required |
| Unpublished, replaced, or regenerated videos | 30 days | Then automatic deletion |
| Published weekly recap, both orientations | Through season + 30 days | Hot R2 Standard storage |
| Primary legacy recap (normally 9:16) | Indefinite | Transition to R2 Infrequent Access after 90 days |
| Secondary 16:9 weekly derivative | Season + 30 days | Delete unless championship, featured, or specifically preserved |
| Championship/featured recaps | Indefinite | Preserve both approved formats when product value justifies it |
| Deleted account uploads/logos | 30-day recoverable window | Then purge unless part of retained shared league history |

The long-term franchise memory must be built from deterministic league history plus small structured summaries—not from keeping every conversation or recording forever.

## 4. Capacity model

### Reference league-season

Planning assumptions, not measurements:

- 10 managers.
- 18 scoring periods.
- 5 matchups per period, or approximately 90 matchup recaps.
- Two active-season video orientations.
- 5–15 MB per finished V2 orientation after clay/action visuals and audio.
- Approximately 8 MB of database growth per league-season: 5 MB gameplay/audit/history and 3 MB retained AI transcript/summary/usage data.
- Shared normalized Pro Football source data: plan 100–300 MB per sport-season, stored once rather than repeated per league.

The current recap pair is only about 0.7 MB total. The forecast intentionally uses **10–30 MB per pair** because V2 is not built or measured yet.

### End-of-season planning range

| Scale | Managers | Supabase league data | R2 recap/media range |
|---:|---:|---:|---:|
| 10 leagues | 100 | ~80 MB | 9–27 GB |
| 100 leagues | 1,000 | ~0.8 GB | 90–270 GB |
| 1,000 leagues | 10,000 | ~8 GB | 0.9–2.7 TB |
| 10,000 leagues | 100,000 | ~80 GB | 9–27 TB |

These figures are intentionally conservative for video. After production V2 measurement, replace the range with p50, p90, and maximum bytes per minute by output type.

## 5. Current-price cost model

Pricing reviewed September 2, 2026:

- Supabase Pro starts at $25/month, includes 8 GB database disk, 100 GB file storage, 250 GB egress, 5 million Realtime messages, 2 million Edge Function invocations, and seven days of daily database backups.
- General-purpose database disk above 8 GB is $0.125/GB-month.
- Supabase compute is separate but receives a $10/month paid-plan credit: Micro $10, Small $15, Medium $60, Large $110, XL $210 monthly.
- Seven-day Point-in-Time Recovery is about $100/month and requires at least Small compute.
- Cloudflare R2 Standard storage is $0.015/GB-month, with 10 GB-month free; direct egress is free. Infrequent Access is $0.01/GB-month plus retrieval fees and a 30-day minimum.

### Illustrative steady-state monthly cost

This table uses the midpoint media estimate of 1.8 GB per league-season and 8 MB database growth per league-season. It excludes AI inference/STT/TTS, sports-data licensing, email/SMS, Vercel, VPS/render compute, taxes, and labor.

| Active league-seasons | Suggested starting compute | Supabase plan + compute credit | PITR | Database overage | R2 midpoint | Estimated subtotal |
|---:|---|---:|---:|---:|---:|---:|
| 10 beta leagues | Micro | $25 | $0 during closed beta | $0 | ~$0.12 | **~$25/month** |
| 100 paid leagues | Small | $30 | $100 | $0 | ~$2.55 | **~$133/month** |
| 1,000 paid leagues | Medium | $75 | $100 | $0 | ~$26.85 | **~$202/month** |
| 10,000 paid leagues | Large–XL | $125–$225 | $100 | ~$9 | ~$269.85 | **~$504–$604/month** |

Compute choices cannot be finalized from storage volume alone. Concurrent draft rooms, Sunday scoring, Realtime traffic, AI tool queries, and late-start backfills determine CPU, RAM, connections, and message cost.

### Multi-year effect

At 1,000 league-seasons added per year with one primary 0.9 GB legacy format retained per league-season, five years creates roughly 4.5 TB of legacy video before featured/championship additions. In R2 Infrequent Access that is approximately $45/month for storage, plus retrieval/operations. At 10,000 league-seasons per year, the same policy approaches 45 TB and approximately $450/month after five years.

Keeping both formats forever roughly doubles those numbers. That is why the secondary weekly derivative should expire while the primary legacy recap survives.

## 6. Backup and recovery plan

Supabase daily database backups do not restore deleted Storage API objects. R2/media requires its own protection and lifecycle strategy.

### Closed beta

- Supabase Pro daily backup with seven-day retention.
- Weekly encrypted logical export to a restricted, separate backup location.
- Monthly restore drill into a non-production environment.
- R2 object inventory/manifest daily.
- Worker output is deleted only after R2 upload and a read/head verification.
- Recovery objectives: RPO 24 hours, RTO 8 hours.

### Public paid launch

- Seven-day Supabase PITR before accepting material paid league activity.
- Weekly encrypted logical export independent of Supabase; keep four weekly and twelve monthly copies.
- R2 versioning/object lock decision for irreplaceable championship and legacy media.
- Quarterly database and media restore drill.
- Recovery objectives: RPO 15 minutes for transactional truth, RTO 4 hours.

### Media reproducibility

Persist the deterministic recap script, scene schema version, asset version, renderer version, and media checksum. If a replaceable weekly video is lost, Big Exec should be able to regenerate it. Championship/featured media should also have a protected copy because exact historical rendering may depend on retired assets/software.

## 7. Required controls and monitoring

- Daily database bytes and growth rate by table/index.
- Rows and bytes added per league-season and sport-season.
- R2 objects, logical bytes, age, storage class, and prefix.
- VPS disk free percentage, render temp bytes, and retained published duplicates.
- Recap bytes/minute p50, p90, p99 by orientation/version.
- Transcript bytes and turns per manager/league; deletion/expiry counts.
- Supabase egress, Realtime messages, connections, compute utilization, and cache hit rates.
- Forecast at 30, 60, and 90 days.
- Alerts at 50%, 70%, 85%, and 95% of every quota/budget.
- Hard kill switches for recap generation, persistent transcripts, and expensive media variants; never disable core fantasy truth or accessibility.

## 8. Cost allocation

Every material stored item must carry or resolve to:

- `league_id` where applicable;
- sport and season;
- data/media class;
- created and expiry timestamps;
- byte count;
- storage provider/key;
- source/version;
- retention class;
- entitlement tier where relevant.

This enables gross-margin reporting for the $99 Executive League Season Pass and prevents global costs from being guessed.

## 9. Implementation gates

### Gate S0 — Measurement complete

- Current Supabase invoice/plan and usage captured.
- Current R2 inventory, lifecycle rules, and invoice captured.
- VPS disk/snapshot state captured.
- One realistic V2 recap suite rendered and measured.
- Assistant GM usage load model tested with 5–6 beginner-heavy users in one 10-manager league.

### Gate S1 — Policies approved

- Retention table approved by product/privacy owner.
- RPO/RTO and PITR timing approved.
- Published-versus-temporary media rules approved.
- User transcript deletion and consent behavior approved.

### Gate S2 — Architecture proven outside production

- Lifecycle cleanup tested in preview/staging.
- Worker local-copy cleanup tested after verified R2 upload.
- Database partitions/indexes reviewed where justified by measured growth.
- Backup and restore drill passes.
- Per-league cost ledger reconciles with provider usage.

### Gate S3 — Production expansion authorized

- 12-month low/base/high forecast fits budget.
- Spend caps and alerts configured.
- Rollback/degraded modes documented.
- Juanita explicitly authorizes production deployment.

## 10. Immediate Codex task

> Perform Gate S0 only, read-only. Read `AGENTS.md`, canonical PRDs, this storage plan, the deployed application state, production Supabase usage, Cloudflare R2 inventory/billing/lifecycle configuration, VPS disk/snapshot state, and current vendor invoices where access is already configured. Render no new paid media and make no production changes. Create `docs/architecture/STORAGE_BASELINE_EVIDENCE.md`, classify every finding as PROVEN, LIKELY/INFERRED, or UNVERIFIED, and stop for product approval before S1.

## 11. Bottom line

Big Exec's structured fantasy data is unlikely to be the expensive storage problem. The dominant persistent-storage driver is recap video, followed by unbounded AI transcripts if retention is not controlled. The largest total operating costs may ultimately be AI/STT/TTS, sports-data licensing, and rendering compute rather than storage itself; those require separate measured cost ledgers.

