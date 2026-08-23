import 'server-only';

type RadarTeam = { id: string; alias?: string; market?: string; name?: string };
type RadarPlayer = { id: string; name?: string; full_name?: string; position?: string; status?: string };
type RadarSeason = { year: number; start_date?: string; end_date?: string; type?: { code?: string } | string };

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
    if (elapsed < 1_050) await sleep(1_050 - elapsed);
    this.lastRequestAt = Date.now();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { accept: 'application/json', 'x-api-key': this.apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    this.requests += 1;
    if (!response.ok) throw new Error(`Sportradar ${response.status} while requesting ${path}.`);
    return response.json() as Promise<T>;
  }

  async getDraftSnapshot(year: number): Promise<SportradarDraftSnapshot> {
    const teamPayload = await this.get<{ teams?: RadarTeam[] }>('/league/teams.json');
    const seasonPayload = await this.get<{ seasons?: RadarSeason[] }>('/league/seasons.json');
    const teams = teamPayload.teams ?? [];
    if (teams.length < 32) throw new Error(`Sportradar returned only ${teams.length} NFL teams.`);
    const rostered: SportradarDraftSnapshot['teams'] = [];
    for (const team of teams) {
      const payload = await this.get<{ players?: RadarPlayer[] }>(`/teams/${encodeURIComponent(team.id)}/full_roster.json`);
      rostered.push({ ...team, players: payload.players ?? [] });
    }
    const regular = (seasonPayload.seasons ?? []).find(s => s.year === year && (typeof s.type === 'string' ? s.type : s.type?.code) === 'REG');
    return {
      teams: rostered,
      season: { year, startsOn: regular?.start_date, endsOn: regular?.end_date },
      requests: this.requests,
    };
  }
}
