import { describe, expect, it, vi } from 'vitest';
import {
  createBoundedSpeechCapture,
  createBrowserSpeechProvider,
  DEFAULT_CAPTURE_LIMIT_MS,
  MAX_CAPTURE_LIMIT_MS,
  resolveCaptureLimitMs,
  selectSpeechToTextProvider,
  type SpeechCaptureTelemetryEvent,
  type SpeechToTextProvider
} from './speechProvider';
import type { SpeechToTextAdapter } from './speechToText';

function fakeAdapter(overrides: Partial<SpeechToTextAdapter> = {}) {
  const callbacks: {
    onResult?: (result: { transcript: string; isFinal: boolean }) => void;
    onError?: (message: string) => void;
    onEnd?: () => void;
  } = {};

  const adapter: SpeechToTextAdapter & { callbacks: typeof callbacks } = {
    callbacks,
    isSupported: () => true,
    start: vi.fn(cbs => {
      callbacks.onResult = cbs.onResult;
      callbacks.onError = cbs.onError;
      callbacks.onEnd = cbs.onEnd;
    }),
    stop: vi.fn(),
    abort: vi.fn(),
    ...overrides
  };

  return adapter;
}

function fakeProvider(adapter: SpeechToTextAdapter, overrides: Partial<SpeechToTextProvider> = {}): SpeechToTextProvider {
  return {
    id: 'test_provider',
    label: 'Test provider',
    kind: 'browser',
    isAvailable: () => true,
    create: () => adapter,
    ...overrides
  };
}

/** Manual timer control so the duration cap is tested without real waiting. */
function manualTimers() {
  const pending: Array<{ handler: () => void; ms: number }> = [];
  return {
    pending,
    timers: {
      setTimer: (handler: () => void, ms: number) => {
        pending.push({ handler, ms });
        return pending.length - 1;
      },
      clearTimer: (handle: unknown) => {
        const index = handle as number;
        if (pending[index]) pending[index] = { handler: () => {}, ms: 0 };
      }
    },
    fire: () => pending.forEach(entry => entry.handler())
  };
}

describe('speech provider selection', () => {
  const available = fakeProvider(fakeAdapter());
  const unavailable = fakeProvider(fakeAdapter(), { id: 'missing', isAvailable: () => false });

  it('selects the first available provider', () => {
    const result = selectSpeechToTextProvider({ providers: [unavailable, available], voiceInputEnabled: true });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.provider.id).toBe('test_provider');
  });

  it('refuses selection when voice input is disabled and points at typing', () => {
    const result = selectSpeechToTextProvider({ providers: [available], voiceInputEnabled: false });

    expect(result).toMatchObject({ ok: false, reason: 'voice_input_disabled' });
    expect(result.ok === false && result.message).toContain('Type your question instead');
  });

  it('reports no provider rather than failing silently', () => {
    const result = selectSpeechToTextProvider({ providers: [unavailable], voiceInputEnabled: true });

    expect(result).toMatchObject({ ok: false, reason: 'no_provider_available' });
  });

  it('never selects a cloud provider unless cloud capture is explicitly enabled', () => {
    const cloud = fakeProvider(fakeAdapter(), { id: 'cloud_stt', kind: 'cloud' });

    expect(selectSpeechToTextProvider({ providers: [cloud], voiceInputEnabled: true })).toMatchObject({
      ok: false,
      reason: 'no_provider_available'
    });
    expect(selectSpeechToTextProvider({ providers: [cloud], voiceInputEnabled: true, cloudEnabled: true })).toMatchObject({
      ok: true
    });
  });

  it('does not select a flagged-on but unconfigured cloud provider', () => {
    const unconfiguredCloud = fakeProvider(fakeAdapter(), { id: 'cloud_stt', kind: 'cloud', isAvailable: () => false });

    expect(
      selectSpeechToTextProvider({ providers: [unconfiguredCloud], voiceInputEnabled: true, cloudEnabled: true })
    ).toMatchObject({ ok: false, reason: 'no_provider_available' });
  });

  it('exposes the existing browser adapter as a provider', () => {
    const provider = createBrowserSpeechProvider({} as never);

    expect(provider).toMatchObject({ id: 'browser_web_speech', kind: 'browser' });
    expect(provider.isAvailable()).toBe(false);
  });
});

