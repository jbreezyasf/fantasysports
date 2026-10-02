export type StadiumWorldZone = 'concourse' | 'owners-office' | 'rivalry-hall';

export type StadiumWorldState = {
  titleCount: number;
  rivalryCount: number;
  unlockedFeatureCount: number;
};

export type StadiumWorldObject = {
  id: 'champions-trophy' | 'rivalry-monument' | 'legacy-wall';
  label: string;
  zone: StadiumWorldZone;
  earned: boolean;
  detail: string;
};

export function buildStadiumWorldObjects(state: StadiumWorldState): StadiumWorldObject[] {
  return [
    {
      id: 'champions-trophy',
      label: 'Big Exec Champions Trophy',
      zone: 'owners-office',
      earned: state.titleCount > 0,
      detail: state.titleCount > 0
        ? `${state.titleCount} championship${state.titleCount === 1 ? '' : 's'} earned by this franchise.`
        : 'The championship display is waiting for this franchise’s first title.'
    },
    {
      id: 'rivalry-monument',
      label: 'Rivalry Monument',
      zone: 'rivalry-hall',
      earned: state.rivalryCount > 0,
      detail: state.rivalryCount > 0
        ? `${state.rivalryCount} rivalry win${state.rivalryCount === 1 ? '' : 's'} recorded in franchise history.`
        : 'The rivalry monument is ready for the first recorded rivalry win.'
    },
    {
      id: 'legacy-wall',
      label: 'Legacy Wall',
      zone: 'concourse',
      earned: state.unlockedFeatureCount > 0,
      detail: `${state.unlockedFeatureCount} stadium feature${state.unlockedFeatureCount === 1 ? '' : 's'} unlocked.`
    }
  ];
}

export const STADIUM_WORLD_ZONES: Array<{ id: StadiumWorldZone; label: string; camera: [number, number, number]; yaw: number }> = [
  { id: 'concourse', label: 'Grand Concourse', camera: [0, 2.2, 8.8], yaw: 0 },
  { id: 'owners-office', label: 'Owner’s Office', camera: [-6.2, 2.1, 2.4], yaw: 0.72 },
  { id: 'rivalry-hall', label: 'Rivalry Hall', camera: [6.2, 2.1, 2.4], yaw: -0.72 }
];
