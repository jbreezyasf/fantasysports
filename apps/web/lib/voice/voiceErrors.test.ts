import { describe, expect, it } from 'vitest';
import { voiceErrorUx, type VoiceErrorCode } from './voiceErrors';

describe('voice error and ambiguity UX', () => {
  it.each([
    'speech_not_understood',
    'ambiguous_player',
    'unavailable_player',
    'stale_draft_state',
    'network_failure',
    'tool_timeout',
    'unsupported_request'
  ] satisfies VoiceErrorCode[])('provides retry, typed fallback, and cancel for %s', (code) => {
    expect(voiceErrorUx(code)).toMatchObject({
      code,
      actions: ['retry', 'type_instead', 'cancel_return'],
      maySubstituteAction: false
    });
  });

  it('forbids silent substitution for unsupported requests', () => {
    expect(voiceErrorUx('unsupported_request')).toEqual({
      code: 'unsupported_request',
      message: 'That command is not supported. I will not execute another action instead.',
      actions: ['retry', 'type_instead', 'cancel_return'],
      maySubstituteAction: false
    });
  });
});
