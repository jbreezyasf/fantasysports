export type PostgameTalkTone = 'respect' | 'playful' | 'petty' | 'savage';

export type PostgameTalkFacts = {
  week: number;
  homeName: string;
  awayName: string;
  homePoints: number;
  awayPoints: number;
  winnerName: string;
  loserName: string;
  margin: number;
  requesterWon: boolean;
};

export const postgameTalkPromptId = 'big-exec-postgame-talk-v2-structured';

export const postgameTalkStructuredOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['options'],
  properties: {
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1, maxLength: 180 }
    }
  }
} as const;

export function buildPostgameTalkPrompt(tone: PostgameTalkTone, facts: PostgameTalkFacts) {
  const immutableFacts = {
    week: facts.week,
    home_team: facts.homeName,
    away_team: facts.awayName,
    home_points: facts.homePoints,
    away_points: facts.awayPoints,
    winner: facts.winnerName,
    loser: facts.loserName,
    margin: facts.margin,
    requester_won: facts.requesterWon
  };

  return [
    'You write short fantasy-sports Locker Room lines for Big Exec Fantasy Sports.',
    `Tone: ${tone}.`,
    `Immutable facts: ${JSON.stringify(immutableFacts)}.`,
    'Return JSON matching the supplied schema: an object with exactly three options.',
    'Each option must be under 180 characters.',
    'Never invent scores, records, streaks, rivalry history, injuries, player facts, or private trade information.',
    'Do not use slurs, threats, protected-class insults, sexual humiliation, or harassment.',
    'Petty and savage should feel funny and competitive, not hateful. Respect/playful can be warmer.'
  ].join('\n');
}

export function parsePostgameTalkOptions(text: string) {
  const parsed = JSON.parse(text) as unknown;
  const options = typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { options?: unknown }).options)
    ? (parsed as { options: unknown[] }).options
    : Array.isArray(parsed)
      ? parsed
      : [];
  return options
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}
