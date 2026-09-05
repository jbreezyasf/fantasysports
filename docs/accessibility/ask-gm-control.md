# Ask GM Control (BE-VOICE-100)

## Status

BE-VOICE-100 is implemented by evolving the existing BE-VOICE-051 push-to-talk entry point rather than adding a second Ask GM surface. It remains behind the legacy `voice_gm` feature flag or the newer Assistant GM voice-input flag.

## Reconciliation note

`docs/executive/REPO_INVENTORY.md` recorded BE-VOICE-100 as *"Existing UI start: `apps/web/app/components/AskGmPushToTalk.tsx`; needs real gateway integration, transcript, Tell me more, focus restoration."* This task closed those four gaps in place. `AskGmPushToTalk` is still the single mounted Ask GM control, still mounted from `BigExecAppHeader`.

## Files

- `apps/web/app/components/askGm/askGmMachine.ts`
- `apps/web/app/components/askGm/askGmMachine.test.ts`
- `apps/web/app/components/AskGmPushToTalk.tsx`
- `apps/web/app/components/AskGmPushToTalk.test.tsx`
- `apps/web/app/components/assistantGmActions.ts`
- `apps/web/app/components/BigExecAppHeader.tsx`
- `apps/web/app/gate5.css`

## Architecture

Interaction behavior lives in a pure reducer (`askGmMachine`) so states, announcements, and focus destinations are testable without a DOM — this repository has no React Testing Library, so component tests are `renderToStaticMarkup` assertions and the behavioral coverage belongs in the machine.

The component owns only the adapter wiring: `lib/voice/speechToText` for capture (BE-VOICE-052), `lib/voice/textToSpeech` for spoken output (BE-VOICE-053), and `ScreenReaderAnnouncer` for announcements.

As of the 2026-09-05 finish branch, `BigExecAppHeader` wires `onAsk` to `askHeaderAssistantGm`, a server action that authenticates the user, verifies league membership, resolves the current league season, routes common roster/lineup/standings/draft/waiver/trade/history questions to the read-only Assistant GM gateway, and returns a visible/spoken answer. The action does not expose write tools.

## States

`idle`, `listening`, `processing`, `speaking`, `error`. Every transition emits an announcement through the shared queue on the `gm` channel, so state is announced as well as visible, and phase is conveyed by text rather than colour alone.

## What this task added

- **Assistant integration seam** — `onAsk` and `onTellMeMore` callbacks. The previous implementation had a placeholder `setTimeout` that dropped every question into the error state.
- **Transcript** — a running `manager`/`assistant` turn list in a focusable region. The written record is always present, so a spoken answer is never the only copy.
- **Tell me more** — offered only when the answer carries extra detail.
- **Focus restoration** — every transition names one focus destination, applied directly rather than through `createFocusRestorer`, which deliberately refuses `tabIndex -1` targets like the transcript region and error alert.

## Gameplay obstruction

The panel is modal (`role="dialog"`) only when no time-critical gameplay control is live. When `criticalControlsActive` is set — a running draft clock or an imminent lineup lock — it renders as a non-modal `role="region"` and never traps focus, so it cannot obstruct pick controls.

## Entitlement

The control accepts a decision from the BE-GM-105 central policy and renders `describeAssistantGmUpgradePrompt` output. It never inspects entitlement, Stripe, or feature-flag state itself. A role denial shows the explanation with no upgrade prompt; only `entitlement_required` shows the Executive prompt.

## Degraded modes

Every failure exposes cancel plus at least one of retry or type instead. A microphone denial routes to the typed path and does not offer a retry that would fail identically. A speech-output failure leaves the phase at `idle` with the written answer intact rather than entering the error state.

## Known limits

- Voice capture and spoken output still use browser adapters only; the provider abstraction for cloud STT/TTS is BE-VOICE-101/102.
- `onAsk` is wired from the authenticated product header to the read-only Assistant GM gateway in the finish branch. Production deployment and authenticated browser QA are still separate release evidence.
- Audio priority against VoiceOver/TalkBack is modeled through the announcement queue's `gm` channel but is not proven on device; that is BE-VOICE-103.
- No device assistive-technology session has been run for this control.
