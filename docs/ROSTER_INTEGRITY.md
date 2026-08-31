# Big Exec Roster Integrity Mode

**Status:** Beta-critical competitive-integrity control  
**Applies:** After the authoritative trade deadline  
**Default:** Automatic Protection

Roster Integrity prevents post-trade-deadline roster sabotage without punishing a franchise merely for having a losing record. Free Agency and Waivers remain available to franchises that are still competing, including Redemption participants.

Roster Integrity does **not** reopen or alter trading. The existing trade deadline remains authoritative and separate.

## League settings

### Automatic Protection — default

Normal replacement transactions remain available after the trade deadline, but Big Exec blocks or requires a commissioner exception for:

- standalone post-deadline roster releases;
- protected/core assets based on current Big Exec season-to-date fantasy scoring ranks when score data exists;
- excessive roster drops inside the league's configured rolling window;
- franchises explicitly marked roster-locked because their season competition is complete.

Default bulk threshold: **3 completed drops in 24 hours**. The next release side of a transaction requires commissioner approval.

Current core-protection thresholds:

- QB: top 12
- RB: top 30
- WR: top 40
- TE: top 15
- K: top 12
- D/ST: top 12

These ranks are computed from the league season's authoritative Big Exec fantasy scores. If the current season does not yet have score data for an asset, this core-ranking rule does not fabricate a rank; standalone/bulk/roster-lock controls still apply.

### Commissioner Review

After the trade deadline, **every transaction that releases an existing roster asset requires a one-time commissioner approval**. This is the manual-control option for leagues that want the commissioner to review all post-deadline releases.

Approval creates an asset-specific override that expires after 24 hours and is consumed when used. Approval does not force a transaction to succeed if another rule fails.

### Open Rosters

Turns off the additional post-deadline Roster Integrity protection. Existing game locks, waiver rules, ownership rules, RLS, and the trade deadline remain in force.

## Fully eliminated franchises

A bad record does not lock a roster.

`season_franchises.roster_locked_at` and `roster_lock_reason` provide an authoritative roster-lock state for a franchise that has **no Championship or Redemption competition remaining**.

Commissioners can set/unset this state from Roster Integrity settings. Season automation can call the same control once elimination is deterministically known.

**Current boundary:** this feature supplies and enforces the lock state, but this PR does not claim that the existing season engine already infers every elimination and automatically sets the lock. That integration remains part of Season Automation QA.

## Review and audit

Managers can request commissioner review for a legitimate blocked release.

Commissioners can:

- approve a one-time 24-hour override;
- reject a request;
- configure the protection mode and thresholds;
- lock/unlock a season-complete franchise.

Roster Integrity records an audit trail for settings changes, review requests/decisions, overrides, and explicit roster locks.

## Database boundary

Protection is enforced at the authoritative database layer, not only in UI.

- A `roster_entries` drop trigger protects direct/internal `dropped_at` changes.
- `claim_free_agent` applies the same Roster Integrity decision before its selected drop.
- `process_due_waivers` applies the same decision before a winning claim's selected drop.
- If one waiver claim has an invalid Roster Integrity drop, that claim fails and processing continues to the next eligible claim/hold instead of killing the entire waiver processor.

## Production QA evidence — 2026-08-30

All mutation-heavy behavioral checks below were executed inside transactions that intentionally aborted/rolled back after the assertion. The QA league was returned to its original roster/deadline state after each test.

### PROVEN — defaults and schema

- Existing league seasons default to `automatic` after migration.
- QA default is 3 drops / 24 hours, core protection ON, explicit eliminated-roster lock enforcement ON.
- `roster_integrity_reviews`, `roster_integrity_overrides`, and `roster_integrity_audit` exist with RLS enabled.
- User-facing Roster Integrity RPCs are executable by `authenticated` and not by `anon`.
- Internal decision/override helper RPCs are not exposed to `authenticated` or `anon`.

### PROVEN — standalone dump blocked

With the QA trade deadline moved into the past inside a rollback transaction, a direct standalone `dropped_at` release was rejected with:

> Standalone player releases are protected after the trade deadline.

This closes the original six-standalone-drop attack at the roster-entry boundary.

### PROVEN — legitimate Automatic Protection replacement allowed

