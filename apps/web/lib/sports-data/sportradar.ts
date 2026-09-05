import 'server-only';

type RadarTeam = { id: string; alias?: string; market?: string; name?: string };
type RadarPlayer = { id: string; name?: string; full_name?: string; position?: string; status?: string };
type RadarSeason = { year: number; start_date?: string; end_date?: string; type?: { code?: string } | string };
type RadarSeasonalStatistics = {
  id?: string;
  alias?: string;
  market?: string;
  name?: string;
  record?: Record<string, unknown>;
  opponents?: Record<string, unknown>;
  player_records?: Array<RadarPlayer & { games_played?: number | string; games_started?: number | string } & Record<string, unknown>>;
};

export type SportradarDraftSnapshot = {
  teams: Array<RadarTeam & { players: RadarPlayer[] }>;
  season: { year: number; startsOn?: string; endsOn?: string };
  requests: number;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class SportradarNflClient {
  private readonly apiKey: string;
  private readonly accessLevel: string;
  private readonly baseUrl: string;
  private lastRequestAt = 0;
  private requests = 0;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const apiKey = env.SPORTS_DATA_API_KEY?.trim() || env.NFL_API?.trim() || env.sportradar?.trim();
    const provider = env.SPORTS_DATA_PROVIDER?.trim().toLowerCase() || (apiKey ? 'sportradar' : '');
    if (provider !== 'sportradar') throw new Error('SPORTS_DATA_PROVIDER must be sportradar.');
    if (!apiKey) throw new Error('A Sportradar NFL API key is missing.');
    this.apiKey = apiKey;
    this.accessLevel = env.SPORTRADAR_ACCESS_LEVEL?.trim() || 'trial';
    this.baseUrl = (env.SPORTS_DATA_BASE_URL?.trim() || `https://api.sportradar.com/nfl/official/${this.accessLevel}/v7/en`).replace(/\/$/, '');
  }

  private async get<T>(path: string): Promise<T> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < 1_250) await sleep(1_250 - elapsed);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      this.lastRequestAt = Date.now();
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: { accept: 'application/json', 'x-api-key': this.apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      this.requests += 1;
      if (response.ok) return response.json() as Promise<T>;
      if (response.status !== 429 || attempt === 2) throw new Error(`Sportradar ${response.status} while requesting ${path}.`);
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 2_000 * (attempt + 1));
    }
    throw new Error(`Sportradar request failed for ${path}.`);
  }

  async getDraftSnapshot(year: number): Promise<SportradarDraftSnapshot> {
    const teamPayload = await this.get<{ teams?: RadarTeam[] }>('/league/teams.json');
    const seasonPayload = await this.get<{ seasons?: RadarSeason[] }>('/league/seasons.json');
    const teams = teamPayload.teams ?? [];
    if (teams.length < 32) throw new Error(`Sportradar returned only ${teams.length} NFL teams.`);
    const rostered: SportradarDraftSnapshot['teams'] = [];
    const seenAliases = new Set<string>();
    for (const team of teams) {
      const alias = team.alias?.trim().toUpperCase() === 'JAC' ? 'JAX' : team.alias?.trim().toUpperCase();
      if (!alias || seenAliases.has(alias)) continue;
      try {
        const payload = await this.get<{ players?: RadarPlayer[] }>(`/teams/${encodeURIComponent(team.id)}/full_roster.json`);
        rostered.push({ ...team, players: payload.players ?? [] });
        seenAliases.add(alias);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Sportradar 404')) continue;
        throw error;
      }
    }
    if (rostered.length < 32) throw new Error(`Sportradar returned rosters for only ${rostered.length} NFL teams.`);
    const regular = (seasonPayload.seasons ?? []).find(s => s.year === year && (typeof s.type === 'string' ? s.type : s.type?.code) === 'REG');
    return {
      teams: rostered,
      season: { year, startsOn: regular?.start_date, endsOn: regular?.end_date },
      requests: this.requests,
    };
  }

  async getSeasonalStatistics(year: number, seasonType: 'REG' | 'PST' | 'PRE', teamId: string): Promise<RadarSeasonalStatistics> {
    return this.get<RadarSeasonalStatistics>(`/seasons/${year}/${seasonType}/teams/${encodeURIComponent(teamId)}/statistics.json`);
  }
}
