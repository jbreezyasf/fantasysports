import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260918005608_bidirectional_lineup_lock_and_audit.sql'),
  'utf8',
);

describe('bidirectional lineup lock migration', () => {
  it('locks and checks the outgoing occupant before deleting the slot', () => {
    const outgoingCheck = migration.indexOf("raise exception 'Lineup locked: the player or team currently in this slot has already started'");
    const slotDelete = migration.indexOf('delete from public.lineups');
    expect(outgoingCheck).toBeGreaterThan(0);
    expect(slotDelete).toBeGreaterThan(outgoingCheck);
  });

  it('retains the incoming lock and writes an applied-move audit record', () => {
    expect(migration).toContain("raise exception 'Lineup locked: that player or team has already started'");
    expect(migration).toContain('insert into public.lineup_move_audit');
    expect(migration).toContain("not in ('canceled','postponed')");
  });
});
