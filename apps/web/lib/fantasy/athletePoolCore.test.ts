import { describe, expect, it } from 'vitest';
import { FANTASY_ELIGIBLE_POSITIONS, loadFantasyEligibleAthletesFrom } from './athletePoolCore';

function athlete(id: number, position: string) {
  return {
    id: String(id),
    display_name: `${position} Player ${id}`,
    position,
    real_team_id: null,
    real_teams: null,
  };
}

function createMockSupabase(pages: unknown[][]) {
  const ranges: Array<[number, number]> = [];
  const filters: Array<{ column: string; value: unknown }> = [];
  const inFilters: Array<{ column: string; values: readonly string[] }> = [];
  const orders: string[] = [];

  return {
    calls: { ranges, filters, inFilters, orders },
    client: {
      from(table: 'athletes') {
        expect(table).toBe('athletes');
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value });
            return this;
          },
          in(column: string, values: readonly string[]) {
            inFilters.push({ column, values });
            return this;
          },
          order(column: string) {
            orders.push(column);
            return this;
          },
          async range(from: number, to: number) {
            ranges.push([from, to]);
            const page = pages[ranges.length - 1] ?? [];
            return { data: page, error: null };
          },
        };
      },
    },
  };
}

describe('loadFantasyEligibleAthletesFrom', () => {
  it('loads every page instead of relying on a single global row cap', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => athlete(index, index < 500 ? 'QB' : 'RB'));
    const secondPage = Array.from({ length: 401 }, (_, index) => athlete(1000 + index, 'WR'));
    const supabase = createMockSupabase([firstPage, secondPage]);

    const result = await loadFantasyEligibleAthletesFrom(supabase.client);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1401);
    expect(result.data.filter(player => player.position === 'WR')).toHaveLength(401);
    expect(supabase.calls.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(supabase.calls.filters).toContainEqual({ column: 'active', value: true });
    expect(supabase.calls.inFilters).toContainEqual({
      column: 'position',
      values: [...FANTASY_ELIGIBLE_POSITIONS],
    });
    expect(supabase.calls.orders).toEqual(['position', 'display_name', 'position', 'display_name']);
  });

  it('returns loaded pages plus the query error when a later page fails', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => athlete(index, 'TE'));
    const ranges: Array<[number, number]> = [];
    const error = { message: 'network failure' };

    const client = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          order() {
            return this;
          },
          async range(from: number, to: number) {
            ranges.push([from, to]);
            if (ranges.length === 1) return { data: firstPage, error: null };
            return { data: null, error };
          },
        };
      },
    };

    const result = await loadFantasyEligibleAthletesFrom(client);

    expect(result.data).toHaveLength(1000);
    expect(result.error).toBe(error);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
