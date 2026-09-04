# Ask GM Push-To-Talk UI

## Status

BE-VOICE-051 is implemented behind the `voice_gm` feature flag.

**Superseded in part by BE-VOICE-100.** This component now drives its state from
`apps/web/app/components/askGm/askGmMachine.ts` and adds a transcript, Tell me
more, focus restoration, an assistant integration seam, and BE-GM-105 policy
gating. See `docs/accessibility/ask-gm-control.md`.

## Files

- `apps/web/app/components/AskGmPushToTalk.tsx`
- `apps/web/app/components/AskGmPushToTalk.test.tsx`
- `apps/web/app/components/BigExecAppHeader.tsx`
- `apps/web/app/leagues/[leagueId]/layout.tsx`
- `apps/web/app/franchises/[franchiseId]/layout.tsx`
- `apps/web/app/drafts/[draftId]/layout.tsx`
- `apps/web/app/matchups/[matchupId]/layout.tsx`
- `apps/web/app/recaps/[recapId]/layout.tsx`
- `apps/web/app/gate5.css`

## States

- `idle`: ready state with Start push-to-talk button.
- `listening`: visual/live text plus Finish and Cancel.
- `processing`: visual/live text plus Cancel.
- `speaking`: visual/live text plus Cancel.
- `error`: visual/live text plus Dismiss.
- Typed fallback input is available in every state.
- Retry is available from the error state.

## Guardrails

- No always-listening behavior is active.
- Listening starts only after pressing Ask GM.
- The component is not rendered unless `voice_gm` is enabled.
- Speech-to-text and text-to-speech adapters are wired, but this task does not implement Assistant GM execution.
