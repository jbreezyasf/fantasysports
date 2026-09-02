export type VoiceErrorCode =
  | 'speech_not_understood'
  | 'ambiguous_player'
  | 'unavailable_player'
  | 'stale_draft_state'
  | 'network_failure'
  | 'tool_timeout'
  | 'unsupported_request';

export type VoiceErrorUx = {
  code: VoiceErrorCode;
  message: string;
  actions: ['retry', 'type_instead', 'cancel_return'];
  maySubstituteAction: false;
};

const messages: Record<VoiceErrorCode, string> = {
  speech_not_understood: 'I did not understand that. Try again, type it instead, or cancel.',
  ambiguous_player: 'That player name matches more than one player. Choose one, try again, type it instead, or cancel.',
  unavailable_player: 'That player is not verified as available. I will not switch to another player automatically.',
  stale_draft_state: 'The draft state changed. I need fresh draft data before continuing.',
  network_failure: 'The network request failed. Try again, type it instead, or cancel.',
  tool_timeout: 'Assistant GM tools took too long to respond. Try again, type it instead, or cancel.',
  unsupported_request: 'That command is not supported. I will not execute another action instead.'
};

export function voiceErrorUx(code: VoiceErrorCode): VoiceErrorUx {
  return {
    code,
    message: messages[code],
    actions: ['retry', 'type_instead', 'cancel_return'],
    maySubstituteAction: false
  };
}
