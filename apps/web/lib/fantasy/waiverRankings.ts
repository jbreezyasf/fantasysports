export type WaiverMarketValue = {
  athleteId: string;
  overallRank?: number | null;
  positionRank?: number | null;
  adp?: number | null;
  projectedPoints?: number | null;
  percentRostered?: number | null;
  importedAt?: string | null;
  source?: string | null;
};

export type WaiverRankablePlayer = {
  id: string;
  displayName: string;
  injuryStatus?: string | null;
};

function finite(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function availabilityTier(status?: string | null) {
  const normalized = status?.trim().toUpperCase();
  if (!normalized || ['ACT', 'ACTIVE', 'PROBABLE'].includes(normalized)) return 0;
  if (['QUESTIONABLE', 'Q', 'DOUBTFUL', 'D'].includes(normalized)) return 1;
  return 2;
}

export function rankWaiverPlayers<T extends WaiverRankablePlayer>(
  players: T[],
  marketValues: WaiverMarketValue[],
  recentPoints: Map<string, number> = new Map(),
) {
  const marketByAthlete = new Map(marketValues.map(value => [value.athleteId, value]));
  return [...players].sort((a, b) => {
    const healthDelta = availabilityTier(a.injuryStatus) - availabilityTier(b.injuryStatus);
    if (healthDelta) return healthDelta;
    const aMarket = marketByAthlete.get(a.id);
    const bMarket = marketByAthlete.get(b.id);
    const projectionDelta = (finite(bMarket?.projectedPoints) ?? -Infinity) - (finite(aMarket?.projectedPoints) ?? -Infinity);
    if (Number.isFinite(projectionDelta) && projectionDelta) return projectionDelta;
    const rankDelta = (finite(aMarket?.overallRank) ?? Infinity) - (finite(bMarket?.overallRank) ?? Infinity);
    if (Number.isFinite(rankDelta) && rankDelta) return rankDelta;
    const adpDelta = (finite(aMarket?.adp) ?? Infinity) - (finite(bMarket?.adp) ?? Infinity);
    if (Number.isFinite(adpDelta) && adpDelta) return adpDelta;
    const recentDelta = (recentPoints.get(b.id) ?? 0) - (recentPoints.get(a.id) ?? 0);
    if (recentDelta) return recentDelta;
    const rosteredDelta = (finite(bMarket?.percentRostered) ?? -Infinity) - (finite(aMarket?.percentRostered) ?? -Infinity);
    if (Number.isFinite(rosteredDelta) && rosteredDelta) return rosteredDelta;
    return a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
  });
}
