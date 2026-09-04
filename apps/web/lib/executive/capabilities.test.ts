import { describe, expect, it } from 'vitest';
import {
  bigExecCapabilities,
  canUseCapability,
  getBigExecCapability,
  isFreeAccessibilityCapability,
  requiresExecutiveEntitlement
} from './capabilities';

describe('Big Exec capability matrix', () => {
  it('keeps capability ids unique and machine-readable', () => {
    const ids = bigExecCapabilities.map(capability => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => /^[a-z_]+(\.[a-z_]+)+$/.test(id))).toBe(true);
  });

  it('distinguishes tier, audience, action level, release phase, and Assistant GM tool exposure', () => {
    expect(getBigExecCapability('roster.read')).toMatchObject({
      tier: 'free_standard',
      audience: 'manager',
      action: 'read',
      releasePhase: 'beta',
      assistantGmToolAllowed: true
    });
    expect(getBigExecCapability('pro_plus.waiver_strategist')).toMatchObject({
      tier: 'executive_pro_plus',
      audience: 'manager',
      action: 'prepare',
      requiresExecutive: true
    });
    expect(getBigExecCapability('payments.executive_checkout.commit')).toMatchObject({
      audience: 'commissioner',
      action: 'commit',
      assistantGmToolAllowed: false
    });
  });

  it('never gates accessibility capabilities behind Executive payment', () => {
    const accessibilityCapabilities = bigExecCapabilities.filter(capability => capability.tier === 'free_accessibility');

    expect(accessibilityCapabilities.length).toBeGreaterThan(0);
    expect(accessibilityCapabilities.every(isFreeAccessibilityCapability)).toBe(true);
    expect(accessibilityCapabilities.map(capability => capability.requiresExecutive)).toEqual(
      Array(accessibilityCapabilities.length).fill(false)
    );
  });

  it('allows free accessibility voice and fallback support in non-Executive leagues', () => {
    expect(canUseCapability('accessibility.voice_input', { isExecutiveLeague: false, audience: 'league_member' })).toBe(true);
    expect(canUseCapability('accessibility.spoken_output', { isExecutiveLeague: false, audience: 'league_member' })).toBe(true);
    expect(canUseCapability('accessibility.typed_fallback', { isExecutiveLeague: false, audience: 'league_member' })).toBe(true);
    expect(canUseCapability('accessibility.confirm_transactions', { isExecutiveLeague: false, audience: 'manager' })).toBe(true);
  });

  it('requires Executive only for Pro+ intelligence capabilities', () => {
    expect(requiresExecutiveEntitlement('pro_plus.draft_war_room')).toBe(true);
    expect(canUseCapability('pro_plus.draft_war_room', { isExecutiveLeague: false, audience: 'manager' })).toBe(false);
    expect(canUseCapability('pro_plus.draft_war_room', { isExecutiveLeague: true, audience: 'manager' })).toBe(true);
  });

  it('keeps commissioner checkout out of Assistant GM tools', () => {
    const checkout = getBigExecCapability('payments.executive_checkout.commit');
    expect(checkout?.assistantGmToolAllowed).toBe(false);
    expect(canUseCapability('payments.executive_checkout.commit', { isExecutiveLeague: false, audience: 'commissioner' })).toBe(true);
    expect(canUseCapability('payments.executive_checkout.commit', { isExecutiveLeague: true, audience: 'manager' })).toBe(false);
  });
});

