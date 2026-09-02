export type SpeechToTextResult = {
  transcript: string;
  isFinal: boolean;
};

export type SpeechToTextAdapter = {
  isSupported: () => boolean;
  start: (callbacks: {
    onResult: (result: SpeechToTextResult) => void;
    onError: (message: string) => void;
    onEnd?: () => void;
  }) => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function microphonePermissionCopy() {
  return 'Microphone access starts only after you press Ask GM. You can cancel listening at any time.';
}

export function createBrowserSpeechToText(win: SpeechWindow | undefined = typeof window === 'undefined' ? undefined : window as SpeechWindow): SpeechToTextAdapter {
  let recognition: SpeechRecognitionLike | null = null;

  function constructor() {
    return win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
  }

  return {
    isSupported: () => Boolean(constructor()),
    start(callbacks) {
      const Recognition = constructor();
      if (!Recognition) {
        callbacks.onError('Speech recognition is not supported in this browser.');
        return;
      }

      recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        const result = event.results[event.resultIndex];
        callbacks.onResult({ transcript: result?.[0]?.transcript?.trim() ?? '', isFinal: Boolean(result?.isFinal) });
      };
      recognition.onerror = (event) => callbacks.onError(event.message || event.error || 'Speech recognition failed.');
      recognition.onend = callbacks.onEnd ?? null;
      recognition.start();
    },
    stop() {
      recognition?.stop();
      recognition = null;
    },
    abort() {
      recognition?.abort();
      recognition = null;
    }
  };
}
