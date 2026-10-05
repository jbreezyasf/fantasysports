// Presentation of a postseason result decided by the Chaos Clause.
//
// The database (recompute_matchup, migration 20261004010000) is the only place
// that decides the winner. It records the decision under `chaos_clause` in
// matchups.context and in the matchup_final feed payload. This module only
// reads that record; it never works out a winner on its own.

export type ChaosClauseBasis = 'chaos_week' | 'rivalry_week' | 'postseason_seed';

export type ChaosClauseNote = {
  basis: ChaosClauseBasis;
  winnerSide: 'home' | 'away';
  winnerSeasonFranchiseId: string;
  /** Static catalog strings: safe to render as their own text node for translation. */
  title: string;
  basisLabel: string;
  /** The deciding values, winner first. Scores keep two decimals; seeds are whole numbers. */
  winnerValue: string;
  loserValue: string;
};

export const CHAOS_CLAUSE_TITLE = 'Decided by the Chaos Clause';
export const CHAOS_CLAUSE_WINNER_LABEL = 'Chaos Clause winner';

const BASIS_LABELS: Record<ChaosClauseBasis, string> = {
  chaos_week: 'Higher Chaos Week score',
  rivalry_week: 'Higher Rivalry Week score',
  postseason_seed: 'Higher postseason seed',
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const finite = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

/** Accepts the `chaos_clause` record itself, or a matchup context / feed payload that contains one. */
export function presentChaosClause(source: unknown): ChaosClauseNote | null {
  const outer = record(source);
  if (!outer) return null;
  const clause = record(outer.chaos_clause) ?? outer;
  if (clause.rule !== 'chaos_clause') return null;
  const basis = clause.decided_by;
  if (basis !== 'chaos_week' && basis !== 'rivalry_week' && basis !== 'postseason_seed') return null;
  const winnerSeasonFranchiseId = clause.winner_season_franchise_id;
  if (typeof winnerSeasonFranchiseId !== 'string' || !winnerSeasonFranchiseId) return null;
  const step = (Array.isArray(clause.steps) ? clause.steps : []).map(record).find((item) => item?.step === basis);
  if (!step || (step.outcome !== 'home' && step.outcome !== 'away')) return null;
  const home = finite(step.home);
  const away = finite(step.away);
  if (home === null || away === null) return null;
  const format = (value: number) => (basis === 'postseason_seed' ? String(Math.trunc(value)) : value.toFixed(2));
  const winnerSide = step.outcome;
  return {
    basis,
    winnerSide,
    winnerSeasonFranchiseId,
    title: CHAOS_CLAUSE_TITLE,
    basisLabel: BASIS_LABELS[basis],
    winnerValue: format(winnerSide === 'home' ? home : away),
    loserValue: format(winnerSide === 'home' ? away : home),
  };
}

/** One English sentence, for feed text and screen-reader summaries. */
export function chaosClauseSentence(note: ChaosClauseNote, winnerName?: string | null) {
  const how =
    note.basis === 'postseason_seed'
      ? `seed ${note.winnerValue} over seed ${note.loserValue}`
      : `${note.winnerValue} to ${note.loserValue} in ${note.basis === 'chaos_week' ? 'Chaos Week' : 'Rivalry Week'}`;
  return `${winnerName ? `${winnerName} wins. ` : ''}${CHAOS_CLAUSE_TITLE}: ${how}.`;
}
