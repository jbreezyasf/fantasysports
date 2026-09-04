'use client';

import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { createBrowserSpeechToText, microphonePermissionCopy, type SpeechToTextAdapter } from '../../lib/voice/speechToText';
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
 * BE-VOICE-100 — accessible Ask GM control.
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
  idle: 'Ask GM is ready.',
  listening: 'Listening. Speak your question now.',
  processing: 'Processing your question.',
  speaking: 'Speaking Assistant GM response.',
  error: 'Ask GM is unavailable.'
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
  onAsk?: (question: string) => void;
  /** Requests deeper detail for the last answer. */
  onTellMeMore?: () => void;
};

function seedState(input: {
  initialState: AskGmPhase;
  initialResponse: string;
  capabilities?: Partial<AskGmCapabilities>;
}): AskGmState {
  const base = createAskGmState({ voiceInput: true, spokenOutput: true, ...input.capabilities });

  return {
    ...base,
    // The panel is inline in the header, so it starts open at the seeded phase.
    open: true,
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
  onTellMeMore
}: AskGmPushToTalkProps) {
  const [state, dispatch] = useReducer(
    askGmReducer,
    { initialState, initialResponse, capabilities },
    seedState
  );

  const sttRef = useRef<SpeechToTextAdapter | null>(null);
  const ttsRef = useRef<TextToSpeechAdapter | null>(null);

  const askButtonRef = useRef<HTMLButtonElement | null>(null);
  const typedInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback((event: AskGmEvent) => dispatch(event), []);

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

  function startListening() {
    const adapter = createBrowserSpeechToText();
    if (!adapter.isSupported()) {
      send({ type: 'fail', error: 'microphone_denied' });
      return;
    }

    sttRef.current = adapter;
    send({ type: 'pressToTalk' });
    adapter.start({
      onResult: result => send({ type: 'interimTranscript', text: result.transcript }),
      onError: () => send({ type: 'fail', error: 'transcription_failed' }),
      onEnd: () => {
        sttRef.current = null;
      }
    });
  }

  function finishListening() {
    sttRef.current?.stop();
    const question = state.partialTranscript.trim();
    send({ type: 'releaseToTalk' });
    if (question) onAsk?.(question);
  }

  function cancel() {
    sttRef.current?.abort();
    ttsRef.current?.stop();
    sttRef.current = null;
    setGmAudioSpeaking(false);
    send({ type: 'cancel' });
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
    onTellMeMore?.();
  }

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    const question = state.draftText.trim();
    if (!question) return;
    send({ type: 'submitTyped' });
    onAsk?.(question);
  }

  // Policy denial replaces the control with the one shared explanation. The
  // upgrade prompt appears only when a purchase is actually the remedy.
  if (policy && !policy.allowed) {
    return (
      <div className="askGmControl askGmControl--unavailable" aria-label="Assistant GM unavailable">
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
    );
  }

  const phase = state.phase;

  return (
    <div
      ref={rootRef}
      className="askGmControl"
      data-state={phase}
      role={askGmDialogRole(state)}
      aria-label="Assistant GM push to talk"
    >
      <div className="askGmStatus" role="status" aria-live="polite" aria-atomic="true">
        <span aria-hidden="true" className="askGmDot" />
        <span>{stateText[phase]}</span>
      </div>
      <p className="srOnly" id="ask-gm-permission">
        {microphonePermissionCopy()}
      </p>

      {state.partialTranscript && (
        <p className="askGmTranscript" aria-label={`Transcript: ${state.partialTranscript}`}>
          {state.partialTranscript}
        </p>
      )}
      {state.lastAnswer && (
        <p className="askGmResponse" aria-label={`Assistant GM response: ${state.lastAnswer.text}`}>
          {state.lastAnswer.text}
        </p>
      )}

      {/* Conversation transcript. The written record is always present, so a
          spoken answer is never the only copy of the response. */}
      {state.turns.length > 0 && (
        <div ref={transcriptRef} className="askGmHistory" tabIndex={-1} aria-label="Assistant GM conversation transcript">
          <ol className="askGmTurns">
            {state.turns.map((turn, index) => (
              <li key={index} className={`askGmTurn is-${turn.role}`}>
                <span className="askGmTurnRole">{turn.role === 'manager' ? 'You' : 'Assistant GM'}</span>
                <span className="askGmTurnText">{turn.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <label className="askGmTypedFallback">
        <span className="srOnly">Type your Assistant GM question</span>
        <input
          ref={typedInputRef}
          id="ask-gm-typed-fallback"
          value={state.draftText}
          onChange={event => send({ type: 'changeDraft', text: event.target.value })}
          placeholder="Type Ask GM question"
        />
      </label>
      <form className="askGmTypedSubmit" onSubmit={submitTyped}>
        <button type="submit" className="secondary askGmButton" disabled={!state.draftText.trim()} aria-label="Send typed Assistant GM question">
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
          aria-label="Start push to talk with Assistant GM"
        >
          Ask GM
        </button>
      )}
      {phase === 'listening' && (
        <div className="askGmActions">
          <button type="button" className="primary askGmButton" onClick={finishListening} aria-label="Finish speaking to Assistant GM">
            Finish
          </button>
          <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel Assistant GM listening">
            Cancel
          </button>
        </div>
      )}
      {phase === 'processing' && (
        <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel Assistant GM processing">
          Cancel
        </button>
      )}
      {phase === 'speaking' && (
        <div className="askGmActions">
          <button type="button" className="secondary askGmButton" onClick={stopSpeech} aria-label="Stop Assistant GM speech">
            Stop
          </button>
          <button
            type="button"
            className="secondary askGmButton"
            onClick={replaySpeech}
            disabled={!state.lastAnswer}
            aria-label="Replay last Assistant GM response"
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
                aria-label="Retry push to talk with Assistant GM"
              >
                Retry
              </button>
            )}
            <a className="secondary askGmButton" href="#ask-gm-typed-fallback" aria-label="Type Assistant GM request instead">
              Type instead
            </a>
            <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel and return from Assistant GM error">
              Cancel
            </button>
          </div>
        </>
      )}

      {state.canTellMeMore && (
        <button type="button" className="secondary askGmButton" onClick={tellMeMore} aria-label="Ask Assistant GM to tell me more">
          Tell me more
        </button>
      )}

      <VisuallyHidden>Assistant GM spoken responses keep text visible and can be stopped or replayed.</VisuallyHidden>
      <VisuallyHidden>No always-listening behavior is active. Listening starts only after pressing Ask GM.</VisuallyHidden>
    </div>
  );
}
