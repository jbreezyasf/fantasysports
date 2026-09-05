export type DraftRankingScore = {
  assetId: string | null;
  points: number | string | null;
  calculated_at: string | null;
  seasonYear?: number | string | null;
  source?: string | null;
};

export type RankableAthlete = {
  id: string;
  displayName: string;
  position: string;
  team: string;
};

export type RankableDefense = {
  id: string;
  displayName: string;
  team: string;
};

export type RankedDraftAsset<T> = T & {
  overallRank: number;
  positionRank: number;
  rankingScore: number | null;
  rankingSource: string;
  rankingVersion: string;
};

type Candidate<T> = {
  asset: T;
  id: string;
  position: string;
  displayName: string;
  score: number | null;
};

export const DRAFT_RANKING_SOURCE = 'Big Exec historical draft value';
export const DRAFT_RANKING_FALLBACK_VERSION = 'historical-average-position-prior';

const POSITION_PRIORITY: Record<string, number> = {
  RB: 1,
  WR: 2,
  QB: 3,
  TE: 4,
  'D/ST': 5,
  K: 6,
};

const NO_HISTORY_FACTOR: Record<string, number> = {
  RB: 0.62,
  WR: 0.58,
  QB: 0.56,
  TE: 0.54,
  'D/ST': 0.72,
  K: 0.72,
};

const EMERGENCY_POSITION_PRIOR: Record<string, number> = {
  RB: 95,
  WR: 88,
  QB: 84,
  TE: 56,
  'D/ST': 48,
  K: 44,
};

const REPLACEMENT_RANK: Record<string, number> = {
  QB: 12,
  RB: 36,
  WR: 48,
  TE: 12,
  'D/ST': 12,
  K: 12,
};

const SOURCE_PRIORITY: Record<string, number> = {
  balldontlie: 1,
  sportradar: 2,
  existing_fantasy_scores: 3,
};

