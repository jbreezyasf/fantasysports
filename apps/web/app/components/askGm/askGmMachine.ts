/**
 * BE-VOICE-100 — Ask GM interaction state machine.
 *
 * This module holds all Ask GM interaction behavior as a pure reducer so the
 * states, announcements, and focus moves are testable without a DOM. The React
 * control renders a snapshot of this state and applies the emitted focus request.
 *
 * Speech capture (BE-VOICE-101) and spoken output (BE-VOICE-102) are separate
 * tasks. This machine models when those adapters are invoked and how their
 * failures degrade, but it does not implement them.
 */

import { voiceErrorUx, type VoiceErrorCode } from '../../../lib/voice/voiceErrors';

export type AskGmPhase = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type AskGmInputMode = 'voice' | 'typed';

export type AskGmErrorCode =
  | 'microphone_denied'
  | 'transcription_failed'
  | 'assistant_failed'
  | 'tool_timeout'
  | 'speech_failed'
  | 'not_permitted';

/**
 * Reuses the BE-VOICE-054 error copy where a matching code already exists so the
 * spoken and typed surfaces do not drift apart.
 */
const reusedVoiceErrorCode: Partial<Record<AskGmErrorCode, VoiceErrorCode>> = {
  transcription_failed: 'speech_not_understood',
  assistant_failed: 'network_failure',
  tool_timeout: 'tool_timeout'
};

export type AskGmError = {
  code: AskGmErrorCode;
  message: string;
  /** Recovery affordances the UI must render. Always includes a way forward. */
  retry: boolean;
  typeInstead: boolean;
  cancel: boolean;
};

export type AskGmTurn =
  | { role: 'manager'; text: string; source: 'voice' | 'typed' }
  | { role: 'assistant'; text: string; detail?: string; category?: string };

export type AskGmFocusTarget =
  | 'trigger'
  | 'panel'
  | 'pushToTalk'
  | 'typedInput'
  | 'transcript'
  | 'errorMessage';

export type AskGmAnnouncement = {
  message: string;
  priority: 'polite' | 'assertive';
  channel: 'gm';
};

export type AskGmCapabilities = {
  /** False when no STT adapter is wired or the voice-input flag is off. */
  voiceInput: boolean;
  /** False when no TTS adapter is wired; the transcript still renders. */
  spokenOutput: boolean;
  /**
   * True while a time-critical gameplay control is on screen (running draft
   * clock, live lineup lock). The panel must stay inline and non-modal.
   */
  criticalControlsActive: boolean;
};

export type AskGmState = {
  open: boolean;
  phase: AskGmPhase;
  inputMode: AskGmInputMode;
  /** Live speech preview. Never treated as a submitted question. */
  partialTranscript: string;
  draftText: string;
  turns: AskGmTurn[];
  lastAnswer: { text: string; detail?: string } | null;
  error: AskGmError | null;
  canStop: boolean;
  canReplay: boolean;
  canTellMeMore: boolean;
  focusRequest: AskGmFocusTarget | null;
  announcement: AskGmAnnouncement | null;
  capabilities: AskGmCapabilities;
};

export type AskGmEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'pressToTalk' }
  | { type: 'releaseToTalk' }
  | { type: 'interimTranscript'; text: string }
  | { type: 'chooseTypeInstead' }
  | { type: 'chooseVoice' }
  | { type: 'changeDraft'; text: string }
  | { type: 'submitTyped' }
  | { type: 'answer'; text: string; detail?: string }
  | { type: 'speechEnded' }
  | { type: 'stop' }
  | { type: 'replay' }
  | { type: 'tellMeMore' }
  | { type: 'cancel' }
  | { type: 'fail'; error: AskGmErrorCode; message?: string }
  | { type: 'retry' };

const ownErrorCopy: Record<AskGmErrorCode, string> = {
  microphone_denied: 'Big Exec could not use the microphone. Type your question instead.',
  transcription_failed: '',
  assistant_failed: '',
  tool_timeout: '',
  speech_failed: 'Assistant GM could not speak the answer. The written answer is below.',
  not_permitted: 'Assistant GM is not available here.'
};

