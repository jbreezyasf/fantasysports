import { describe, expect, it } from 'vitest';
import { translateMessage } from '../../app/components/LocaleProvider';
import { CHAOS_CLAUSE_TITLE, CHAOS_CLAUSE_WINNER_LABEL, chaosClauseSentence, presentChaosClause } from './chaosClause';

// Shapes exactly as recompute_matchup writes them (supabase/tests/chaos_clause_tiebreak.sql).
const byChaos = {
  rule: 'chaos_clause',
  version: 1,
  decided_by: 'chaos_week',
  winner_season_franchise_id: 'sf-home',
  steps: [{ step: 'chaos_week', week: 13, home: 131.4, away: 118.25, outcome: 'home' }],
};
const byRivalry = {
  rule: 'chaos_clause',
  version: 1,
  decided_by: 'rivalry_week',
  winner_season_franchise_id: 'sf-away',
  steps: [
    { step: 'chaos_week', week: 13, home: 120.5, away: 120.5, outcome: 'level' },
    { step: 'rivalry_week', week: 10, home: 95.25, away: 131.4, outcome: 'away' },
  ],
};
const bySeed = {
  rule: 'chaos_clause',
  version: 1,
  decided_by: 'postseason_seed',
  winner_season_franchise_id: 'sf-home',
  steps: [
    { step: 'chaos_week', week: 13, home: null, away: null, outcome: 'unavailable' },
    { step: 'rivalry_week', week: 10, home: 99.99, away: 99.99, outcome: 'level' },
    { step: 'postseason_seed', home: 3, away: 6, outcome: 'home' },
  ],
};

describe('Chaos Clause presentation', () => {
  it('reads a Chaos Week decision from a matchup context', () => {
    const note = presentChaosClause({ seeds: [3, 6], chaos_clause: byChaos });
    expect(note).toMatchObject({
      basis: 'chaos_week',
      winnerSide: 'home',
      winnerSeasonFranchiseId: 'sf-home',
      title: 'Decided by the Chaos Clause',
      basisLabel: 'Higher Chaos Week score',
      winnerValue: '131.40',
      loserValue: '118.25',
    });
    expect(chaosClauseSentence(note!)).toBe('Decided by the Chaos Clause: 131.40 to 118.25 in Chaos Week.');
  });

  it('puts the winner first when the away side wins on Rivalry Week', () => {
    const note = presentChaosClause(byRivalry);
    expect(note).toMatchObject({ basis: 'rivalry_week', winnerSide: 'away', winnerValue: '131.40', loserValue: '95.25', basisLabel: 'Higher Rivalry Week score' });
    expect(chaosClauseSentence(note!, 'High Volts')).toBe('High Volts wins. Decided by the Chaos Clause: 131.40 to 95.25 in Rivalry Week.');
  });

  it('shows seeds as whole numbers when the seed decides', () => {
    const note = presentChaosClause({ chaos_clause: bySeed });
    expect(note).toMatchObject({ basis: 'postseason_seed', winnerValue: '3', loserValue: '6', basisLabel: 'Higher postseason seed' });
    expect(chaosClauseSentence(note!)).toBe('Decided by the Chaos Clause: seed 3 over seed 6.');
  });

  it('accepts numeric strings, as a feed payload may carry them', () => {
    const note = presentChaosClause({ chaos_clause: { ...byChaos, steps: [{ step: 'chaos_week', home: '131.40', away: '118.25', outcome: 'home' }] } });
    expect(note?.winnerValue).toBe('131.40');
  });

  it('returns nothing for a result that the clause did not decide', () => {
    expect(presentChaosClause(null)).toBeNull();
    expect(presentChaosClause({})).toBeNull();
    expect(presentChaosClause({ seeds: [3, 6] })).toBeNull();
    expect(presentChaosClause([byChaos])).toBeNull();
    expect(presentChaosClause({ chaos_clause: { ...byChaos, rule: 'other' } })).toBeNull();
    expect(presentChaosClause({ chaos_clause: { rule: 'chaos_clause', decided_by: 'unresolved', winner_season_franchise_id: null, steps: [] } })).toBeNull();
  });

  it('returns nothing rather than guessing when the record is incomplete', () => {
    expect(presentChaosClause({ ...byChaos, winner_season_franchise_id: null })).toBeNull();
    expect(presentChaosClause({ ...byChaos, steps: [] })).toBeNull();
    expect(presentChaosClause({ ...byChaos, steps: 'x' })).toBeNull();
    expect(presentChaosClause({ ...byChaos, steps: [{ step: 'chaos_week', home: 131.4, away: null, outcome: 'home' }] })).toBeNull();
    expect(presentChaosClause({ ...byChaos, steps: [{ step: 'chaos_week', home: 120, away: 120, outcome: 'level' }] })).toBeNull();
    expect(presentChaosClause({ ...byChaos, steps: [{ step: 'rivalry_week', home: 1, away: 2, outcome: 'away' }] })).toBeNull();
  });

  it('has Spanish catalog entries for every static string it can show', () => {
    const labels = [byChaos, byRivalry, bySeed].map((clause) => presentChaosClause(clause)!.basisLabel);
    for (const message of [CHAOS_CLAUSE_TITLE, CHAOS_CLAUSE_WINNER_LABEL, ...labels]) {
      expect(translateMessage(message), message).not.toBe(message);
    }
    expect(translateMessage(CHAOS_CLAUSE_TITLE)).toBe('Decidido por la Cláusula del Caos');
  });
});
