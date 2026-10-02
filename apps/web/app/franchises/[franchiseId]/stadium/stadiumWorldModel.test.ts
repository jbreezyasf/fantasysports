import { describe, expect, it } from 'vitest';
import { buildStadiumWorldObjects } from './stadiumWorldModel';

describe('buildStadiumWorldObjects', () => {
  it('keeps official achievement truth deterministic', () => {
    const objects = buildStadiumWorldObjects({ titleCount: 2, rivalryCount: 0, unlockedFeatureCount: 3 });
    expect(objects.find((item) => item.id === 'champions-trophy')).toMatchObject({ earned: true, zone: 'owners-office' });
    expect(objects.find((item) => item.id === 'rivalry-monument')).toMatchObject({ earned: false, zone: 'rivalry-hall' });
    expect(objects.find((item) => item.id === 'legacy-wall')?.detail).toContain('3 stadium features');
  });
});
