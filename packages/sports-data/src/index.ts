export type NormalizedTeam = {
  providerId: string;
  name: string;
  abbreviation?: string;
};

export type NormalizedAthlete = {
  providerId: string;
  teamProviderId?: string;
  name: string;
  position: string;
  injuryStatus?: string;
};

export type NormalizedGame = {
  providerId: string;
  week?: number;
  homeTeamProviderId: string;
  awayTeamProviderId: string;
  startsAt: string;
  state: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'canceled' | 'delayed' | 'suspended' | 'unknown';
  homeScore?: number;
  awayScore?: number;
};

export type NormalizedAthleteGameStats = {
  athleteProviderId: string;
  gameProviderId: string;
  rawStats: Record<string, number | string | boolean | null>;
  sourceUpdatedAt?: string;
};

export interface SportsDataProvider {
  readonly name: string;
  getTeams(season: number): Promise<NormalizedTeam[]>;
  getAthletes(season: number): Promise<NormalizedAthlete[]>;
  getGames(season: number, week?: number): Promise<NormalizedGame[]>;
  getAthleteGameStats(season: number, week: number): Promise<NormalizedAthleteGameStats[]>;
}