export function askGmErrorMessage(code: AskGmErrorCode) {
  const reused = reusedVoiceErrorCode[code];
  return reused ? voiceErrorUx(reused).message : ownErrorCopy[code];
}

export function createAskGmError(code: AskGmErrorCode, message?: string): AskGmError {
  return {
    code,
    message: message ?? askGmErrorMessage(code),
    // Microphone denial cannot be retried by repeating the same request, so the
    // recovery is the typed path. Everything else offers retry as well.
    retry: code !== 'microphone_denied' && code !== 'not_permitted',
    typeInstead: code !== 'not_permitted',
    cancel: true
  };
}

export function createAskGmState(capabilities: Partial<AskGmCapabilities> = {}): AskGmState {
  const resolved: AskGmCapabilities = {
    voiceInput: capabilities.voiceInput ?? false,
    spokenOutput: capabilities.spokenOutput ?? false,
    criticalControlsActive: capabilities.criticalControlsActive ?? false
  };

  return {
    open: false,
    phase: 'idle',
    // Without a voice adapter the typed path is the primary path, not a fallback
    // the manager has to discover.
    inputMode: resolved.voiceInput ? 'voice' : 'typed',
    partialTranscript: '',
    draftText: '',
    turns: [],
    lastAnswer: null,
    error: null,
    canStop: false,
    canReplay: false,
    canTellMeMore: false,
    focusRequest: null,
    announcement: null,
    capabilities: resolved
  };
}

function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): AskGmAnnouncement {
  return { message, priority, channel: 'gm' };
}

/** Clears per-transition outputs so a consumer never replays a stale focus move. */
function base(state: AskGmState): AskGmState {
  return { ...state, focusRequest: null, announcement: null };
}

