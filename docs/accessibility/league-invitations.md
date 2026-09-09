# BE-A11Y-028 Accessible League Invitations

Date: 2026-08-31

Status: Implemented for create/review/send/pending-link/resend flows, commissioner-created reusable share links for text/message delivery, and pre-draft commissioner seat removal.

## Objective

A blind or low-vision commissioner must be able to invite one or more managers by email, create a shareable invite link for text/message delivery, review addresses, correct invalid entries, send invitations, receive confirmation, and inspect pending invitations.

## Files Updated

- `apps/web/app/leagues/[leagueId]/page.tsx`
- `apps/web/app/leagues/[leagueId]/InviteManagersForm.tsx`
- `apps/web/app/leagues/[leagueId]/invitationAccessibility.ts`
- `apps/web/app/leagues/[leagueId]/invitationAccessibility.test.ts`
- `apps/web/app/leagues/inviteShareLink.test.ts`
- `apps/web/app/leagues/actions.ts`
- `apps/web/app/gate5.css`
- `supabase/migrations/20260909040752_league_share_invites.sql`

## Current Invitation Architecture

- Commissioner invite UI: `apps/web/app/leagues/[leagueId]/page.tsx`
- Invite action: `createLeagueInvite` in `apps/web/app/leagues/actions.ts`
- Email delivery: `apps/web/lib/email/resend.ts`
- Email template: `apps/web/lib/email/templates.ts`
- Invite claim page: `apps/web/app/invite/[token]/page.tsx`
- Canonical invite RPCs:
  - `create_league_invite`
  - `get_public_league_invite`
  - `get_public_league_invite_v2`
  - `invite_matches_current_user`
  - `create_league_share_invite`
  - `claim_share_league_invite`
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
- Commissioners can also create one shareable invite link for text/message delivery without entering manager emails first.
- The same share link can be reused until the league reaches capacity. In a 10-manager league with the commissioner already seated, that means up to 9 managers can claim through the link.
- Share links are still backed by `league_invites`; each claimant receives a hidden personal invite token bound to their signed-in email immediately before the existing canonical `accept_league_invite` RPC creates the franchise.
- Email-specific invites still require the signed-in account email to match the invited email.
- Before the draft starts or any draft picks exist, the commissioner can remove a non-commissioner franchise seat and reopen that spot.
- Confirmation announces how many invitations were created and whether delivery was sent/manual/mixed.
- Invite ledger now exposes table semantics and includes accessible invite links.
- Pending invite rows expose a Resend action.
- Resend uses the existing invite row/token and existing email delivery helper.

## Verified Backend Limits

Invite revoke remains unsupported. Seat removal is limited to already-claimed non-commissioner franchises before the draft starts.

## Remaining Work

- Add invite revoke only after canonical RPC or schema support exists.
- Record VoiceOver/TalkBack invitation flow results in `docs/accessibility/test-matrix.md`.
