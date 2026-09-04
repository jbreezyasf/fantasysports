import { describe, expect, it } from 'vitest';
import {
  askGmDialogRole,
  askGmReducer,
  createAskGmState,
  shouldTrapFocus,
  type AskGmEvent,
  type AskGmState
} from './askGmMachine';

const fullVoice = { voiceInput: true, spokenOutput: true };

function run(state: AskGmState, ...events: AskGmEvent[]) {
  return events.reduce(askGmReducer, state);
}

function opened(capabilities = fullVoice) {
  return run(createAskGmState(capabilities), { type: 'open' });
}

describe('Ask GM state machine', () => {
  it('starts closed and idle', () => {
    const state = createAskGmState(fullVoice);

    expect(state).toMatchObject({ open: false, phase: 'idle', inputMode: 'voice', turns: [] });
  });

  it('defaults to typed input when no voice adapter is available', () => {
    const state = createAskGmState({ voiceInput: false });

    expect(state.inputMode).toBe('typed');
    expect(run(state, { type: 'open' }).focusRequest).toBe('typedInput');
  });

  it('moves through idle, listening, processing, and speaking for a voice turn', () => {
    const listening = run(opened(), { type: 'pressToTalk' });
    expect(listening).toMatchObject({ phase: 'listening', canStop: true });
    expect(listening.announcement?.message).toBe('Listening.');

    const heard = run(listening, { type: 'interimTranscript', text: 'who should I start at flex' });
    expect(heard.partialTranscript).toBe('who should I start at flex');

    const processing = run(heard, { type: 'releaseToTalk' });
    expect(processing).toMatchObject({ phase: 'processing', partialTranscript: '' });
    expect(processing.turns).toEqual([
      { role: 'manager', text: 'who should I start at flex', source: 'voice' }
    ]);

    const speaking = run(processing, { type: 'answer', text: 'Start Carter.' });
    expect(speaking).toMatchObject({ phase: 'speaking', canStop: true, canReplay: true });

    expect(run(speaking, { type: 'speechEnded' })).toMatchObject({ phase: 'idle', canStop: false });
  });

  it('announces every phase change so the state is not visual-only', () => {
    const listening = run(opened(), { type: 'pressToTalk' });
    const processing = run(listening, { type: 'interimTranscript', text: 'score' }, { type: 'releaseToTalk' });

    expect(listening.announcement).toMatchObject({ message: 'Listening.', channel: 'gm' });
    expect(processing.announcement).toMatchObject({ message: 'Working on it.', channel: 'gm' });
  });

  it('does not submit an empty voice turn', () => {
    const released = run(opened(), { type: 'pressToTalk' }, { type: 'releaseToTalk' });

    expect(released).toMatchObject({ phase: 'idle', turns: [] });
    expect(released.announcement?.message).toContain('Nothing heard');
  });

  it('supports type instead from listening and moves focus to the input', () => {
    const typed = run(opened(), { type: 'pressToTalk' }, { type: 'chooseTypeInstead' });

    expect(typed).toMatchObject({ inputMode: 'typed', phase: 'idle', canStop: false, focusRequest: 'typedInput' });
    expect(typed.partialTranscript).toBe('');
  });

  it('submits a typed question and clears the draft', () => {
    const processing = run(
      opened(),
      { type: 'chooseTypeInstead' },
      { type: 'changeDraft', text: '  what is my faab balance  ' },
      { type: 'submitTyped' }
    );

    expect(processing).toMatchObject({ phase: 'processing', draftText: '' });
    expect(processing.turns).toEqual([{ role: 'manager', text: 'what is my faab balance', source: 'typed' }]);
  });

  it('ignores a blank typed submission', () => {
    const state = run(opened(), { type: 'chooseTypeInstead' }, { type: 'changeDraft', text: '   ' }, { type: 'submitTyped' });

    expect(state).toMatchObject({ phase: 'idle', turns: [] });
  });

  it('stops speech immediately and assertively', () => {
    const speaking = run(
      opened(),
      { type: 'chooseTypeInstead' },
      { type: 'changeDraft', text: 'score' },
      { type: 'submitTyped' },
      { type: 'answer', text: 'You lead by four.' }
    );

    const stopped = run(speaking, { type: 'stop' });
    expect(stopped).toMatchObject({ phase: 'idle', canStop: false });
    expect(stopped.announcement).toMatchObject({ priority: 'assertive', message: 'Stopped.' });
  });

  it('replays the last answer and keeps it in the transcript', () => {
    const answered = run(
      opened(),
      { type: 'chooseTypeInstead' },
      { type: 'changeDraft', text: 'score' },
      { type: 'submitTyped' },
      { type: 'answer', text: 'You lead by four.' },
      { type: 'speechEnded' }
    );

    const replayed = run(answered, { type: 'replay' });
    expect(replayed).toMatchObject({ phase: 'speaking' });
    expect(replayed.announcement?.message).toBe('You lead by four.');
    expect(answered.turns.at(-1)).toMatchObject({ role: 'assistant', text: 'You lead by four.' });
  });

  it('offers Tell me more only when extra detail exists', () => {
    const withoutDetail = run(opened(), { type: 'answer', text: 'You lead by four.' });
    expect(withoutDetail.canTellMeMore).toBe(false);
    expect(run(withoutDetail, { type: 'tellMeMore' }).phase).not.toBe('processing');

    const withDetail = run(opened(), { type: 'answer', text: 'You lead by four.', detail: 'Two starters remain.' });
    expect(withDetail.canTellMeMore).toBe(true);
    expect(run(withDetail, { type: 'tellMeMore' })).toMatchObject({ phase: 'processing', canStop: true });
  });

  it('cancels back to the control the manager can use next', () => {
    const voiceCancel = run(opened(), { type: 'pressToTalk' }, { type: 'cancel' });
    expect(voiceCancel).toMatchObject({ phase: 'idle', focusRequest: 'pushToTalk', canStop: false });

    const typedCancel = run(opened(), { type: 'chooseTypeInstead' }, { type: 'cancel' });
    expect(typedCancel.focusRequest).toBe('typedInput');
  });

  it('restores focus to the trigger on close', () => {
    const closed = run(opened(), { type: 'close' });

    expect(closed).toMatchObject({ open: false, focusRequest: 'trigger' });
  });

  it('clears focus and announcement outputs between transitions', () => {
    const openState = opened();
    expect(openState.focusRequest).toBe('pushToTalk');

    const afterDraftChange = run(openState, { type: 'changeDraft', text: 'a' });
    expect(afterDraftChange.focusRequest).toBeNull();
    expect(afterDraftChange.announcement).toBeNull();
  });
});

