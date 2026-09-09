# Big Exec Football — Beta Feedback Intelligence

**Status:** Implementation candidate on `feature/beta-feedback-intelligence`  
**Owner:** Big Exec owner/admin only  
**Initial sport:** Pro Football  
**Purpose:** Collect beta-player feedback outside the persistent game UI, preserve the original evidence, analyze recurring product problems, and prepare owner-controlled product/support actions.

## Product decision

The beta feedback form is a shareable landing page, not a persistent in-app widget. Beta players may be sent `/beta-feedback` directly. A signed-in Big Exec league member can submit feedback.

The private intelligence dashboard is owner/admin-only. League commissioners have no feedback-dashboard access merely because they are commissioners. The current owner/admin account is explicitly allowed by the application, and future administrative addresses can be added through `BETA_FEEDBACK_ADMIN_EMAILS` without rewriting the feature.

## Feedback captured

The form captures:

- task or product area;
- whether the task worked;
- ease score (1–5);
- what happened;
- what the player expected;
- frustration/confusion;
- what worked well;
- suggested improvement;
- missing capability;
- churn risk;
- product-disappointment signal;
- NPS (0–10);
- optional location/page context.

The player is not asked to classify the report as a bug, feature request, UX issue, or support issue.

## Evidence rule

`beta_feedback_submissions` stores the player's original wording. Analysis is stored separately in `beta_feedback_analysis` and must never overwrite the raw submission.

An analysis failure must not delete the original submission.

## Analysis model

The first implementation uses a deterministic, no-paid-model heuristic analyzer so the beta feedback path does not depend on external AI availability or introduce variable model cost during launch. The analyzer classifies reports as:

- bug;
- UX/confusion;
- accessibility;
- performance;
- missing feature;
- feature request;
- data/scoring;
- Assistant GM;
- positive feedback;
- other.

It also produces:

- underlying problem statement;
- user-requested solution kept separate from the problem;
- proposed product action;
- severity 1–5;
- churn-risk score 1–5;
- confidence;
- feature-candidate flag;
- cluster key/count;
- proposal-only implementation metadata when appropriate.

A later model-based analyzer may be added behind this contract, but deterministic fallback and raw evidence preservation remain required.

## Product owner control

The owner review states are:

- `pending`;
- `approved`;
- `denied`;
- `deferred`;
- `investigate`.

**Approved means approved for product work/review only.** It does not deploy code, mutate production, or automatically make a requested feature part of Big Exec.

Every review transition is written to `beta_feedback_review_events` with actor, previous state, new state, optional note, and timestamp.

## Customer support triage

The analysis engine may recommend that a report needs a direct customer response. This is only a recommendation.

For support-recommended reports it prepares:

- reason support may be needed;
- concise support summary;
- draft customer response.

Only the owner/admin decides whether the report is routed to customer support. Support disposition is:

- `none`;
- `recommended`;
- `send_to_support`;
- `resolved`.

Future customer-support staff should receive only the support handoff material and the minimum player/context data necessary to answer the case. They should not receive the full private product-intelligence dashboard or owner product-approval controls by default.

## Security

- Raw feedback, analysis, and review-event tables have RLS enabled.
- `anon` and `authenticated` receive no direct table privileges.
- Submission writes happen server-side after authenticated league-membership verification.
- Intelligence reads and owner review writes use the server-only service client after the dedicated owner/admin email check.
- Commissioner role alone never grants feedback access.
- No credentials or tokens are stored in the repository.

## Accessibility

The beta feedback lander is mobile-first, keyboard reachable, uses visible focus indicators, semantic labels/fieldsets/legends, text explanations for rating scales, and does not depend on color alone. It must remain within Big Exec's current accessibility acceptance process and WCAG 2.x target.

## Current files

- `apps/web/app/beta-feedback/page.tsx`
- `apps/web/app/beta-feedback/actions.ts`
- `apps/web/app/beta-feedback/styles.module.css`
- `apps/web/app/admin/beta-feedback/page.tsx`
- `apps/web/app/admin/beta-feedback/actions.ts`
- `apps/web/app/admin/beta-feedback/styles.module.css`
- `apps/web/lib/beta-feedback/analyze.ts`
- `apps/web/lib/beta-feedback/adminAuth.ts`
- `supabase/migrations/20260909062000_beta_feedback_intelligence.sql`
- `supabase/migrations/20260909063500_beta_feedback_support_triage.sql`

## Release gates for this subsystem

Do not call this production-ready until all of the following are proven:

1. migrations apply successfully to the target Supabase project;
2. owner/admin can load `/admin/beta-feedback`;
3. a commissioner who is not an owner/admin is denied access;
4. a beta league member can submit the form;
5. raw submission and separate analysis rows persist correctly;
6. review-event history is written;
7. support recommendation does not automatically route to staff;
8. owner support routing works;
9. mobile/desktop visual QA passes;
10. keyboard and automated accessibility checks pass;
11. web tests, typecheck, and build pass;
12. deployed production behavior is verified after release.
