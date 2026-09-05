import 'server-only';

export {
  balldontlieDefenseFantasyPoints,
  balldontliePlayerFantasyPoints,
  balldontliePlayerName,
  normalizeNflPosition,
  normalizeNflTeamAlias,
  numberValue,
  readStat,
} from './balldontlieScoring';

export type BalldontlieNflTeam = {
  id: number;
  abbreviation?: string;
  full_name?: string;
  location?: string;
  name?: string;
};

export type BalldontlieNflPlayer = {
  id: number;
  first_name?: string;
  last_name?: string;
  position?: string;
  position_abbreviation?: string;
  team?: BalldontlieNflTeam | null;
};

export type BalldontlieNflSeasonStat = {
  player?: BalldontlieNflPlayer | null;
  team?: BalldontlieNflTeam | null;
  season?: number;
  games_played?: number | string | null;
  games_started?: number | string | null;
} & Record<string, unknown>;

export type BalldontlieNflFantasyRanking = {
  player?: BalldontlieNflPlayer | null;
  team?: BalldontlieNflTeam | null;
  position?: string | null;
  rankings?: Record<string, unknown> | null;
} & Record<string, unknown>;

export type BalldontlieNflFantasyAdp = {
  player?: BalldontlieNflPlayer | null;
  team?: BalldontlieNflTeam | null;
  position?: string | null;
  average_draft_position?: number | string | null;
  average_auction_value?: number | string | null;
  percent_rostered?: number | string | null;
  percent_started?: number | string | null;
} & Record<string, unknown>;

export type BalldontlieNflFantasyProjection = {
  player?: BalldontlieNflPlayer | null;
  team?: BalldontlieNflTeam | null;
  position?: string | null;
  projected_games?: number | string | null;
  projections?: Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
} & Record<string, unknown>;

type Page<T> = {
  data?: T[];
  meta?: { next_cursor?: number | string | null; per_page?: number };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class BalldontlieNflClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly minRequestMs: number;
  private lastRequestAt = 0;
  private requestGate = Promise.resolve();
  private requests = 0;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const provider = env.SPORTS_DATA_PROVIDER?.trim().toLowerCase();
    const apiKey = env.BALLDONTLIE_API_KEY?.trim() || env.balldontlie?.trim() || (provider === 'balldontlie' ? env.SPORTS_DATA_API_KEY?.trim() : '');
    if (!apiKey) throw new Error('A balldontlie API key is missing.');
    this.apiKey = apiKey;
    this.baseUrl = (env.BALLDONTLIE_BASE_URL?.trim() || env.SPORTS_DATA_BASE_URL?.trim() || 'https://api.balldontlie.io').replace(/\/$/, '');
    this.minRequestMs = Number(env.BALLDONTLIE_MIN_REQUEST_MS || 12_500);
  }

  get requestCount() {
    return this.requests;
  }

  private async get<T>(path: string, params?: Record<string, string | number | Array<string | number> | null | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const entry of value) url.searchParams.append(`${key}[]`, String(entry));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.waitForRequestSlot();
      const response = await fetch(url, {
        headers: { accept: 'application/json', Authorization: this.apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(Number(process.env.SPORTS_DATA_TIMEOUT_MS || 15_000)),
      });
      this.requests += 1;
      if (response.ok) return response.json() as Promise<T>;
      if (response.status !== 429 || attempt === 2) throw new Error(`balldontlie ${response.status} while requesting ${path}.`);
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 15_000 * (attempt + 1));
    }
    throw new Error(`balldontlie request failed for ${path}.`);
  }

  private async waitForRequestSlot() {
    const turn = this.requestGate.then(async () => {
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < this.minRequestMs) await sleep(this.minRequestMs - elapsed);
      this.lastRequestAt = Date.now();
    });
    this.requestGate = turn.catch(() => {});
    await turn;
  }

  async listAll<T>(path: string, params?: Record<string, string | number | Array<string | number> | null | undefined>): Promise<T[]> {
    const rows: T[] = [];
    let cursor: number | string | null | undefined = undefined;
    do {
      const page: Page<T> = await this.get<Page<T>>(path, { ...params, cursor, per_page: params?.per_page ?? 100 });
      rows.push(...(page.data ?? []));
      cursor = page.meta?.next_cursor;
    } while (cursor);
    return rows;
  }

  getTeams() {
    return this.listAll<BalldontlieNflTeam>('/nfl/v1/teams', { per_page: 100 });
  }

  getSeasonStats(season: number, seasonType = 2) {
    return this.listAll<BalldontlieNflSeasonStat>('/nfl/v1/season_stats', { season, season_type: seasonType, per_page: 100 });
  }

  getTeamSeasonStats(season: number, teamIds: number[], seasonType = 2) {
    return this.listAll<BalldontlieNflSeasonStat>('/nfl/v1/team_season_stats', { season, team_ids: teamIds, season_type: seasonType, per_page: 100 });
  }

  getFantasyRankings(season: number, rankingType = 'half_ppr') {
    return this.listAll<BalldontlieNflFantasyRanking>('/nfl/v1/fantasy/rankings', { season, ranking_type: rankingType, per_page: 100 });
  }

  getFantasyAdp(season: number) {
    return this.listAll<BalldontlieNflFantasyAdp>('/nfl/v1/fantasy/adp', { season, per_page: 100 });
  }

  getFantasyProjections(season: number) {
    return this.listAll<BalldontlieNflFantasyProjection>('/nfl/v1/fantasy/projections', { season, per_page: 100 });
  }
}
