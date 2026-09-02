export type TextToSpeechAdapter = {
  isSupported: () => boolean;
  speak: (text: string, callbacks?: { onEnd?: () => void; onError?: (message: string) => void }) => void;
  stop: () => void;
  replay: (callbacks?: { onEnd?: () => void; onError?: (message: string) => void }) => void;
  lastText: () => string;
};

type SpeechSynthesisUtteranceConstructor = new (text: string) => SpeechSynthesisUtteranceLike;
type SpeechSynthesisUtteranceLike = {
  text: string;
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};
type SpeechSynthesisLike = {
  speak: (utterance: SpeechSynthesisUtteranceLike) => void;
  cancel: () => void;
};
type SpeechWindow = Window & {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: SpeechSynthesisUtteranceConstructor;
};

export function createBrowserTextToSpeech(win: SpeechWindow | undefined = typeof window === 'undefined' ? undefined : window as unknown as SpeechWindow): TextToSpeechAdapter {
  let previousText = '';

  function supported() {
    return Boolean(win?.speechSynthesis && win?.SpeechSynthesisUtterance);
  }

  function speakText(text: string, callbacks?: { onEnd?: () => void; onError?: (message: string) => void }) {
    if (!text.trim()) {
      callbacks?.onError?.('No text response is available to speak.');
      return;
    }
    if (!supported()) {
      previousText = text;
      callbacks?.onError?.('Text-to-speech is not supported in this browser.');
      return;
    }

    previousText = text;
    win?.speechSynthesis?.cancel();
    const utterance = new win!.SpeechSynthesisUtterance!(text);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    utterance.onend = callbacks?.onEnd ?? null;
    utterance.onerror = (event) => callbacks?.onError?.(event.error ?? 'Text-to-speech failed.');
    win?.speechSynthesis?.speak(utterance);
  }

  return {
    isSupported: supported,
    speak: speakText,
    stop() {
      win?.speechSynthesis?.cancel();
    },
    replay(callbacks) {
      speakText(previousText, callbacks);
    },
    lastText() {
      return previousText;
    }
  };
}
