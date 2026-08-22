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

export type SportsDataRuntimeConfig = {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  webhookSecret?: string;
  timeoutMs: number;
};

export type SportsDataReadiness = {
  ready: boolean;
  provider: string | null;
  missing: string[];
};

/** Reads server-only provider configuration without exposing credential values. */
export function sportsDataReadiness(env: NodeJS.ProcessEnv = process.env): SportsDataReadiness {
  const provider = env.SPORTS_DATA_PROVIDER?.trim().toLowerCase() || null;
  const missing: string[] = [];
  if (!provider) missing.push('SPORTS_DATA_PROVIDER');
  if (!env.SPORTS_DATA_API_KEY?.trim()) missing.push('SPORTS_DATA_API_KEY');
  return { ready: missing.length === 0, provider, missing };
}

/** Fails closed when a sync worker starts before its provider credentials are complete. */
export function readSportsDataConfig(env: NodeJS.ProcessEnv = process.env): SportsDataRuntimeConfig {
  const readiness = sportsDataReadiness(env);
  if (!readiness.ready || !readiness.provider) {
    throw new Error(`Sports data is not configured. Missing: ${readiness.missing.join(', ')}`);
  }
  const parsedTimeout = Number(env.SPORTS_DATA_TIMEOUT_MS ?? 15_000);
  return {
    provider: readiness.provider,
    apiKey: env.SPORTS_DATA_API_KEY!.trim(),
    baseUrl: env.SPORTS_DATA_BASE_URL?.trim() || undefined,
    webhookSecret: env.SPORTS_DATA_WEBHOOK_SECRET?.trim() || undefined,
    timeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout >= 1_000 ? parsedTimeout : 15_000,
  };
}
