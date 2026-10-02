import { describe, expect, it } from 'vitest';
import { buildStadiumExhibits, parseStadiumWorldZone } from './stadiumWorldModel';

const base = { franchiseName: 'High Volts', establishedYear: 2026, titleYears: [], rivalryCount: 0, unlockedFeatures: [], nextUnlock: 'Rivalry Monument' };

describe('buildStadiumExhibits', () => {
  it('keeps every legacy object locked until Fantasy Core records it', () => {
    const exhibits = buildStadiumExhibits(base);
    expect(exhibits.find((item) => item.id === 'champions-trophy')?.status).toBe('locked');
    expect(exhibits.find((item) => item.id === 'title-banners')?.status).toBe('locked');
    expect(exhibits.find((item) => item.id === 'rivalry-walk')?.status).toBe('locked');
    expect(exhibits.find((item) => item.id === 'legacy-wall')?.facts).toContainEqual({ label: 'Next unlock', value: 'Rivalry Monument' });
  });

  it('shows recorded titles, rivalries and unlocked features exactly', () => {
    const exhibits = buildStadiumExhibits({
      ...base,
      titleYears: [2028, 2026],
      rivalryCount: 3,
      unlockedFeatures: [{ name: 'Founders Plaza' }, { name: 'Rivalry Monument' }]
    });
    const trophy = exhibits.find((item) => item.id === 'champions-trophy');
    expect(trophy).toMatchObject({ status: 'earned', zone: 'owners-suite' });
    expect(trophy?.facts).toContainEqual({ label: 'Seasons', value: '2026, 2028' });
    expect(exhibits.find((item) => item.id === 'rivalry-walk')?.facts).toEqual([{ label: 'Rivalry wins', value: '3' }]);
    expect(exhibits.find((item) => item.id === 'legacy-wall')?.facts.filter((fact) => fact.label === 'Unlocked').map((fact) => fact.value)).toEqual(['Founders Plaza', 'Rivalry Monument']);
  });
});

describe('parseStadiumWorldZone', () => {
  it('accepts zone deep links, maps earlier names, and falls back to the front gate', () => {
    expect(parseStadiumWorldZone('owners-suite')).toBe('owners-suite');
    expect(parseStadiumWorldZone('rivalry-walk')).toBe('rivalry-walk');
    expect(parseStadiumWorldZone('owners-office')).toBe('owners-suite');
    expect(parseStadiumWorldZone('trophy-vault')).toBe('gate');
    expect(parseStadiumWorldZone(null)).toBe('gate');
  });
});
