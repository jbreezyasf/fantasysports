import { describe, expect, it } from 'vitest';
import { buildStadiumWorldObjects, parseStadiumWorldZone } from './stadiumWorldModel';

describe('buildStadiumWorldObjects', () => {
  it('keeps official achievement truth deterministic', () => {
    const objects = buildStadiumWorldObjects({ titleCount: 2, rivalryCount: 0, unlockedFeatureCount: 3 });
    expect(objects.find((item) => item.id === 'champions-trophy')).toMatchObject({ earned: true, zone: 'owners-office' });
    expect(objects.find((item) => item.id === 'rivalry-monument')).toMatchObject({ earned: false, zone: 'rivalry-hall' });
    expect(objects.find((item) => item.id === 'legacy-wall')?.detail).toContain('3 stadium features');
  });
});

describe('parseStadiumWorldZone', () => {
  it('accepts known zone deep links and falls back to the concourse', () => {
    expect(parseStadiumWorldZone('owners-office')).toBe('owners-office');
    expect(parseStadiumWorldZone('rivalry-hall')).toBe('rivalry-hall');
    expect(parseStadiumWorldZone('trophy-vault')).toBe('concourse');
    expect(parseStadiumWorldZone(null)).toBe('concourse');
  });

  it('shows a locked trophy until Fantasy Core records a championship', () => {
    const objects = buildStadiumWorldObjects({ titleCount: 0, rivalryCount: 0, unlockedFeatureCount: 0 });
    expect(objects.every((item) => !item.earned)).toBe(true);
  });
});