function normalizeScore(value: number | string | null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeSeasonYear(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function scoreMap(scores: DraftRankingScore[]) {
  const perSeason = new Map<string, Map<number, { points: number; sourcePriority: number; calculatedAt: string }>>();
  const aggregate = new Map<string, number>();
  let latestVersion: string | null = null;
  let hasSeasonalScores = false;

  for (const score of scores) {
    if (!score.assetId) continue;
    const points = normalizeScore(score.points);
    if (points === null) continue;
    const seasonYear = normalizeSeasonYear(score.seasonYear);
    if (seasonYear === null) {
      aggregate.set(score.assetId, (aggregate.get(score.assetId) ?? 0) + points);
    } else {
      hasSeasonalScores = true;
      const seasons = perSeason.get(score.assetId) ?? new Map<number, { points: number; sourcePriority: number; calculatedAt: string }>();
      const sourcePriority = SOURCE_PRIORITY[score.source ?? ''] ?? 9;
      const calculatedAt = score.calculated_at ?? '';
      const existing = seasons.get(seasonYear);
      if (!existing || sourcePriority < existing.sourcePriority || (sourcePriority === existing.sourcePriority && calculatedAt > existing.calculatedAt)) {
        seasons.set(seasonYear, { points, sourcePriority, calculatedAt });
      }
      perSeason.set(score.assetId, seasons);
    }
    if (score.calculated_at && (!latestVersion || score.calculated_at > latestVersion)) {
      latestVersion = score.calculated_at;
    }
  }

  const totals = new Map<string, number>();
  for (const [assetId, seasons] of perSeason) {
    const recentTotals = [...seasons.entries()]
      .sort(([a], [b]) => b - a)
      .slice(0, 5)
      .map(([, value]) => value.points);
    if (recentTotals.length) {
      totals.set(assetId, recentTotals.reduce((sum, points) => sum + points, 0) / recentTotals.length);
    }
  }
  for (const [assetId, points] of aggregate) {
    if (!totals.has(assetId)) totals.set(assetId, points);
  }

  return { totals, latestVersion, hasSeasonalScores };
}

function compareCandidates(a: Candidate<unknown>, b: Candidate<unknown>) {
  if (a.score !== null && b.score !== null && b.score !== a.score) return b.score - a.score;

  const positionDelta = (POSITION_PRIORITY[a.position] ?? 99) - (POSITION_PRIORITY[b.position] ?? 99);
  if (positionDelta !== 0) return positionDelta;
  return a.id.localeCompare(b.id);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function positionPrior(position: string, scoredByPosition: Map<string, number[]>) {
  const fromHistory = median(scoredByPosition.get(position) ?? []);
  const base = fromHistory ?? EMERGENCY_POSITION_PRIOR[position] ?? 20;
  return Math.round(base * (NO_HISTORY_FACTOR[position] ?? 0.5) * 10) / 10;
}

function replacementBaseline(position: string, scoredByPosition: Map<string, number[]>) {
  const values = [...(scoredByPosition.get(position) ?? [])].sort((a, b) => b - a);
  const rank = REPLACEMENT_RANK[position] ?? 12;
  if (values.length >= rank) return values[rank - 1];
  if (values.length >= 5) return values.at(-1) ?? 0;
  return 0;
}

export function buildDraftRankings(
  athletes: RankableAthlete[],
  defenses: RankableDefense[],
  athleteScores: DraftRankingScore[],
  defenseScores: DraftRankingScore[],
) {
  const athleteScoreMap = scoreMap(athleteScores);
  const defenseScoreMap = scoreMap(defenseScores);
  const rankingVersion =
    [athleteScoreMap.latestVersion, defenseScoreMap.latestVersion].filter(Boolean).sort().at(-1) ??
    DRAFT_RANKING_FALLBACK_VERSION;
  const hasAnyScores = athleteScoreMap.totals.size > 0 || defenseScoreMap.totals.size > 0;
  const shouldUsePositionPriors = athleteScoreMap.hasSeasonalScores || defenseScoreMap.hasSeasonalScores || !hasAnyScores;

  const scoredByPosition = new Map<string, number[]>();
  for (const asset of athletes) {
    const score = athleteScoreMap.totals.get(asset.id);
    if (score === undefined) continue;
    const scores = scoredByPosition.get(asset.position) ?? [];
    scores.push(score);
    scoredByPosition.set(asset.position, scores);
  }
  for (const asset of defenses) {
    const score = defenseScoreMap.totals.get(asset.id);
    if (score === undefined) continue;
    const scores = scoredByPosition.get('D/ST') ?? [];
    scores.push(score);
    scoredByPosition.set('D/ST', scores);
  }

  const candidates: Array<Candidate<RankableAthlete | RankableDefense>> = [
    ...athletes.map(asset => ({
      asset,
      id: asset.id,
      position: asset.position,
      displayName: asset.displayName,
      score: (() => {
        const points = athleteScoreMap.totals.get(asset.id) ?? (shouldUsePositionPriors ? positionPrior(asset.position, scoredByPosition) : null);
        return points === null ? null : points - replacementBaseline(asset.position, scoredByPosition);
      })(),
    })),
    ...defenses.map(asset => ({
      asset,
      id: asset.id,
      position: 'D/ST',
      displayName: asset.displayName,
      score: (() => {
        const points = defenseScoreMap.totals.get(asset.id) ?? (shouldUsePositionPriors ? positionPrior('D/ST', scoredByPosition) : null);
        return points === null ? null : points - replacementBaseline('D/ST', scoredByPosition);
      })(),
    })),
  ].sort(compareCandidates);

  const positionCounts = new Map<string, number>();
  const ranked = candidates.map((candidate, index) => {
    const positionRank = (positionCounts.get(candidate.position) ?? 0) + 1;
    positionCounts.set(candidate.position, positionRank);
    return {
      ...candidate.asset,
      overallRank: index + 1,
      positionRank,
      rankingScore: candidate.score,
      rankingSource: DRAFT_RANKING_SOURCE,
      rankingVersion,
    };
  });

  const rankedAthletes = ranked.filter((asset): asset is RankedDraftAsset<RankableAthlete> => 'position' in asset);
  const rankedDefenses = ranked.filter((asset): asset is RankedDraftAsset<RankableDefense> => !('position' in asset));

  return {
    athletes: rankedAthletes,
    defenses: rankedDefenses,
    source: DRAFT_RANKING_SOURCE,
    version: rankingVersion,
  };
}