A normal post-deadline Free Agency add/drop replacement succeeded in Automatic Protection mode when it did not violate core/bulk/roster-lock rules.

### PROVEN — bulk replacement abuse blocked

The QA manager completed three post-deadline add/drop replacements inside the 24-hour test window. A fourth replacement was rejected with the bulk-drop-limit rule.

### PROVEN — core asset protection

A rollback-only score fixture made an active QA RB the top-ranked RB in the league season. A post-deadline attempt to release that asset as part of a Free Agency replacement was rejected as a protected core asset. The temporary score row was rolled back and did not persist.

### PROVEN — commissioner review and one-time override

The test sequence passed:

1. manager reached a blocked release;
2. manager requested review;
3. commissioner approved;
4. manager retried the transaction;
5. transaction succeeded;
6. override was marked consumed.

The entire QA sequence was rolled back afterward.

### PROVEN — Commissioner Review mode

In `commissioner_review` mode, an otherwise normal post-deadline replacement that releases a roster asset was rejected until commissioner approval.

### PROVEN — Open Rosters mode

In `open` mode, an otherwise valid post-deadline replacement was allowed.

### PROVEN — manager cannot change commissioner settings

A regular QA manager calling the settings RPC was rejected with `Commissioner permission required`.

### PROVEN — explicit roster lock

A season franchise marked roster-locked could not complete a post-deadline Free Agency replacement.

### PROVEN — waiver compatibility

- A legitimate post-deadline waiver replacement completed successfully in Automatic Protection mode.
- A waiver claim whose selected drop belonged to a roster-locked franchise failed with the Roster Integrity reason.
- The waiver processor continued and successfully awarded a later legitimate waiver instead of aborting the entire job.

## Still separate / not changed by this feature

### Waiver sweep policy

The existing inverse-standings waiver ordering is unchanged. Whether a successful claim should move/reset a franchise's priority before additional simultaneous waiver awards remains a separate product-policy test. Do not claim this PR resolves the previously observed one-franchise multi-claim sweep behavior.

### Browser QA

Authenticated local-app Playwright visual QA was executed on 2026-08-31 using the deterministic 10-manager QA league and isolated storage states for all ten QA actors.

Evidence package:

- `qa-artifacts/2026-08-30_roster-integrity-visual_2026-08-31T00-29-49/EVIDENCE.md`
- `qa-artifacts/2026-08-30_roster-integrity-visual_2026-08-31T00-29-49/REVIEW_INDEX.md`
- `qa-artifacts/2026-08-30_roster-integrity-visual_2026-08-31T00-29-49/SUMMARY.md`

### PROVEN — authenticated visual paths

- Commissioner settings rendered and saved Automatic Protection, Commissioner Review, and Open Rosters states on desktop/mobile.
- Manager09 requested commissioner review from the authenticated roster page on desktop/mobile.
- Commissioner saw the pending review queue with franchise, asset, reason, manager note, approve, and reject controls.
- Commissioner approval created a one-time 24-hour override; Manager09 retried the add/drop successfully through Free Agency.
- Manager06 completed three post-deadline replacement drops in the 24-hour QA window; the next replacement was blocked with the Roster Integrity bulk-drop-limit message.
- Commissioner explicitly locked Manager08's roster; the lock appeared in settings and Manager08's add/drop was blocked with the roster-lock message.
- All nine regular manager browser contexts were redirected/denied from commissioner-only Roster Integrity settings.
- Final cleanup verified Automatic mode, 3-drop threshold, 24-hour window, core protection ON, eliminated lock enforcement ON, no locked QA franchises, no pending reviews, no active overrides, no QA audit rows, no open waiver holds, and no temporary visual roster entries.

### UNVERIFIED / BLOCKED — visual coverage

- Standalone release visual QA remains blocked because there is no current manager-facing standalone release UI.
- Waiver hold/claim visual QA remains blocked because the inspected Free Agency page does not render waiver claim UI.
- Core/high-value asset visual proof remains blocked because the current QA season does not have authoritative season-to-date scoring ranks.
- Direct Supabase JS anon/authenticated RPC permission tests in the visual runner were blocked because local Supabase URL/anon environment variables were unavailable. Earlier database privilege evidence remains recorded above, but this browser run did not independently repeat those RPC actor-class checks.
