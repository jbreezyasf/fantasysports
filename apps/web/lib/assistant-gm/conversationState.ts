export type AssistantGmConversationMode = 'standard' | 'pro_plus';

export type AssistantGmConversationState = {
  userId: string;
  leagueId: string;
  leagueSeasonId: string;
  mode: AssistantGmConversationMode;
  currentScreen?: string | null;
  retainedSummary?: string | null;
  userPreferences?: Record<string, unknown>;
  retentionUntil?: string | null;
  deletedAt?: string | null;
};

const rawAudioKeys = new Set(['audio', 'audioBlob', 'audioBuffer', 'audioBytes', 'rawAudio', 'rawVoiceAudio', 'microphoneStream']);

export function trimRetainedSummary(summary: string | null | undefined, maxLength = 1200) {
  const clean = (summary ?? '').trim();
  if (clean.length <= maxLength) return clean || null;
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function sanitizeConversationPreferences(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    if (rawAudioKeys.has(key)) continue;
    output[key] = item && typeof item === 'object' && !Array.isArray(item)
      ? sanitizeConversationPreferences(item as Record<string, unknown>)
      : item;
  }
  return output;
}

export function buildConversationState(input: AssistantGmConversationState): AssistantGmConversationState {
  return {
    ...input,
    retainedSummary: trimRetainedSummary(input.retainedSummary),
    userPreferences: sanitizeConversationPreferences(input.userPreferences),
    deletedAt: input.deletedAt ?? null
  };
}

export function resetConversationState(input: AssistantGmConversationState): AssistantGmConversationState {
  return {
    ...input,
    retainedSummary: null,
    currentScreen: null,
    userPreferences: {},
    deletedAt: null
  };
}

export function markConversationDeleted(input: AssistantGmConversationState, deletedAt = new Date().toISOString()): AssistantGmConversationState {
  return {
    ...resetConversationState(input),
    deletedAt
  };
}

export function conversationScopeKey(input: Pick<AssistantGmConversationState, 'userId' | 'leagueId' | 'leagueSeasonId'>) {
  return `${input.userId}:${input.leagueId}:${input.leagueSeasonId}`;
}
