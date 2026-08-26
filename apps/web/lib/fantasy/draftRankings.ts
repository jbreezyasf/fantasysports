export type DraftRankingScore = {
  assetId: string | null;
  points: number | string | null;
  calculated_at: string | null;
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

export const DRAFT_RANKING_SOURCE = 'Big Exec internal form';
export const DRAFT_RANKING_FALLBACK_VERSION = 'deterministic-fallback-v1';

const POSITION_PRIORITY: Record<string, number> = {
  RB: 1,
  WR: 2,
  QB: 3,
  TE: 4,
  'D/ST': 5,
  K: 6,
};

function normalizeScore(value: number | string | null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function scoreMap(scores: DraftRankingScore[]) {
  const totals = new Map<string, number>();
  let latestVersion: string | null = null;

  for (const score of scores) {
    if (!score.assetId) continue;
    const points = normalizeScore(score.points);
    if (points === null) continue;
    totals.set(score.assetId, (totals.get(score.assetId) ?? 0) + points);
    if (score.calculated_at && (!latestVersion || score.calculated_at > latestVersion)) {
      latestVersion = score.calculated_at;
    }
  }

  return { totals, latestVersion };
}

function compareCandidates(a: Candidate<unknown>, b: Candidate<unknown>) {
  if (a.score !== null || b.score !== null) {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    if (b.score !== a.score) return b.score - a.score;
  }

  const positionDelta = (POSITION_PRIORITY[a.position] ?? 99) - (POSITION_PRIORITY[b.position] ?? 99);
  if (positionDelta !== 0) return positionDelta;
  const nameDelta = a.displayName.localeCompare(b.displayName);
  if (nameDelta !== 0) return nameDelta;
  return a.id.localeCompare(b.id);
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

  const candidates: Array<Candidate<RankableAthlete | RankableDefense>> = [
    ...athletes.map(asset => ({
      asset,
      id: asset.id,
      position: asset.position,
      displayName: asset.displayName,
      score: athleteScoreMap.totals.get(asset.id) ?? null,
    })),
    ...defenses.map(asset => ({
      asset,
      id: asset.id,
      position: 'D/ST',
      displayName: asset.displayName,
      score: defenseScoreMap.totals.get(asset.id) ?? null,
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