describe('Ask GM degraded modes', () => {
  it('routes a microphone denial to the typed path with no retry loop', () => {
    const denied = run(opened(), { type: 'fail', error: 'microphone_denied' });

    expect(denied).toMatchObject({ phase: 'error', inputMode: 'typed', focusRequest: 'typedInput' });
    expect(denied.error).toMatchObject({ retry: false, typeInstead: true, cancel: true });
    expect(denied.announcement?.priority).toBe('assertive');
  });

  it('falls back to typed input when push-to-talk is used without a voice adapter', () => {
    const state = run(createAskGmState({ voiceInput: false }), { type: 'open' }, { type: 'pressToTalk' });

    expect(state).toMatchObject({ phase: 'error', inputMode: 'typed', focusRequest: 'typedInput' });
    expect(state.error?.code).toBe('microphone_denied');
  });

  it('keeps the written answer usable when speech output fails', () => {
    const answered = run(
      opened(),
      { type: 'chooseTypeInstead' },
      { type: 'changeDraft', text: 'score' },
      { type: 'submitTyped' },
      { type: 'answer', text: 'You lead by four.' }
    );

    const speechFailed = run(answered, { type: 'fail', error: 'speech_failed' });

    // Not an error phase: the manager still has the answer on screen.
    expect(speechFailed.phase).toBe('idle');
    expect(speechFailed.lastAnswer?.text).toBe('You lead by four.');
    expect(speechFailed.turns.at(-1)).toMatchObject({ role: 'assistant', text: 'You lead by four.' });
  });

  it('always offers a way forward for every failure', () => {
    const codes = ['transcription_failed', 'assistant_failed', 'tool_timeout', 'speech_failed'] as const;

    for (const code of codes) {
      const failed = run(opened(), { type: 'fail', error: code });
      const error = failed.error!;

      expect(error.cancel, code).toBe(true);
      expect(error.retry || error.typeInstead, code).toBe(true);
    }
  });

  it('recovers from a retryable failure', () => {
    const failed = run(opened(), { type: 'fail', error: 'tool_timeout' });
    const retried = run(failed, { type: 'retry' });

    expect(retried).toMatchObject({ phase: 'idle', error: null, focusRequest: 'pushToTalk' });
  });

  it('does not retry an unrecoverable denial', () => {
    const denied = run(opened(), { type: 'fail', error: 'microphone_denied' });

    expect(run(denied, { type: 'retry' }).error?.code).toBe('microphone_denied');
  });

  it('announces answers even when spoken output is unavailable', () => {
    const state = run(createAskGmState({ voiceInput: false, spokenOutput: false }), { type: 'open' }, {
      type: 'answer',
      text: 'You lead by four.'
    });

    expect(state).toMatchObject({ phase: 'idle', canReplay: false });
    expect(state.announcement?.message).toBe('You lead by four.');
  });
});

describe('Ask GM gameplay obstruction rules', () => {
  it('is modal only when no time-critical control is live', () => {
    const calm = opened();
    expect(shouldTrapFocus(calm)).toBe(true);
    expect(askGmDialogRole(calm)).toBe('dialog');
  });

  it('stays inline and non-modal during a running draft clock', () => {
    const duringDraft = run(createAskGmState({ ...fullVoice, criticalControlsActive: true }), { type: 'open' });

    expect(shouldTrapFocus(duringDraft)).toBe(false);
    expect(askGmDialogRole(duringDraft)).toBe('region');
  });
});
