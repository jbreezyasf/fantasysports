import { describe, expect, it } from 'vitest';
import { currentCompetitionWeek, selectFrontOfficeMatchup } from './frontOfficeMatchup';

describe('Front Office current matchup', () => {
  it('uses the latest competition week whose games have started', () => {
    expect(currentCompetitionWeek([
      { week: 2, starts_at: '2026-09-18T00:15:00Z' },
      { week: 1, starts_at: '2026-09-10T00:20:00Z' },
      { week: 1, starts_at: '2026-09-15T00:15:00Z' }
    ], new Date('2026-09-13T18:00:00Z'))).toBe(1);
  });

  it('uses the first scheduled week before the season starts', () => {
    expect(currentCompetitionWeek([{ week: 2, starts_at: '2026-09-18T00:15:00Z' }, { week: 1, starts_at: '2026-09-10T00:20:00Z' }], new Date('2026-09-01T00:00:00Z'))).toBe(1);
  });

  it('selects this franchise matchup in the resolved week', () => {
    const matchups = [
      { id: 'week-9', week: 9, home_season_franchise_id: 'mine', away_season_franchise_id: 'nine', is_final: false },
      { id: 'week-1', week: 1, home_season_franchise_id: 'one', away_season_franchise_id: 'mine', is_final: false }
    ];
    expect(selectFrontOfficeMatchup(matchups, 'mine', 1)?.id).toBe('week-1');
  });
});
