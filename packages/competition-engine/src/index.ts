export const eventTypes = [
  'circuit',
  'rivalry',
  'revenge',
  'position',
  'chaos',
  'judgment',
  'postseason'
] as const;

export type EventType = (typeof eventTypes)[number];

export type MatchupResult = {
  homePoints: number;
  awayPoints: number;
  winner: 'home' | 'away' | 'tie';
};

export function resolveMatchup(homePoints: number, awayPoints: number): MatchupResult {
  return {
    homePoints,
    awayPoints,
    winner: homePoints === awayPoints ? 'tie' : homePoints > awayPoints ? 'home' : 'away'
  };
}
