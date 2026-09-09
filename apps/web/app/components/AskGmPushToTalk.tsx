'use client';

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { microphonePermissionCopy } from '../../lib/voice/speechToText';
import {
  createBoundedSpeechCapture,
  createBrowserSpeechProvider,
  selectSpeechToTextProvider,
  type BoundedSpeechCapture,
  type SpeechCaptureTelemetryEvent,
  type SpeechToTextProvider
} from '../../lib/voice/speechProvider';
import { createBrowserTextToSpeech, type TextToSpeechAdapter } from '../../lib/voice/textToSpeech';
import { announceToScreenReader, setGmAudioSpeaking } from './ScreenReaderAnnouncer';
import { VisuallyHidden } from './accessibility';
import {
  askGmDialogRole,
  askGmReducer,
  createAskGmError,
  createAskGmState,
  type AskGmCapabilities,
  type AskGmEvent,
  type AskGmFocusTarget,
  type AskGmPhase,
  type AskGmState
} from './askGm/askGmMachine';
import {
  describeAssistantGmUpgradePrompt,
  type AssistantGmPolicyDecision
} from '../../lib/assistant-gm/capabilityPolicy';

/**
 * BE-VOICE-100 — accessible Ask Advisor control.
 *
 * Evolves the BE-VOICE-051 push-to-talk entry point. Interaction state now lives
 * in `askGm/askGmMachine` so states, announcements, and focus moves are testable,
 * and this task adds the four gaps the BE-EXEC-000 inventory recorded against
 * BE-VOICE-100: assistant integration seam, transcript, Tell me more, and focus
 * restoration.
 *
 * Speech capture and spoken output still use the existing BE-VOICE-052/053
 * browser adapters.
 */

const stateText: Record<AskGmPhase, string> = {
  idle: 'Ask Advisor is ready.',
  listening: 'Listening. Speak your question now.',
  processing: 'Processing your question.',
  speaking: 'Speaking Front Office Advisor response.',
  error: 'Ask Advisor is unavailable.'
};

export type AskGmPushToTalkProps = {
  initialState?: AskGmPhase;
  initialResponse?: string;
  /**
   * Decision from the BE-GM-105 central policy. Omitted means the legacy
   * flag-gated behavior. This component never inspects entitlement, Stripe, or
   * feature-flag state itself.
   */
  policy?: AssistantGmPolicyDecision;
  capabilities?: Partial<AskGmCapabilities>;
  /** Assistant execution seam. Wired by the caller; absent means typed-only echo. */
  onAsk?: (question: string) => AskGmAnswer | Promise<AskGmAnswer>;
  /** Requests deeper detail for the last answer. */
  onTellMeMore?: () => AskGmAnswer | Promise<AskGmAnswer>;
  /** BE-VOICE-101 provider abstraction. Defaults to the browser adapter. */
  speechProviders?: SpeechToTextProvider[];
  voiceInputEnabled?: boolean;
  cloudSpeechEnabled?: boolean;
  captureLimitMs?: number;
  /** Capture metrics sink. Never receives transcript content. */
  onSpeechTelemetry?: (event: SpeechCaptureTelemetryEvent) => void;
  /** Keeps static tests and focused QA able to render the full panel directly. */
  defaultOpen?: boolean;
};

export type AskGmAnswer =
  | { ok: true; text: string; detail?: string }
  | { ok: false; message: string };

function seedState(input: {
  initialState: AskGmPhase;
  initialResponse: string;
  capabilities?: Partial<AskGmCapabilities>;
  defaultOpen?: boolean;
}): AskGmState {
  const base = createAskGmState({ voiceInput: true, spokenOutput: true, ...input.capabilities });

  return {
    ...base,
    open: input.defaultOpen ?? (input.initialState !== 'idle' || Boolean(input.initialResponse)),
    phase: input.initialState,
    lastAnswer: input.initialResponse ? { text: input.initialResponse } : null,
    canReplay: Boolean(input.initialResponse),
    canStop: input.initialState === 'speaking' || input.initialState === 'processing',
    // A seeded error phase carries the shared BE-VOICE-054 copy rather than an
    // empty alert.
    error: input.initialState === 'error' ? createAskGmError('transcription_failed') : null,
    turns: input.initialResponse ? [{ role: 'assistant', text: input.initialResponse }] : []
  };
}

