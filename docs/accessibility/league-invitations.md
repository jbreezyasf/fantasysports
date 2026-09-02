# BE-A11Y-028 Accessible League Invitation by Email

Date: 2026-08-31

Status: Implemented for create/review/send/pending-link/resend flows; revoke is documented as unsupported by the verified backend.

## Objective

A blind or low-vision commissioner must be able to invite one or more managers by email, review addresses, correct invalid entries, send invitations, receive confirmation, and inspect pending invitations.

## Files Updated

- `apps/web/app/leagues/[leagueId]/page.tsx`
- `apps/web/app/leagues/[leagueId]/InviteManagersForm.tsx`
- `apps/web/app/leagues/[leagueId]/invitationAccessibility.ts`
- `apps/web/app/leagues/[leagueId]/invitationAccessibility.test.ts`
- `apps/web/app/leagues/actions.ts`
- `apps/web/app/gate5.css`

## Current Invitation Architecture

- Commissioner invite UI: `apps/web/app/leagues/[leagueId]/page.tsx`
- Invite action: `createLeagueInvite` in `apps/web/app/leagues/actions.ts`
- Email delivery: `apps/web/lib/email/resend.ts`
- Email template: `apps/web/lib/email/templates.ts`
- Invite claim page: `apps/web/app/invite/[token]/page.tsx`
- Canonical invite RPCs:
  - `create_league_invite`
  - `get_public_league_invite`
  - `invite_matches_current_user`
  - `accept_league_invite`

## Behavior Implemented

- Commissioner invite form now supports one or more email addresses.
- Addresses are normalized, deduplicated, and reviewed before sending.
- Invalid addresses are identified before final submission.
- Existing pending invitations are identified before final submission when the email is visible in the league invite ledger.
- Character-by-character email review is available to screen-reader users for reviewed addresses.
- Each reviewed address has a Remove action, allowing correction by removing and re-entering.
- The final Send Invitations action is disabled until at least one valid reviewed address exists.
- The server action now accepts a reviewed email list and calls the existing `create_league_invite` RPC for each address.
- Email delivery still uses the existing transactional email helper and template.
- Confirmation announces how many invitations were created and whether delivery was sent/manual/mixed.
- Invite ledger now exposes table semantics and includes accessible invite links.
- Pending invite rows expose a Resend action.
- Resend uses the existing invite row/token and existing email delivery helper.

## Verified Backend Limits

Search found no verified invite revoke RPC/action in current app code or migrations. The invite ledger therefore announces that revoke is unsupported by the current verified invite engine rather than exposing a nonfunctional control.

## Remaining Work

- Add revoke only after canonical RPC or schema support exists.
- Record VoiceOver/TalkBack invitation flow results in `docs/accessibility/test-matrix.md`.