describe('capture duration cap', () => {
  it('defaults and clamps the capture limit', () => {
    expect(resolveCaptureLimitMs()).toBe(DEFAULT_CAPTURE_LIMIT_MS);
    expect(resolveCaptureLimitMs(0)).toBe(DEFAULT_CAPTURE_LIMIT_MS);
    expect(resolveCaptureLimitMs(-5)).toBe(DEFAULT_CAPTURE_LIMIT_MS);
    expect(resolveCaptureLimitMs(5_000)).toBe(5_000);
    expect(resolveCaptureLimitMs(120_000)).toBe(MAX_CAPTURE_LIMIT_MS);
  });

  it('stops capture and delivers the partial transcript when the cap is reached', () => {
    const adapter = fakeAdapter();
    const clock = manualTimers();
    const onFinal = vi.fn();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: clock.timers });

    capture.start({ onFinal, onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'who is on my bench', isFinal: false });
    clock.fire();

    expect(adapter.stop).toHaveBeenCalled();
    expect(onFinal).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: 'who is on my bench', cappedAtLimit: true })
    );
  });

  it('uses the caller limit for the cap timer', () => {
    const clock = manualTimers();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(fakeAdapter()), timers: clock.timers });

    capture.start({ limitMs: 4_000, onFinal: vi.fn(), onError: vi.fn() });

    expect(clock.pending[0]?.ms).toBe(4_000);
  });

  it('delivers a result only once when the provider also ends', () => {
    const adapter = fakeAdapter();
    const clock = manualTimers();
    const onFinal = vi.fn();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: clock.timers });

    capture.start({ onFinal, onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'my score', isFinal: true });
    adapter.callbacks.onEnd?.();
    clock.fire();

    expect(onFinal).toHaveBeenCalledTimes(1);
  });
});

describe('exact entity confirmation', () => {
  it('requires confirmation when the capture fills an exact-entity field', () => {
    const adapter = fakeAdapter();
    const onFinal = vi.fn();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: manualTimers().timers });

    capture.start({ exactEntity: true, onFinal, onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'sam carter', isFinal: true });

    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ requiresConfirmation: true }));
  });

  it('does not require confirmation for an ordinary question', () => {
    const adapter = fakeAdapter();
    const onFinal = vi.fn();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: manualTimers().timers });

    capture.start({ onFinal, onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'am i winning', isFinal: true });

    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ requiresConfirmation: false }));
  });

  it('previews interim transcript during capture', () => {
    const adapter = fakeAdapter();
    const onInterim = vi.fn();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: manualTimers().timers });

    capture.start({ onInterim, onFinal: vi.fn(), onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'sam', isFinal: false });
    adapter.callbacks.onResult?.({ transcript: 'sam carter', isFinal: false });

    expect(onInterim).toHaveBeenNthCalledWith(1, 'sam');
    expect(onInterim).toHaveBeenNthCalledWith(2, 'sam carter');
  });
});

