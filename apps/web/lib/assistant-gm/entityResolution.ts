export type AssistantGmEntityType = 'player' | 'franchise' | 'league' | 'position' | 'week' | 'roster_slot';

export type AssistantGmEntityCandidate = {
  id: string;
  type: Exclude<AssistantGmEntityType, 'position' | 'week' | 'roster_slot'>;
  label: string;
  aliases?: string[];
  leagueId?: string;
  available?: boolean;
};

export type EntityResolutionResult =
  | { ok: true; status: 'resolved'; entity: AssistantGmEntityCandidate }
  | { ok: false; status: 'ambiguous'; message: string; candidates: AssistantGmEntityCandidate[] }
  | { ok: false; status: 'not_found' | 'unavailable'; message: string; candidates: AssistantGmEntityCandidate[] };

export const supportedPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST', 'FLEX'] as const;
export type SupportedPosition = typeof supportedPositions[number];

export const supportedRosterSlots = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST', 'FLEX', 'BENCH'] as const;
export type SupportedRosterSlot = typeof supportedRosterSlots[number];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchable(candidate: AssistantGmEntityCandidate) {
  return [candidate.label, ...(candidate.aliases ?? [])].map(normalize).filter(Boolean);
}

export function resolveEntity(input: {
  query: string;
  type: AssistantGmEntityCandidate['type'];
  candidates: AssistantGmEntityCandidate[];
  leagueId?: string;
}): EntityResolutionResult {
  const query = normalize(input.query);
  const scoped = input.candidates.filter(candidate => candidate.type === input.type && (!input.leagueId || !candidate.leagueId || candidate.leagueId === input.leagueId));
  if (!query) return { ok: false, status: 'not_found', message: 'Name is required.', candidates: [] };

  const exact = scoped.filter(candidate => searchable(candidate).some(value => value === query));
  const matches = exact.length ? exact : scoped.filter(candidate => searchable(candidate).some(value => value.includes(query) || query.includes(value)));

  if (!matches.length) return { ok: false, status: 'not_found', message: `${input.type} was not found in the current league context.`, candidates: [] };
  if (matches.length > 1) return { ok: false, status: 'ambiguous', message: `More than one ${input.type} matches. Choose the exact one.`, candidates: matches };

  const [entity] = matches;
  if (input.type === 'player' && entity.available === false) {
    return { ok: false, status: 'unavailable', message: `${entity.label} is not available in the current league context.`, candidates: [entity] };
  }
  return { ok: true, status: 'resolved', entity };
}

export function resolvePosition(query: string) {
  const normalized = normalize(query).toUpperCase().replace('DST', 'D/ST').replace('DEFENSE', 'D/ST');
  const position = supportedPositions.find(item => item === normalized);
  return position ? { ok: true as const, position } : { ok: false as const, message: 'Position was not recognized.', supported: supportedPositions };
}

export function resolveRosterSlot(query: string) {
  const normalized = normalize(query).toUpperCase().replace('DST', 'D/ST').replace('DEFENSE', 'D/ST');
  const slot = supportedRosterSlots.find(item => item === normalized);
  return slot ? { ok: true as const, slot } : { ok: false as const, message: 'Roster slot was not recognized.', supported: supportedRosterSlots };
}

export function resolveWeek(query: string, currentWeek?: number) {
  const normalized = normalize(query);
  if (normalized === 'this week' || normalized === 'current week') {
    return currentWeek ? { ok: true as const, week: currentWeek } : { ok: false as const, message: 'Current week is not available.' };
  }
  const match = normalized.match(/(?:week )?([0-9]{1,2})/);
  const week = match ? Number(match[1]) : NaN;
  return Number.isInteger(week) && week >= 1 && week <= 18
    ? { ok: true as const, week }
    : { ok: false as const, message: 'Week was not recognized.' };
}