export function askGmReducer(state: AskGmState, event: AskGmEvent): AskGmState {
  const next = base(state);

  switch (event.type) {
    case 'open': {
      if (state.open) return next;
      return {
        ...next,
        open: true,
        phase: 'idle',
        error: null,
        focusRequest: next.inputMode === 'typed' ? 'typedInput' : 'pushToTalk',
        announcement: announce('Assistant GM ready.')
      };
    }

    case 'close': {
      if (!state.open) return next;
      return {
        ...next,
        open: false,
        phase: 'idle',
        partialTranscript: '',
        canStop: false,
        // Focus always returns to the control that opened the panel.
        focusRequest: 'trigger',
        announcement: announce('Assistant GM closed.')
      };
    }

    case 'pressToTalk': {
      if (!state.capabilities.voiceInput) {
        return {
          ...next,
          phase: 'error',
          inputMode: 'typed',
          error: createAskGmError('microphone_denied'),
          focusRequest: 'typedInput',
          announcement: announce(askGmErrorMessage('microphone_denied'), 'assertive')
        };
      }
      if (state.phase === 'listening') return next;

      return {
        ...next,
        phase: 'listening',
        inputMode: 'voice',
        partialTranscript: '',
        error: null,
        canStop: true,
        announcement: announce('Listening.')
      };
    }

    case 'interimTranscript': {
      if (state.phase !== 'listening') return next;
      return { ...next, partialTranscript: event.text };
    }

    case 'releaseToTalk': {
      if (state.phase !== 'listening') return next;

      const spoken = state.partialTranscript.trim();
      if (!spoken) {
        return {
          ...next,
          phase: 'idle',
          canStop: false,
          announcement: announce('Nothing heard. Try again or type your question.')
        };
      }

      return {
        ...next,
        phase: 'processing',
        partialTranscript: '',
        canStop: true,
        turns: [...state.turns, { role: 'manager', text: spoken, source: 'voice' }],
        announcement: announce('Working on it.')
      };
    }

    case 'chooseTypeInstead': {
      return {
        ...next,
        inputMode: 'typed',
        phase: state.phase === 'listening' ? 'idle' : state.phase,
        partialTranscript: '',
        canStop: state.phase === 'listening' ? false : state.canStop,
        focusRequest: 'typedInput',
        announcement: announce('Type your question.')
      };
    }

    case 'chooseVoice': {
      if (!state.capabilities.voiceInput) return next;
      return {
        ...next,
        inputMode: 'voice',
        focusRequest: 'pushToTalk',
        announcement: announce('Voice input ready.')
      };
    }

    case 'changeDraft':
      return { ...next, draftText: event.text };

    case 'submitTyped': {
      const typed = state.draftText.trim();
      if (!typed) return next;

      return {
        ...next,
        phase: 'processing',
        draftText: '',
        error: null,
        canStop: true,
        turns: [...state.turns, { role: 'manager', text: typed, source: 'typed' }],
        announcement: announce('Working on it.')
      };
    }

    case 'answer': {
      const turns: AskGmTurn[] = [...state.turns, { role: 'assistant', text: event.text, detail: event.detail }];
      const speaking = state.capabilities.spokenOutput;

      return {
        ...next,
        phase: speaking ? 'speaking' : 'idle',
        turns,
        lastAnswer: { text: event.text, detail: event.detail },
        error: null,
        canStop: speaking,
        canReplay: speaking,
        canTellMeMore: Boolean(event.detail),
        // The written answer is announced even when speech is unavailable, so a
        // TTS failure never costs the manager the response.
        announcement: announce(event.text)
      };
    }

    case 'speechEnded': {
      if (state.phase !== 'speaking') return next;
      return { ...next, phase: 'idle', canStop: false };
    }

    case 'stop': {
      // Stop is immediate and always available while speaking or processing.
      if (state.phase !== 'speaking' && state.phase !== 'processing') return next;
      return {
        ...next,
        phase: 'idle',
        canStop: false,
        announcement: announce('Stopped.', 'assertive')
      };
    }

    case 'replay': {
      if (!state.lastAnswer) return next;
      return {
        ...next,
        phase: state.capabilities.spokenOutput ? 'speaking' : 'idle',
        canStop: state.capabilities.spokenOutput,
        announcement: announce(state.lastAnswer.text)
      };
    }

    case 'tellMeMore': {
      if (!state.canTellMeMore) return next;
      return {
        ...next,
        phase: 'processing',
        canStop: true,
        announcement: announce('Getting more detail.')
      };
    }

    case 'cancel': {
      return {
        ...next,
        phase: 'idle',
        partialTranscript: '',
        error: null,
        canStop: false,
        // Cancel returns the manager to the control they can act on next rather
        // than dropping focus to the document body.
        focusRequest: state.inputMode === 'typed' ? 'typedInput' : 'pushToTalk',
        announcement: announce('Canceled.')
      };
    }

    case 'fail': {
      const error = createAskGmError(event.error, event.message);
      const speechOnly = event.error === 'speech_failed';

      return {
        ...next,
        // A speech failure must leave the text answer intact and usable.
        phase: speechOnly ? 'idle' : 'error',
        error,
        canStop: false,
        canReplay: speechOnly ? false : state.canReplay,
        inputMode: event.error === 'microphone_denied' ? 'typed' : state.inputMode,
        focusRequest: event.error === 'microphone_denied' ? 'typedInput' : 'errorMessage',
        announcement: announce(error.message, 'assertive')
      };
    }

    case 'retry': {
      if (!state.error?.retry) return next;
      return {
        ...next,
        phase: 'idle',
        error: null,
        focusRequest: state.inputMode === 'typed' ? 'typedInput' : 'pushToTalk',
        announcement: announce('Ready to try again.')
      };
    }

    default:
      return next;
  }
}

export const askGmPhaseLabels: Record<AskGmPhase, string> = {
  idle: 'Ready',
  listening: 'Listening',
  processing: 'Working',
  speaking: 'Speaking',
  error: 'Needs attention'
};

/**
 * The panel must never be modal while a time-critical gameplay control is live.
 * Trapping focus during a running draft clock would obstruct the pick controls.
 */
export function shouldTrapFocus(state: AskGmState) {
  return state.open && !state.capabilities.criticalControlsActive;
}

export function askGmDialogRole(state: AskGmState): 'dialog' | 'region' {
  return shouldTrapFocus(state) ? 'dialog' : 'region';
}
