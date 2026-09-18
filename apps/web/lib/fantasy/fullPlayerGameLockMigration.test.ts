import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260918013839_enforce_full_player_game_lock.sql'),
  'utf8',
);

describe('full player game lock migration', () => {
  it('locks the roster asset by its own current-week game without requiring a lineup row', () => {
    const helper = migration.slice(
      migration.indexOf('create or replace function public.roster_asset_game_has_started'),
      migration.indexOf('create or replace function public.prevent_started_roster_asset_drop'),
    );
    expect(helper).toContain('public.roster_entries re');
    expect(helper).toContain('public.real_games rg');
    expect(helper).not.toContain('public.lineups');
    expect(helper).toContain("not in ('canceled', 'postponed')");
  });

  it('rejects a waiver claim that selects a started player to drop', () => {
    expect(migration).toContain('public.roster_asset_game_has_started(p_drop_roster_entry_id)');
    expect(migration).toContain("raise exception 'The selected drop is locked because their game has started'");
  });

  it('supports an atomic move to bench and serializes empty-lineup writes', () => {
    expect(migration).toContain("then 'cleared' else 'set'");
    expect(migration).toContain("hashtextextended('lineup:'");
    expect(migration).toContain('if p_athlete_id is not null or p_real_team_id is not null then');
  });
});
