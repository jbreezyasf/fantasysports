'use client';

import React, { useState } from 'react';
import { createBrowserSpeechToText, microphonePermissionCopy, type SpeechToTextAdapter } from '../../lib/voice/speechToText';
import { createBrowserTextToSpeech, type TextToSpeechAdapter } from '../../lib/voice/textToSpeech';
import { voiceErrorUx } from '../../lib/voice/voiceErrors';
import { announceToScreenReader, setGmAudioSpeaking } from './ScreenReaderAnnouncer';
import { VisuallyHidden } from './accessibility';

type AskGmState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

const stateText: Record<AskGmState, string> = {
  idle: 'Ask GM is ready.',
  listening: 'Listening. Speak your question now.',
  processing: 'Processing your question.',
  speaking: 'Speaking Assistant GM response.',
  error: 'Ask GM is unavailable.'
};

export default function AskGmPushToTalk({ initialState = 'idle', initialResponse = '' }: { initialState?: AskGmState; initialResponse?: string }) {
  const [state, setState] = useState<AskGmState>(initialState);
  const [transcript, setTranscript] = useState('');
  const [typedFallback, setTypedFallback] = useState('');
  const [lastResponse, setLastResponse] = useState(initialResponse);
  const [adapter, setAdapter] = useState<SpeechToTextAdapter | null>(null);
  const [ttsAdapter, setTtsAdapter] = useState<TextToSpeechAdapter | null>(null);
  const currentError = voiceErrorUx('speech_not_understood');

  function setAnnouncedState(next: AskGmState) {
    setState(next);
    announceToScreenReader({ key: `ask-gm-${next}`, message: stateText[next], priority: next === 'error' ? 'assertive' : 'polite' });
  }

  function startListening() {
    const nextAdapter = createBrowserSpeechToText();
    if (!nextAdapter.isSupported()) {
      setTranscript('');
      setAnnouncedState('error');
      return;
    }
    setAdapter(nextAdapter);
    setTranscript('');
    setAnnouncedState('listening');
    nextAdapter.start({
      onResult: (result) => {
        setTranscript(result.transcript);
        if (result.isFinal) setAnnouncedState('processing');
      },
      onError: () => setAnnouncedState('error'),
      onEnd: () => setAdapter(null)
    });
  }

  function finishListening() {
    adapter?.stop();
    setAnnouncedState('processing');
    window.setTimeout(() => setAnnouncedState('error'), 250);
  }

  function cancel() {
    adapter?.abort();
    ttsAdapter?.stop();
    setGmAudioSpeaking(false);
    setAdapter(null);
    setAnnouncedState('idle');
  }

  function speakResponse(text: string) {
    setLastResponse(text);
    const nextAdapter = createBrowserTextToSpeech();
    setTtsAdapter(nextAdapter);
    setAnnouncedState('speaking');
    setGmAudioSpeaking(true);
    nextAdapter.speak(text, {
      onEnd: () => {
        setGmAudioSpeaking(false);
        setAnnouncedState('idle');
      },
      onError: () => {
        setGmAudioSpeaking(false);
        setAnnouncedState('error');
      }
    });
  }

  function stopSpeech() {
    ttsAdapter?.stop();
    setGmAudioSpeaking(false);
    setAnnouncedState('idle');
  }

  function replaySpeech() {
    if (!lastResponse) return;
    speakResponse(lastResponse);
  }

  return (
    <div className="askGmControl" data-state={state} aria-label="Assistant GM push to talk">
      <div className="askGmStatus" role="status" aria-live="polite" aria-atomic="true">
        <span aria-hidden="true" className="askGmDot" />
        <span>{stateText[state]}</span>
      </div>
      <p className="srOnly" id="ask-gm-permission">{microphonePermissionCopy()}</p>
      {transcript&&<p className="askGmTranscript" aria-label={`Transcript: ${transcript}`}>{transcript}</p>}
      {lastResponse&&<p className="askGmResponse" aria-label={`Assistant GM response: ${lastResponse}`}>{lastResponse}</p>}
      <label className="askGmTypedFallback">
        <span className="srOnly">Type your Assistant GM question</span>
        <input id="ask-gm-typed-fallback" value={typedFallback} onChange={(event)=>setTypedFallback(event.target.value)} placeholder="Type Ask GM question" />
      </label>
      {state === 'idle' && <button type="button" className="secondary askGmButton" onClick={startListening} aria-describedby="ask-gm-permission" aria-label="Start push to talk with Assistant GM">Ask GM</button>}
      {state === 'listening' && (
        <div className="askGmActions">
          <button type="button" className="primary askGmButton" onClick={finishListening} aria-label="Finish speaking to Assistant GM">Finish</button>
          <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel Assistant GM listening">Cancel</button>
        </div>
      )}
      {state === 'processing' && (
        <button type="button" className="secondary askGmButton" onClick={cancel} aria-label={`Cancel Assistant GM ${state}`}>Cancel</button>
      )}
      {state === 'speaking' && (
        <div className="askGmActions">
          <button type="button" className="secondary askGmButton" onClick={stopSpeech} aria-label="Stop Assistant GM speech">Stop</button>
          <button type="button" className="secondary askGmButton" onClick={replaySpeech} disabled={!lastResponse} aria-label="Replay last Assistant GM response">Replay</button>
        </div>
      )}
      {state === 'error' && (
        <>
          <p className="askGmError" role="alert">{currentError.message}</p>
          <div className="askGmActions">
            <button type="button" className="primary askGmButton" onClick={startListening} aria-describedby="ask-gm-permission" aria-label="Retry push to talk with Assistant GM">Retry</button>
            <a className="secondary askGmButton" href="#ask-gm-typed-fallback" aria-label="Type Assistant GM request instead">Type instead</a>
            <button type="button" className="secondary askGmButton" onClick={cancel} aria-label="Cancel and return from Assistant GM error">Cancel</button>
          </div>
        </>
      )}
      <VisuallyHidden>Assistant GM spoken responses keep text visible and can be stopped or replayed.</VisuallyHidden>
      <VisuallyHidden>No always-listening behavior is active. Listening starts only after pressing Ask GM.</VisuallyHidden>
    </div>
  );
}
