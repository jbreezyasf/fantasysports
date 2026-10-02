export type StadiumWorldZone = 'gate' | 'field' | 'owners-suite' | 'rivalry-walk' | 'legacy-wall';

export type StadiumWorldFeature = { name: string; zone?: string | null };

export type StadiumWorldState = {
  franchiseName: string;
  establishedYear?: number | null;
  /** One entry per championship Fantasy Core has recorded; null when the season year is unknown. */
  titleYears: Array<number | null>;
  rivalryCount: number;
  unlockedFeatures: StadiumWorldFeature[];
  nextUnlock?: string | null;
};

export type StadiumWorldExhibitId = 'front-gate' | 'title-banners' | 'scoreboard' | 'champions-trophy' | 'rivalry-walk' | 'legacy-wall';

export type StadiumWorldExhibit = {
  id: StadiumWorldExhibitId;
  zone: StadiumWorldZone;
  label: string;
  status: 'earned' | 'locked' | 'info';
  detail: string;
  facts: Array<{ label: string; value: string }>;
};

export const STADIUM_WORLD_ZONES: Array<{ id: StadiumWorldZone; label: string; exhibit: StadiumWorldExhibitId }> = [
  { id: 'gate', label: 'Front Gate', exhibit: 'front-gate' },
  { id: 'field', label: 'The Field', exhibit: 'scoreboard' },
  { id: 'owners-suite', label: 'Owner’s Suite', exhibit: 'champions-trophy' },
  { id: 'rivalry-walk', label: 'Rivalry Walk', exhibit: 'rivalry-walk' },
  { id: 'legacy-wall', label: 'Legacy Wall', exhibit: 'legacy-wall' }
];

const ZONE_ALIASES: Record<string, StadiumWorldZone> = {
  concourse: 'gate',
  'owners-office': 'owners-suite',
  'rivalry-hall': 'rivalry-walk'
};

export function parseStadiumWorldZone(value: string | null | undefined): StadiumWorldZone {
  if (!value) return 'gate';
  return STADIUM_WORLD_ZONES.find((zone) => zone.id === value)?.id ?? ZONE_ALIASES[value] ?? 'gate';
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function titleYearLabel(year: number | null) {
  return year ? String(year) : 'Year on record';
}

export function buildStadiumExhibits(state: StadiumWorldState): StadiumWorldExhibit[] {
  const titles = state.titleYears.length;
  const knownYears = state.titleYears.filter((year): year is number => typeof year === 'number').sort((a, b) => a - b);
  const features = state.unlockedFeatures;
  const est = state.establishedYear ? String(state.establishedYear) : 'On record';

  return [
    {
      id: 'front-gate',
      zone: 'gate',
      label: `${state.franchiseName} Stadium`,
      status: 'info',
      detail: 'Your franchise name is lit over the main gate. Everything inside this stadium is placed by your official league record — nothing here is decoration for its own sake.',
      facts: [
        { label: 'Established', value: est },
        { label: 'Championships', value: String(titles) },
        { label: 'Rivalry wins', value: String(state.rivalryCount) },
        { label: 'Features unlocked', value: String(features.length) }
      ]
    },
    {
      id: 'title-banners',
      zone: 'gate',
      label: 'Championship Banners',
      status: titles > 0 ? 'earned' : 'locked',
      detail: titles > 0
        ? `${plural(titles, 'championship banner')} hang on the stadium facade, one for every title Fantasy Core has recorded.`
        : 'The banner wall is empty. A banner is raised here the moment Fantasy Core records your first championship.',
      facts: titles > 0
        ? [{ label: 'Title seasons', value: knownYears.length ? knownYears.join(', ') : plural(titles, 'title') }]
        : [{ label: 'Next banner', value: 'Win the Big Exec championship' }]
    },
    {
      id: 'scoreboard',
      zone: 'field',
      label: 'Legacy Scoreboard',
      status: 'info',
      detail: 'The bowl scoreboard keeps your permanent franchise numbers in lights.',
      facts: [
        { label: 'Titles', value: String(titles) },
        { label: 'Rivalry wins', value: String(state.rivalryCount) },
        { label: 'Unlocks', value: String(features.length) }
      ]
    },
    {
      id: 'champions-trophy',
      zone: 'owners-suite',
      label: 'Big Exec Champions Trophy',
      status: titles > 0 ? 'earned' : 'locked',
      detail: titles > 0
        ? `The Champions Trophy lives in your Owner’s Suite. ${plural(titles, 'title plate')} on the wall behind it.`
        : 'The trophy case in your Owner’s Suite is dark. It lights up when your franchise wins its first Big Exec championship.',
      facts: titles > 0
        ? [{ label: 'Championships', value: String(titles) }, { label: 'Seasons', value: knownYears.length ? knownYears.join(', ') : 'On record' }]
        : [{ label: 'Status', value: 'Awaiting first title' }]
    },
    {
      id: 'rivalry-walk',
      zone: 'rivalry-walk',
      label: 'Rivalry Walk',
      status: state.rivalryCount > 0 ? 'earned' : 'locked',
      detail: state.rivalryCount > 0
        ? `${plural(state.rivalryCount, 'pillar')} on the plaza ${state.rivalryCount === 1 ? 'is' : 'are'} lit — one for every recorded rivalry win. The dark pillars are waiting.`
        : 'Every pillar on the walk is dark. The first one lights when you win a rivalry game.',
      facts: [{ label: 'Rivalry wins', value: String(state.rivalryCount) }]
    },
    {
      id: 'legacy-wall',
      zone: 'legacy-wall',
      label: 'Legacy Wall',
      status: features.length > 0 ? 'earned' : 'locked',
      detail: features.length > 0
        ? 'Each plaque is a stadium feature your franchise unlocked through real accomplishments.'
        : 'No stadium features are unlocked yet. Plaques appear here as your franchise earns them.',
      facts: [
        ...features.slice(0, 6).map((feature) => ({ label: 'Unlocked', value: feature.name })),
        ...(features.length > 6 ? [{ label: 'And', value: `${features.length - 6} more` }] : []),
        ...(state.nextUnlock ? [{ label: 'Next unlock', value: state.nextUnlock }] : [])
      ]
    }
  ];
}
