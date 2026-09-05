import { createBrowserSpeechToText, type SpeechToTextAdapter } from './speechToText';

/**
 * BE-VOICE-101 — speech-to-text provider abstraction, capture limits, telemetry.
 *
 * The browser Web Speech adapter (BE-VOICE-052) stays the implementation. This
 * module adds what the BE-EXEC-000 inventory recorded as missing: a provider
 * abstraction, a recording duration cap, and telemetry.
 *
 * ADR_ASSISTANT_GM records "No cloud STT/TTS provider is selected", so no cloud
 * provider is implemented here. The registry accepts one behind an explicit flag
 * and configuration check when a real provider is chosen.
 */

export type SpeechToTextProvider = {
  id: string;
  label: string;
  kind: 'browser' | 'cloud';
  /**
   * Cloud providers must be both flagged on and configured. A provider that
   * reports unavailable is never selected, so a missing key cannot silently
   * route audio to an unconfigured service.
   */
  isAvailable: () => boolean;
  create: () => SpeechToTextAdapter;
};

export type SpeechProviderWindow = Parameters<typeof createBrowserSpeechToText>[0];

export function createBrowserSpeechProvider(win?: SpeechProviderWindow): SpeechToTextProvider {
  return {
    id: 'browser_web_speech',
    label: 'Browser speech recognition',
    kind: 'browser',
    isAvailable: () => createBrowserSpeechToText(win).isSupported(),
    create: () => createBrowserSpeechToText(win)
  };
}

export type SpeechProviderSelection =
  | { ok: true; provider: SpeechToTextProvider }
  | { ok: false; reason: 'voice_input_disabled' | 'no_provider_available'; message: string };

/**
 * Picks the first available provider in preference order. Cloud providers are
 * only considered when `cloudEnabled` is set, keeping paid capture behind an
 * explicit switch.
 */
export function selectSpeechToTextProvider(input: {
  providers: SpeechToTextProvider[];
  voiceInputEnabled: boolean;
  cloudEnabled?: boolean;
}): SpeechProviderSelection {
  if (!input.voiceInputEnabled) {
    return {
      ok: false,
      reason: 'voice_input_disabled',
      message: 'Voice input is turned off. Type your question instead.'
    };
  }

  const eligible = input.providers.filter(provider => provider.kind === 'browser' || input.cloudEnabled);
  const provider = eligible.find(candidate => candidate.isAvailable());

  if (!provider) {
    return {
      ok: false,
      reason: 'no_provider_available',
      message: 'Speech recognition is not available here. Type your question instead.'
    };
  }

  return { ok: true, provider };
}

/** Request-based capture only. Continuous ambient listening is out of scope. */
export const DEFAULT_CAPTURE_LIMIT_MS = 15_000;
export const MAX_CAPTURE_LIMIT_MS = 30_000;

export function resolveCaptureLimitMs(requested?: number) {
  if (!requested || !Number.isFinite(requested) || requested <= 0) return DEFAULT_CAPTURE_LIMIT_MS;
  return Math.min(requested, MAX_CAPTURE_LIMIT_MS);
}

export type SpeechCaptureTelemetryEvent = {
  providerId: string;
  event: 'start' | 'final' | 'cancel' | 'cap_reached' | 'error';
  durationMs: number;
  /**
   * Length only. Transcript content is deliberately excluded: ADR section 8
   * avoids storing transcript text where metrics are sufficient.
   */
  transcriptLength: number;
  errorClass?: string;
};

export type SpeechCaptureResult = {
  transcript: string;
  /** True when the caller declared this capture fills an exact-entity field. */
  requiresConfirmation: boolean;
  cappedAtLimit: boolean;
  durationMs: number;
};

export type SpeechCaptureOptions = {
  /**
   * Set for player names, emails, and numbers, where a near-miss is a different
   * real entity. The result must be previewed and confirmed, never auto-applied.
   */
  exactEntity?: boolean;
  limitMs?: number;
  onInterim?: (transcript: string) => void;
  onFinal: (result: SpeechCaptureResult) => void;
  onError: (error: { message: string; errorClass: 'unsupported' | 'capture_failed' }) => void;
};

export type BoundedSpeechCapture = {
  start: (options: SpeechCaptureOptions) => void;
  /** Ends capture and delivers whatever was heard. */
  stop: () => void;
  /** Discards the capture without delivering a result. */
  cancel: () => void;
  isCapturing: () => boolean;
  /**
   * Always null once capture ends. Proves no permanent recording state: audio is
   * never buffered here and the interim transcript is cleared on every exit.
   */
  retainedTranscript: () => string | null;
};

type Timers = {
  setTimer: (handler: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export function createBoundedSpeechCapture(input: {
  provider: SpeechToTextProvider;
  telemetry?: (event: SpeechCaptureTelemetryEvent) => void;
  now?: () => number;
  timers?: Timers;
}): BoundedSpeechCapture {
  const now = input.now ?? (() => Date.now());
  const timers: Timers = input.timers ?? {
    setTimer: (handler, ms) => setTimeout(handler, ms),
    clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>)
  };

  let adapter: SpeechToTextAdapter | null = null;
  let interim = '';
  let startedAt = 0;
  let capHandle: unknown = null;
  let capped = false;
  let settled = false;

  function emit(event: SpeechCaptureTelemetryEvent['event'], extra: { transcriptLength?: number; errorClass?: string } = {}) {
    input.telemetry?.({
      providerId: input.provider.id,
      event,
      durationMs: startedAt ? now() - startedAt : 0,
      transcriptLength: extra.transcriptLength ?? 0,
      errorClass: extra.errorClass
    });
  }

  function teardown() {
    if (capHandle !== null) {
      timers.clearTimer(capHandle);
      capHandle = null;
    }
    adapter = null;
    interim = '';
  }

  return {
    start(options) {
      if (adapter) return;

      const created = input.provider.create();
      if (!created.isSupported()) {
        emit('error', { errorClass: 'unsupported' });
        options.onError({ message: 'Speech recognition is not available here.', errorClass: 'unsupported' });
        return;
      }

      adapter = created;
      interim = '';
      capped = false;
      settled = false;
      startedAt = now();
      emit('start');

      const limitMs = resolveCaptureLimitMs(options.limitMs);

      const deliver = () => {
        if (settled) return;
        settled = true;

        const transcript = interim.trim();
        const durationMs = now() - startedAt;
        emit(capped ? 'cap_reached' : 'final', { transcriptLength: transcript.length });
        teardown();

        options.onFinal({
          transcript,
          requiresConfirmation: Boolean(options.exactEntity),
          cappedAtLimit: capped,
          durationMs
        });
      };

      // Hard duration cap: capture cannot run past the limit even if the
      // provider never fires an end event.
      capHandle = timers.setTimer(() => {
        if (!adapter || settled) return;
        capped = true;
        adapter.stop();
        deliver();
      }, limitMs);

      created.start({
        onResult: result => {
          interim = result.transcript;
          options.onInterim?.(result.transcript);
          if (result.isFinal) deliver();
        },
        onError: message => {
          if (settled) return;
          settled = true;
          emit('error', { errorClass: 'capture_failed' });
          teardown();
          options.onError({ message, errorClass: 'capture_failed' });
        },
        onEnd: deliver
      });
    },

    stop() {
      adapter?.stop();
    },

    cancel() {
      if (!adapter) return;
      settled = true;
      adapter.abort();
      emit('cancel');
      teardown();
    },

    isCapturing: () => adapter !== null,
    retainedTranscript: () => (adapter ? interim : null)
  };
}