describe('capture telemetry', () => {
  function collect() {
    const events: SpeechCaptureTelemetryEvent[] = [];
    return { events, telemetry: (event: SpeechCaptureTelemetryEvent) => events.push(event) };
  }

  it('emits start and final events with provider id and duration', () => {
    const adapter = fakeAdapter();
    const sink = collect();
    let clockValue = 1_000;
    const capture = createBoundedSpeechCapture({
      provider: fakeProvider(adapter),
      telemetry: sink.telemetry,
      now: () => clockValue,
      timers: manualTimers().timers
    });

    capture.start({ onFinal: vi.fn(), onError: vi.fn() });
    clockValue = 3_500;
    adapter.callbacks.onResult?.({ transcript: 'my score', isFinal: true });

    expect(sink.events.map(event => event.event)).toEqual(['start', 'final']);
    expect(sink.events[1]).toMatchObject({ providerId: 'test_provider', durationMs: 2_500, transcriptLength: 8 });
  });

  it('never puts transcript content in telemetry', () => {
    const adapter = fakeAdapter();
    const sink = collect();
    const capture = createBoundedSpeechCapture({
      provider: fakeProvider(adapter),
      telemetry: sink.telemetry,
      timers: manualTimers().timers
    });

    capture.start({ onFinal: vi.fn(), onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'trade sam carter to dana', isFinal: true });

    const serialized = JSON.stringify(sink.events);
    expect(serialized).not.toContain('sam carter');
    expect(serialized).not.toContain('trade');
    expect(sink.events.at(-1)?.transcriptLength).toBe(24);
  });

  it('classifies cancel, cap, and error events', () => {
    const cancelAdapter = fakeAdapter();
    const cancelSink = collect();
    const cancelCapture = createBoundedSpeechCapture({
      provider: fakeProvider(cancelAdapter),
      telemetry: cancelSink.telemetry,
      timers: manualTimers().timers
    });
    cancelCapture.start({ onFinal: vi.fn(), onError: vi.fn() });
    cancelCapture.cancel();
    expect(cancelSink.events.at(-1)?.event).toBe('cancel');

    const capAdapter = fakeAdapter();
    const capSink = collect();
    const capClock = manualTimers();
    const capCapture = createBoundedSpeechCapture({
      provider: fakeProvider(capAdapter),
      telemetry: capSink.telemetry,
      timers: capClock.timers
    });
    capCapture.start({ onFinal: vi.fn(), onError: vi.fn() });
    capClock.fire();
    expect(capSink.events.at(-1)?.event).toBe('cap_reached');

    const errorAdapter = fakeAdapter();
    const errorSink = collect();
    const errorCapture = createBoundedSpeechCapture({
      provider: fakeProvider(errorAdapter),
      telemetry: errorSink.telemetry,
      timers: manualTimers().timers
    });
    errorCapture.start({ onFinal: vi.fn(), onError: vi.fn() });
    errorAdapter.callbacks.onError?.('device busy');
    expect(errorSink.events.at(-1)).toMatchObject({ event: 'error', errorClass: 'capture_failed' });
  });

  it('reports an unsupported provider without starting capture', () => {
    const adapter = fakeAdapter({ isSupported: () => false });
    const sink = collect();
    const onError = vi.fn();
    const capture = createBoundedSpeechCapture({
      provider: fakeProvider(adapter),
      telemetry: sink.telemetry,
      timers: manualTimers().timers
    });

    capture.start({ onFinal: vi.fn(), onError });

    expect(adapter.start).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ errorClass: 'unsupported' }));
    expect(sink.events.at(-1)?.event).toBe('error');
  });
});

describe('no permanent recording state', () => {
  it('retains nothing after a completed capture', () => {
    const adapter = fakeAdapter();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: manualTimers().timers });

    capture.start({ onFinal: vi.fn(), onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'my score', isFinal: true });

    expect(capture.isCapturing()).toBe(false);
    expect(capture.retainedTranscript()).toBeNull();
  });

  it('discards the transcript on cancel without delivering a result', () => {
    const adapter = fakeAdapter();
    const onFinal = vi.fn();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: manualTimers().timers });

    capture.start({ onFinal, onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'never send this', isFinal: false });
    capture.cancel();

    expect(adapter.abort).toHaveBeenCalledTimes(1);
    expect(onFinal).not.toHaveBeenCalled();
    expect(capture.retainedTranscript()).toBeNull();
  });

  it('retains nothing after a capture failure', () => {
    const adapter = fakeAdapter();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: manualTimers().timers });

    capture.start({ onFinal: vi.fn(), onError: vi.fn() });
    adapter.callbacks.onResult?.({ transcript: 'partial words', isFinal: false });
    adapter.callbacks.onError?.('device busy');

    expect(capture.retainedTranscript()).toBeNull();
    expect(capture.isCapturing()).toBe(false);
  });

  it('does not start a second capture while one is active', () => {
    const adapter = fakeAdapter();
    const capture = createBoundedSpeechCapture({ provider: fakeProvider(adapter), timers: manualTimers().timers });

    capture.start({ onFinal: vi.fn(), onError: vi.fn() });
    capture.start({ onFinal: vi.fn(), onError: vi.fn() });

    expect(adapter.start).toHaveBeenCalledTimes(1);
  });
});
