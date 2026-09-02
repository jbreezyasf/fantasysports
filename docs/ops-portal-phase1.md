# Big Exec Operations Portal Phase 1

Date: 2026-09-01  
Source package reviewed: `/Users/harmonyclawcole/Documents/Codex/2026-09-01/referenced-chatgpt-conversation-this-is-an/outputs/big-exec-ops-portal-planning-package.md`  
Status: Implemented in working tree, pending database migration application and authenticated staff verification

## Implemented Scope

- **PROVEN:** `/ops` is a separate internal route surface from the manager-facing product routes.
- **PROVEN:** `/ops` is protected by Supabase auth and redirects unauthenticated requests to `/login?next=/ops`.
- **PROVEN:** Staff access is explicit through `OPS_SUPER_ADMIN_EMAILS`, `OPS_SUPER_ADMIN_USER_IDS`, or active `ops_staff_roles` rows.
- **PROVEN:** Phase 1 portal views are read-only for fantasy data.
- **PROVEN:** The only portal write path added is `ops_audit_events` insertion for internal portal views.

## Routes

- `/ops`: global search and beta KPI snapshot.
- `/ops/users/[userId]`: support lookup for account identity, memberships, franchise ownership, and recent user-attributed league events.
- `/ops/leagues/[leagueId]`: league visibility for franchises, members, current season, draft, matchup, standings, roster count, lineup count, waiver, trade, and feed status.
- `/ops/data-health`: data freshness view for athletes, provider IDs, real teams, real games, and athlete game stats.
- `/ops/audit`: read-only ops audit trail.

## Files

- `apps/web/app/ops/layout.tsx`
- `apps/web/app/ops/page.tsx`
- `apps/web/app/ops/users/[userId]/page.tsx`
- `apps/web/app/ops/leagues/[leagueId]/page.tsx`
- `apps/web/app/ops/data-health/page.tsx`
- `apps/web/app/ops/audit/page.tsx`
- `apps/web/app/ops.css`
- `apps/web/lib/ops/permissions.ts`
- `apps/web/lib/ops/data.ts`
- `apps/web/lib/ops/audit.ts`
- `apps/web/lib/ops/health.ts`
- `apps/web/lib/ops/health.test.ts`
- `supabase/migrations/20260901090000_ops_portal_phase1.sql`

## Database

Migration `20260901090000_ops_portal_phase1.sql` adds:

- `ops_staff_roles`
- `ops_audit_events`

The migration has not been applied to production in this implementation pass.

## Explicit Deferrals

- No fantasy roster, lineup, waiver, trade, scoring, standing, or draft mutation tools.
- No Composio/social publishing.
- No support ticketing replacement.
- No billing/refund tooling.
- No Assistant GM prompt/model/personality editing.
- No data repair or manual sync override buttons.
- No broad staff management UI beyond the foundational role table.

## Verification

- `npm test --workspace @fantasy-all-sports/web`: 36 files, 169 tests passed.
- `npm run typecheck --workspace @fantasy-all-sports/web`: passed.
- `npm run build --workspace @fantasy-all-sports/web`: passed.
- Local smoke check: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://127.0.0.1:3000/ops` returned `307 http://127.0.0.1:3000/login?next=/ops`.

## Remaining Before Beta Use

- Apply `supabase/migrations/20260901090000_ops_portal_phase1.sql`.
- Configure at least one owner account through `OPS_SUPER_ADMIN_EMAILS` or `OPS_SUPER_ADMIN_USER_IDS`.
- Verify signed-in owner access to `/ops` against production-equivalent data.
- Verify signed-in non-staff redirect to `/dashboard`.
