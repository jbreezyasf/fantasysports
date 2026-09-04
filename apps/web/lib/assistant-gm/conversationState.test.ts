import { describe, expect, it } from 'vitest';
import {
  buildConversationState,
  conversationScopeKey,
  markConversationDeleted,
  resetConversationState,
  sanitizeConversationPreferences,
  trimRetainedSummary
} from './conversationState';

describe('Assistant GM conversation state', () => {
  const base = {
    userId: 'user-1',
    leagueId: 'league-1',
    leagueSeasonId: 'season-1',
    mode: 'standard' as const,
    currentScreen: '/dashboard',
    retainedSummary: 'Asked about lineup locks.',
    userPreferences: { verbosity: 'concise' }
  };

  it('uses user, league, and season as the privacy scope', () => {
    expect(conversationScopeKey(base)).toBe('user-1:league-1:season-1');
    expect(conversationScopeKey({ ...base, leagueId: 'league-2' })).not.toBe(conversationScopeKey(base));
  });

  it('bounds retained summaries', () => {
    expect(trimRetainedSummary(' abc ', 10)).toBe('abc');
    expect(trimRetainedSummary('0123456789abcdef', 10)).toBe('0123456...');
  });

  it('strips raw audio-like preference payloads recursively', () => {
    expect(sanitizeConversationPreferences({
      humor: 'dry',
      rawVoiceAudio: 'base64-audio',
      nested: { audioBuffer: [1, 2, 3], keep: true }
    })).toEqual({
      humor: 'dry',
      nested: { keep: true }
    });
  });

  it('builds bounded state without raw audio fields', () => {
    expect(buildConversationState({
      ...base,
      retainedSummary: 'x'.repeat(1210),
      userPreferences: { audioBytes: 'nope', verbosity: 'brief' }
    })).toMatchObject({
      retainedSummary: `${'x'.repeat(1197)}...`,
      userPreferences: { verbosity: 'brief' },
      deletedAt: null
    });
  });

  it('supports reset and delete flows without carrying prior context forward', () => {
    expect(resetConversationState(base)).toMatchObject({
      currentScreen: null,
      retainedSummary: null,
      userPreferences: {},
      deletedAt: null
    });
    expect(markConversationDeleted(base, '2026-09-02T00:00:00.000Z')).toMatchObject({
      currentScreen: null,
      retainedSummary: null,
      userPreferences: {},
      deletedAt: '2026-09-02T00:00:00.000Z'
    });
  });
});

