# Repo Tightening Log

## 2026-09-01

### Scope

Initial tightening pass after the Accessibility + Voice Assistant GM beta implementation work.

### Read-Only Findings

- No existing tightening log was found, so this file was created.
- `.gitignore` already excludes generated and local-heavy directories: `.turbo/`, `.next/`, `qa-artifacts/`, `node_modules/`, `coverage/`, and `test-results/`.
- The largest workspace bulk is ignored local output, not source: `.turbo` about 368 MB, `apps/web/.next` about 219 MB, and `qa-artifacts` about 493 MB.
- `qa-artifacts` appears to hold historical evidence referenced by status docs, so it was not deleted.
- The safest source bloat found in this pass was repeated missing-confirmation handling across new Assistant GM transaction helpers.

### Changes

- Centralized the repeated missing-confirmation commit response in `apps/web/lib/assistant-gm/transactionConfirmations.ts`.
- Removed impossible post-validation null checks in the confirmation commit helpers.
- Replaced repeated missing-confirmation wrapper calls in lineup, draft, and waiver transaction helpers with the shared helper.
- Cleared ignored local `.turbo/` cache output. This removed generated cache bulk only; no source, tests, docs, migrations, or QA evidence were deleted.

### Preserved

- No production fantasy RPCs, database migrations, or canonical roster/lineup/draft/waiver/trade logic were replaced.
- No generated QA evidence was deleted.
- No broad UI copy rewrite was attempted in this pass.
- Repeated Assistant GM relation/asset-label helpers were left in place because centralizing them would touch more read/write behavior than this tightening pass needs.

### Verification

- `npm test --workspace @fantasy-all-sports/web`: passed, 35 files / 167 tests.
- `npm run typecheck --workspace @fantasy-all-sports/web`: passed.
- `npm run build --workspace @fantasy-all-sports/web`: passed.
