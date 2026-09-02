import { describe, expect, it } from 'vitest';
import { assistantGmToolContracts, runAssistantGmTool, type AssistantGmToolContext } from './tools';

type Row = Record<string, unknown>;
type Filter =
  | { column: string; value: unknown[]; op: 'in' }
  | { column: string; value: unknown; op: 'eq' | 'is' | 'gte' | 'lte' };

class FakeQuery {
  private filters: Filter[] = [];

  constructor(private rows: Row[]) {}

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  async range(from: number, to: number) {
    return { data: this.rows.filter((row) => this.matches(row)).slice(from, to + 1), error: null };
  }
  eq(column: string, value: unknown) { this.filters.push({ column, value, op: 'eq' }); return this; }
  is(column: string, value: unknown) { this.filters.push({ column, value, op: 'is' }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ column, value, op: 'in' }); return this; }
  gte(column: string, value: unknown) { this.filters.push({ column, value, op: 'gte' }); return this; }
  lte(column: string, value: unknown) { this.filters.push({ column, value, op: 'lte' }); return this; }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      if (filter.op === 'in') return filter.value.includes(row[filter.column]);
      return row[filter.column] === filter.value;
    });
  }

  async maybeSingle<T>() {
    return { data: (this.rows.find((row) => this.matches(row)) ?? null) as T | null, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve({ data: this.rows.filter((row) => this.matches(row)), error: null }).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new FakeQuery(tables[table] ?? []);
    }
  };
}

describe('Assistant GM tool boundary', () => {
  it('declares every beta read tool as read-only with a narrow access model', () => {
    expect(Object.keys(assistantGmToolContracts)).toEqual([
      'getLeague',
      'getRoster',
      'getLineup',
      'getMatchup',
      'getStandings',
      'searchPlayers',
      'getPlayerDetails',
      'comparePlayers',
      'getAvailablePlayers',
      'getWaiverState',
      'getWaiverRules',
      'getDraftState',
      'getDraftAvailablePlayers',
      'getDraftQueue',
      'getInjuryStatus'
    ]);
    expect(Object.values(assistantGmToolContracts).every((contract) => contract.writes === false)).toBe(true);
  });

  it('returns structured league data for authorized league members', async () => {
    const result = await runAssistantGmTool(
      {
        supabase: fakeSupabase({
          fantasy_leagues: [{ id: 'league-1', name: 'Executive Room', max_franchises: 10 }],
          league_members: [{ league_id: 'league-1', user_id: 'user-1', role: 'commissioner' }]
        }) as AssistantGmToolContext['supabase'],
        userId: 'user-1'
      },
      { tool: 'getLeague', leagueId: 'league-1' }
    );

    expect(result).toEqual({
      ok: true,
      tool: 'getLeague',
      data: {
        league: { id: 'league-1', name: 'Executive Room', max_franchises: 10 },
        requesterRole: 'commissioner'
      }
    });
  });

  it('rejects unrestricted DB-style access by enforcing league membership', async () => {
    const result = await runAssistantGmTool(
      {
        supabase: fakeSupabase({
          fantasy_leagues: [{ id: 'league-1', name: 'Executive Room' }],
          league_members: []
        }) as AssistantGmToolContext['supabase'],
        userId: 'user-2'
      },
      { tool: 'getLeague', leagueId: 'league-1' }
    );

    expect(result).toEqual({
      ok: false,
      tool: 'getLeague',
      error: {
        code: 'unauthorized',
        message: 'User is not a member of this league'
      }
    });
  });
});
