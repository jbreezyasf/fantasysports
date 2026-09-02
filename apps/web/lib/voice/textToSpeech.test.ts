import { describe, expect, it, vi } from 'vitest';
import { createBrowserTextToSpeech } from './textToSpeech';

class FakeUtterance {
  lang = '';
  rate = 0;
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  constructor(public text: string) {}
}

describe('browser text-to-speech adapter', () => {
  it('reports unsupported browsers without losing the text response', () => {
    const adapter = createBrowserTextToSpeech({} as Parameters<typeof createBrowserTextToSpeech>[0]);
    const onError = vi.fn();

    adapter.speak('Lineup looks good.', { onError });

    expect(adapter.isSupported()).toBe(false);
    expect(adapter.lastText()).toBe('Lineup looks good.');
    expect(onError).toHaveBeenCalledWith('Text-to-speech is not supported in this browser.');
  });

  it('speaks text and can stop speech', () => {
    const synthesis = { speak: vi.fn(), cancel: vi.fn() };
    const adapter = createBrowserTextToSpeech({
      speechSynthesis: synthesis,
      SpeechSynthesisUtterance: FakeUtterance
    } as unknown as Window & { speechSynthesis: typeof synthesis; SpeechSynthesisUtterance: typeof FakeUtterance });

    adapter.speak('You are winning.');
    adapter.stop();

    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(adapter.lastText()).toBe('You are winning.');
  });

  it('replays the last response', () => {
    const synthesis = { speak: vi.fn(), cancel: vi.fn() };
    const adapter = createBrowserTextToSpeech({
      speechSynthesis: synthesis,
      SpeechSynthesisUtterance: FakeUtterance
    } as unknown as Window & { speechSynthesis: typeof synthesis; SpeechSynthesisUtterance: typeof FakeUtterance });

    adapter.speak('Bench has two players.');
    adapter.replay();

    expect(synthesis.speak).toHaveBeenCalledTimes(2);
    expect(adapter.lastText()).toBe('Bench has two players.');
  });
});
