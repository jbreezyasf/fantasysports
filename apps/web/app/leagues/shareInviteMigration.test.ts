import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = () => readFileSync('../../supabase/migrations/20260909041522_reusable_share_invites_and_commissioner_remove.sql', 'utf8');

describe('reusable share invite migration', () => {
  it('keeps one pending share token reusable until the league reaches capacity', () => {
    const sql = migration();

    expect(sql).toContain("li.email like 'share+%@bigexecfs.local'");
    expect(sql).toContain('return query select v_existing.id, v_existing.invite_token, v_existing.email');
    expect(sql).toContain('remaining_claims');
    expect(sql).toContain('v_member_count >= coalesce(v_capacity, 10)');
  });

  it('creates a hidden personal invite token for each share-link claimant', () => {
    const sql = migration();

    expect(sql).toContain('returns uuid');
    expect(sql).toContain('v_claim_token uuid := gen_random_uuid()');
    expect(sql).toContain('insert into public.league_invites(league_id, invited_by, email, invite_token, status, expires_at)');
    expect(sql).toContain('return v_claim_token');
  });

  it('limits commissioner removal to non-commissioner seats before draft picks exist', () => {
    const sql = migration();

    expect(sql).toContain('commissioner_remove_pre_draft_franchise');
    expect(sql).toContain("lm.role = 'commissioner'");
    expect(sql).toContain("d.status <> 'scheduled'");
    expect(sql).toContain('from public.draft_picks dp');
    expect(sql).toContain("role <> 'commissioner'");
  });
});