export default function AskGmPushToTalk({
  initialState = 'idle',
  initialResponse = '',
  policy,
  capabilities,
  onAsk,
  onTellMeMore,
  speechProviders,
  voiceInputEnabled = true,
  cloudSpeechEnabled = false,
  captureLimitMs,
  onSpeechTelemetry,
  defaultOpen = false
}: AskGmPushToTalkProps) {
  const [state, dispatch] = useReducer(
    askGmReducer,
    { initialState, initialResponse, capabilities, defaultOpen },
    seedState
  );
  const [dockPosition, setDockPosition] = useState<AskGmDockPosition>('bottom-right');

  const captureRef = useRef<BoundedSpeechCapture | null>(null);
  const ttsRef = useRef<TextToSpeechAdapter | null>(null);

  const askButtonRef = useRef<HTMLButtonElement | null>(null);
  const typedInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback((event: AskGmEvent) => dispatch(event), []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('big-exec-ask-gm-position');
      if (isAskGmDockPosition(saved)) setDockPosition(saved);
    } catch {
      // Non-essential preference storage; the control still works without it.
    }
  }, []);

  const setSavedDockPosition = useCallback((next: AskGmDockPosition) => {
    setDockPosition(next);
    try {
      window.localStorage.setItem('big-exec-ask-gm-position', next);
    } catch {
      // Preference persistence is best-effort only.
    }
  }, []);

  const upgrade = useMemo(
    () => (policy ? describeAssistantGmUpgradePrompt(policy) : { show: false, headline: '', body: '', surface: null }),
    [policy]
  );

  const focusTargets = useMemo(
    (): Record<AskGmFocusTarget, React.RefObject<HTMLElement | null>> => ({
      trigger: askButtonRef,
      panel: rootRef,
      pushToTalk: askButtonRef,
      typedInput: typedInputRef,
      transcript: transcriptRef,
      errorMessage: errorRef
    }),
    []
  );

  // Focus restoration: every transition names one destination so focus never
  // falls to the document body after a control is removed from the DOM.
  // Applied directly rather than through createFocusRestorer, which refuses
  // tabIndex -1 targets like the transcript region.
  useEffect(() => {
    if (!state.focusRequest) return;
    focusTargets[state.focusRequest]?.current?.focus({ preventScroll: true });
  }, [state.focusRequest, focusTargets]);

  useEffect(() => {
    if (!state.announcement) return;
    announceToScreenReader({
      key: `ask-gm-${state.phase}`,
      message: state.announcement.message,
      priority: state.announcement.priority,
      channel: 'gm'
    });
  }, [state.announcement, state.phase]);

  // Holds non-critical live-scoring announcements while the GM speaks.
  useEffect(() => {
    setGmAudioSpeaking(state.phase === 'speaking');
  }, [state.phase]);

  const speak = useCallback(
    (text: string) => {
      const adapter = createBrowserTextToSpeech();
      ttsRef.current = adapter;
      adapter.speak(text, {
        onEnd: () => send({ type: 'speechEnded' }),
        // A speech failure must leave the written answer intact.
        onError: () => send({ type: 'fail', error: 'speech_failed' })
      });
    },
    [send]
  );

  const finishAnswer = useCallback(
    (answer: AskGmAnswer | void) => {
      if (!answer) {
        const text = 'I am connected, but this screen has not provided a league answer yet. Type a roster, lineup, standings, draft, waiver, trade, or history question.';
        send({ type: 'answer', text });
        if (state.capabilities.spokenOutput) speak(text);
        return;
      }
      if (!answer.ok) {
        send({ type: 'fail', error: 'assistant_failed', message: answer.message });
        return;
      }
      send({ type: 'answer', text: answer.text, detail: answer.detail });
      if (state.capabilities.spokenOutput) speak(answer.text);
    },
    [send, speak, state.capabilities.spokenOutput]
  );

  const ask = useCallback(
    async (question: string) => {
      try {
        finishAnswer(await onAsk?.(question));
      } catch {
        send({ type: 'fail', error: 'assistant_failed' });
      }
    },
    [finishAnswer, onAsk, send]
  );

  function startListening() {
    const selection = selectSpeechToTextProvider({
      providers: speechProviders ?? [createBrowserSpeechProvider()],
      voiceInputEnabled,
      cloudEnabled: cloudSpeechEnabled
    });

    if (!selection.ok) {
      // Degrades to the typed path with the selection's own explanation.
      send({ type: 'fail', error: 'microphone_denied', message: selection.message });
      return;
    }

    const capture = createBoundedSpeechCapture({
      provider: selection.provider,
      telemetry: onSpeechTelemetry
    });
    captureRef.current = capture;
    send({ type: 'pressToTalk' });

    capture.start({
      limitMs: captureLimitMs,
      onInterim: transcript => send({ type: 'interimTranscript', text: transcript }),
      onFinal: result => {
        captureRef.current = null;
        if (!result.transcript) {
          send({ type: 'releaseToTalk' });
          return;
        }
        // Replays the final transcript into the machine so the submitted
        // question is exactly the text the manager saw previewed.
        send({ type: 'interimTranscript', text: result.transcript });
        send({ type: 'releaseToTalk' });
        void ask(result.transcript);
      },
      onError: () => {
        captureRef.current = null;
        send({ type: 'fail', error: 'transcription_failed' });
      }
    });
  }

  function finishListening() {
    captureRef.current?.stop();
  }

  function cancel() {
    captureRef.current?.cancel();
    ttsRef.current?.stop();
    captureRef.current = null;
    setGmAudioSpeaking(false);
    send({ type: 'cancel' });
  }

  function closePanel() {
    captureRef.current?.cancel();
    ttsRef.current?.stop();
    captureRef.current = null;
    setGmAudioSpeaking(false);
    send({ type: 'close' });
  }

  function movePanel() {
    const order: AskGmDockPosition[] = ['bottom-right', 'bottom-left', 'top-left', 'top-right'];
    const currentIndex = order.indexOf(dockPosition);
    const next = order[(currentIndex + 1) % order.length];
    setSavedDockPosition(next);
    announceToScreenReader({
      key: `ask-gm-moved-${next}`,
      message: `Front Office Advisor moved to ${next.replace('-', ' ')}.`,
      priority: 'polite',
      channel: 'gm'
    });
  }

  function resetPanelPosition() {
    setSavedDockPosition('bottom-right');
    announceToScreenReader({
      key: 'ask-gm-position-reset',
      message: 'Front Office Advisor moved to bottom right.',
      priority: 'polite',
      channel: 'gm'
    });
  }

  function stopSpeech() {
    ttsRef.current?.stop();
    setGmAudioSpeaking(false);
    send({ type: 'stop' });
  }

  function replaySpeech() {
    if (!state.lastAnswer) return;
    send({ type: 'replay' });
    speak(state.lastAnswer.text);
  }

  function tellMeMore() {
    send({ type: 'tellMeMore' });
    if (onTellMeMore) {
      void Promise.resolve(onTellMeMore()).then(finishAnswer).catch(() => send({ type: 'fail', error: 'assistant_failed' }));
      return;
    }
    if (state.lastAnswer?.detail) {
      finishAnswer({ ok: true, text: state.lastAnswer.detail });
    }
  }

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    const question = state.draftText.trim();
    if (!question) return;
    send({ type: 'submitTyped' });
    void ask(question);
  }

  // Policy denial replaces the control with the one shared explanation. The
  // upgrade prompt appears only when a purchase is actually the remedy.
  if (policy && !policy.allowed) {
    return (
      <div className="askGmDock" data-position={dockPosition}>
        <div className="askGmControl askGmControl--unavailable" aria-label="Front Office Advisor unavailable">
          <p className="askGmUnavailable" role="status">
            {policy.message}
          </p>
          {upgrade.show ? (
            <div className="askGmUpgrade" role="note">
              <strong className="askGmUpgradeHeadline">{upgrade.headline}</strong>
              <span>{upgrade.body}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const phase = state.phase;

  if (!state.open) {
    return (
      <div className="askGmDock" data-position={dockPosition}>
        <button
          ref={askButtonRef}
          type="button"
          className="askGmBubble"
          onClick={() => send({ type: 'open' })}
          aria-label="Open Front Office Advisor"
        >
          <CoachHeadIcon />
          <VisuallyHidden>Front Office Advisor</VisuallyHidden>
        </button>
      </div>
    );
  }

  return (
    <div className="askGmDock" data-position={dockPosition}>
      <div
        ref={rootRef}
        className="askGmControl"
        data-state={phase}
        role={askGmDialogRole(state)}
        aria-label="Front Office Advisor push to talk"
      >
      <div className="askGmPanelHeader">
        <div className="askGmCoachMark" aria-hidden="true">
          <CoachHeadIcon />
        </div>
        <div className="askGmPanelTitle">
          <strong>Front Office Advisor</strong>
          <div className="askGmStatus" role="status" aria-live="polite" aria-atomic="true">
            <span aria-hidden="true" className="askGmDot" />
            <span>{stateText[phase]}</span>
          </div>
        </div>
        <div className="askGmPanelControls" aria-label="Front Office Advisor window controls">
          <button type="button" className="askGmIconButton" onClick={movePanel} aria-label="Move Front Office Advisor">
            <MoveIcon />
          </button>
          <button type="button" className="askGmIconButton" onClick={resetPanelPosition} aria-label="Reset Front Office Advisor position">
            <ResetIcon />
          </button>
          <button type="button" className="askGmIconButton" onClick={closePanel} aria-label="Close Front Office Advisor">
            <CloseIcon />
          </button>
        </div>
      </div>
      <p className="srOnly" id="ask-gm-permission">
        {microphonePermissionCopy()}
      </p>
      {!voiceInputEnabled && (
        <p className="srOnly" role="status">
          Front Office Advisor voice input is off. Typed Ask Advisor is available.
        </p>
      )}

      {state.partialTranscript && (
        <p className="askGmTranscript" aria-label={`Transcript: ${state.partialTranscript}`}>
          {state.partialTranscript}
        </p>
      )}
      {state.lastAnswer && (
        <p className="askGmResponse" aria-label={`Front Office Advisor response: ${state.lastAnswer.text}`}>
          {state.lastAnswer.text}
        </p>
      )}

      {/* Conversation transcript. The written record is always present, so a
          spoken answer is never the only copy of the response. */}
      {state.turns.length > 0 && (
        <div ref={transcriptRef} className="askGmHistory" tabIndex={-1} aria-label="Front Office Advisor conversation transcript">
          <ol className="askGmTurns">
            {state.turns.map((turn, index) => (
              <li key={index} className={`askGmTurn is-${turn.role}`}>
                <span className="askGmTurnRole">{turn.role === 'manager' ? 'You' : 'Front Office Advisor'}</span>
                <span className="askGmTurnText">{turn.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <form className="askGmTypedSubmit" onSubmit={submitTyped}>
        <label className="askGmTypedFallback">
          <span className="srOnly">Type your Front Office Advisor question</span>
          <input
            ref={typedInputRef}
            id="ask-gm-typed-fallback"
            value={state.draftText}
            onChange={event => send({ type: 'changeDraft', text: event.target.value })}
            placeholder="Type Ask Advisor question"
          />
        </label>
        <button type="submit" className="secondary askGmButton" disabled={!state.draftText.trim()} aria-label="Send typed Front Office Advisor question">
          Ask
        </button>
      </form>

      {phase === 'idle' && (
        <button
          ref={askButtonRef}
          type="button"
          className="secondary askGmButton"
          onClick={startListening}
          aria-describedby="ask-gm-permission"
          aria-label="Start push to talk with Front Office Advisor"
        >
          Ask Advisor
        </button>
      )}
      {phase === 'listening' && (
        <div className="askGmActions">
          <button type="button" className="primary askGmButton" onClick={finishListening} aria-label="Finish speaking to Front Office Advisor">
            Finish
          </button>
          <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel Front Office Advisor listening">
            Cancel
          </button>
        </div>
      )}
      {phase === 'processing' && (
        <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel Front Office Advisor processing">
          Cancel
        </button>
      )}
      {phase === 'speaking' && (
        <div className="askGmActions">
          <button type="button" className="secondary askGmButton" onClick={stopSpeech} aria-label="Stop Front Office Advisor speech">
            Stop
          </button>
          <button
            type="button"
            className="secondary askGmButton"
            onClick={replaySpeech}
            disabled={!state.lastAnswer}
            aria-label="Replay last Front Office Advisor response"
          >
            Replay
          </button>
        </div>
      )}
      {phase === 'error' && (
        <>
          <p ref={errorRef} className="askGmError" role="alert" tabIndex={-1}>
            {state.error?.message}
          </p>
          <div className="askGmActions">
            {state.error?.retry !== false && (
              <button
                type="button"
                className="primary askGmButton"
                onClick={startListening}
                aria-describedby="ask-gm-permission"
                aria-label="Retry push to talk with Front Office Advisor"
              >
                Retry
              </button>
            )}
            <a className="secondary askGmButton" href="#ask-gm-typed-fallback" aria-label="Type Front Office Advisor request instead">
              Type instead
            </a>
            <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel and return from Front Office Advisor error">
              Cancel
            </button>
          </div>
        </>
      )}

      {state.canTellMeMore && (
        <button type="button" className="secondary askGmButton" onClick={tellMeMore} aria-label="Ask Front Office Advisor to tell me more">
          Tell me more
        </button>
      )}

      <VisuallyHidden>Front Office Advisor spoken responses keep text visible and can be stopped or replayed.</VisuallyHidden>
      <VisuallyHidden>No always-listening behavior is active. Listening starts only after pressing Ask Advisor.</VisuallyHidden>
      </div>
    </div>
  );
}

type AskGmDockPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

function isAskGmDockPosition(value: string | null): value is AskGmDockPosition {
  return value === 'bottom-right' || value === 'bottom-left' || value === 'top-right' || value === 'top-left';
}

function CoachHeadIcon() {
  return (
    <svg className="askGmCoachIcon" viewBox="0 0 64 64" focusable="false" aria-hidden="true">
      <path d="M14 26c1-10 8-17 19-17 9 0 16 5 18 13 4 1 7 5 7 10 0 6-4 10-10 10h-2c-4 8-11 13-20 13-10 0-18-6-21-15 6-1 9-4 9-8v-6Z" />
      <path d="M18 23c3-8 9-12 18-12 7 0 13 3 16 9-8-1-16-1-24 1-4 1-7 1-10 2Z" className="askGmCoachCap" />
      <path d="M24 34h11M23 28h8M41 28h5" />
      <path d="M46 35h9" className="askGmCoachMic" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg className="askGmWindowIcon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg className="askGmWindowIcon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M5 12a7 7 0 1 0 2-5M5 5v5h5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="askGmWindowIcon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
