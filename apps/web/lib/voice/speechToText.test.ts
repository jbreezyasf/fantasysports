import { describe, expect, it, vi } from 'vitest';
import { createBrowserSpeechToText, microphonePermissionCopy } from './speechToText';

class FakeRecognition {
  continuous = true;
  interimResults = false;
  lang = '';
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((event: { error?: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
}

describe('browser speech-to-text adapter', () => {
  it('explains microphone permission and cancellation', () => {
    expect(microphonePermissionCopy()).toContain('starts only after you press Ask GM');
    expect(microphonePermissionCopy()).toContain('cancel listening');
  });

  it('reports unsupported browsers without starting capture', () => {
    const adapter = createBrowserSpeechToText({} as Window);
    const onError = vi.fn();

    adapter.start({ onResult: vi.fn(), onError });

    expect(adapter.isSupported()).toBe(false);
    expect(onError).toHaveBeenCalledWith('Speech recognition is not supported in this browser.');
  });

  it('starts only when start is called and returns transcripts', () => {
    const recognition = new FakeRecognition();
    const Recognition = vi.fn(() => recognition);
    const adapter = createBrowserSpeechToText({ SpeechRecognition: Recognition } as unknown as Window & { SpeechRecognition: typeof FakeRecognition });
    const onResult = vi.fn();

    expect(Recognition).not.toHaveBeenCalled();
    adapter.start({ onResult, onError: vi.fn() });
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: ' read my lineup ' } }] });

    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    expect(onResult).toHaveBeenCalledWith({ transcript: 'read my lineup', isFinal: true });
  });

  it('supports user cancellation through abort', () => {
    const recognition = new FakeRecognition();
    const adapter = createBrowserSpeechToText({ SpeechRecognition: vi.fn(() => recognition) } as unknown as Window & { SpeechRecognition: typeof FakeRecognition });

    adapter.start({ onResult: vi.fn(), onError: vi.fn() });
    adapter.abort();

    expect(recognition.abort).toHaveBeenCalledTimes(1);
  });
});
