export type AssistantGMRosterAsset = {
  id: string;
  name: string;
  position: string;
  team?: string | null;
  overallRank?: number | null;
  positionRank?: number | null;
  rankingScore?: number | null;
};

export type AssistantGMAvailableAsset = AssistantGMRosterAsset & {
  assetType: 'athlete' | 'defense';
};

export type AssistantGMLineupSlot = {
  slot: string;
  slotIndex: number;
  filled: boolean;
};

export type AssistantGMPositionNeed = {
  position: string;
  current: number;
  target: number;
  deficit: number;
};

export type AssistantGMTarget = AssistantGMAvailableAsset & {
  needDeficit: number;
  reason: string;
};

export type AssistantGMDecisionContext = {
  positionNeeds: AssistantGMPositionNeed[];
  topTargets: AssistantGMTarget[];
  dropCandidates: AssistantGMRosterAsset[];
  emptyLineupSlots: AssistantGMLineupSlot[];
};

const DEFAULT_STARTERS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  K: 1,
  'D/ST': 1,
};

function normalizePosition(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'DST' || normalized === 'DEF') return 'D/ST';
  return normalized;
}

function starterTargets(rosterConfig?: { starters?: Record<string, number> } | null) {
  const source = rosterConfig?.starters && Object.keys(rosterConfig.starters).length
    ? rosterConfig.starters
    : DEFAULT_STARTERS;

  const targets = new Map<string, number>();
  for (const [rawPosition, rawCount] of Object.entries(source)) {
    const position = normalizePosition(rawPosition);
    if (position === 'FLEX') continue;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count <= 0) continue;
    targets.set(position, (targets.get(position) ?? 0) + count);
  }
  return targets;
}

export function buildPositionNeeds(
  roster: AssistantGMRosterAsset[],
  rosterConfig?: { starters?: Record<string, number> } | null,
): AssistantGMPositionNeed[] {
  const targets = starterTargets(rosterConfig);
  const counts = new Map<string, number>();

  for (const asset of roster) {
    const position = normalizePosition(asset.position);
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }

  return [...targets.entries()]
    .map(([position, target]) => {
      const current = counts.get(position) ?? 0;
      return { position, current, target, deficit: Math.max(0, target - current) };
    })
    .sort((a, b) => b.deficit - a.deficit || a.position.localeCompare(b.position));
}

function rankValue(asset: AssistantGMRosterAsset) {
  return typeof asset.overallRank === 'number' && Number.isFinite(asset.overallRank)
    ? asset.overallRank
    : 100_000;
}

export function recommendAvailableTargets(
  roster: AssistantGMRosterAsset[],
  available: AssistantGMAvailableAsset[],
  rosterConfig?: { starters?: Record<string, number> } | null,
  limit = 5,
): AssistantGMTarget[] {
  const needs = buildPositionNeeds(roster, rosterConfig);
  const deficitByPosition = new Map(needs.map(need => [need.position, need.deficit]));

  return [...available]
    .sort((a, b) => {
      const aNeed = deficitByPosition.get(normalizePosition(a.position)) ?? 0;
      const bNeed = deficitByPosition.get(normalizePosition(b.position)) ?? 0;
      if (aNeed !== bNeed) return bNeed - aNeed;
      return rankValue(a) - rankValue(b) || a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(1, limit))
    .map(asset => {
      const position = normalizePosition(asset.position);
      const needDeficit = deficitByPosition.get(position) ?? 0;
      const rankLabel = typeof asset.overallRank === 'number' ? `Big Exec rank #${asset.overallRank}` : 'Big Exec fallback ranking';
      return {
        ...asset,
        position,
        needDeficit,
        reason: needDeficit > 0
          ? `${position} is below the configured starter requirement; ${rankLabel}.`
          : `Best currently available ${position} option by ${rankLabel}.`,
      };
    });
}

export function findDropCandidates(
  roster: AssistantGMRosterAsset[],
  rosterConfig?: { starters?: Record<string, number> } | null,
  limit = 3,
) {
  const targets = starterTargets(rosterConfig);
  const counts = new Map<string, number>();
  for (const asset of roster) {
    const position = normalizePosition(asset.position);
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }

  const surplus = roster.filter(asset => {
    const position = normalizePosition(asset.position);
    const target = targets.get(position) ?? 0;
    return (counts.get(position) ?? 0) > target;
  });
  const pool = surplus.length ? surplus : roster;

  return [...pool]
    .sort((a, b) => rankValue(b) - rankValue(a) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}

export function buildAssistantGMDecisionContext(args: {
  roster: AssistantGMRosterAsset[];
  available: AssistantGMAvailableAsset[];
  lineupSlots?: AssistantGMLineupSlot[];
  rosterConfig?: { starters?: Record<string, number> } | null;
}): AssistantGMDecisionContext {
  return {
    positionNeeds: buildPositionNeeds(args.roster, args.rosterConfig),
    topTargets: recommendAvailableTargets(args.roster, args.available, args.rosterConfig),
    dropCandidates: findDropCandidates(args.roster, args.rosterConfig),
    emptyLineupSlots: (args.lineupSlots ?? []).filter(slot => !slot.filled),
  };
}
