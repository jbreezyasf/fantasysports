export type FootballStatLine = {
  passYards?: number;
  passTd?: number;
  interceptions?: number;
  rushYards?: number;
  rushTd?: number;
  receptions?: number;
  receivingYards?: number;
  receivingTd?: number;
  returnTd?: number;
  twoPointConversions?: number;
  fumblesLost?: number;
};

export type FootballScoreBreakdown = Record<string, number>;

export function scoreHalfPprFootball(stats: FootballStatLine) {
  const breakdown: FootballScoreBreakdown = {
    passing_yards: (stats.passYards ?? 0) / 25,
    passing_td: (stats.passTd ?? 0) * 6,
    interceptions: (stats.interceptions ?? 0) * -2,
    rushing_yards: (stats.rushYards ?? 0) / 10,
    rushing_td: (stats.rushTd ?? 0) * 6,
    receptions: (stats.receptions ?? 0) * 0.5,
    receiving_yards: (stats.receivingYards ?? 0) / 10,
    receiving_td: (stats.receivingTd ?? 0) * 6,
    return_td: (stats.returnTd ?? 0) * 6,
    two_point_conversion: (stats.twoPointConversions ?? 0) * 2,
    fumble_lost: (stats.fumblesLost ?? 0) * -2
  };

  return {
    points: Object.values(breakdown).reduce((sum, points) => sum + points, 0),
    breakdown
  };
}

export type DstStatLine = {
  sacks?: number;
  interceptions?: number;
  fumbleRecoveries?: number;
  defensiveTd?: number;
  safety?: number;
  blockedKick?: number;
  returnTd?: number;
  pointsAllowed?: number;
};

function pointsAllowedScore(pointsAllowed = 0) {
  if (pointsAllowed === 0) return 10;
  if (pointsAllowed <= 6) return 7;
  if (pointsAllowed <= 13) return 4;
  if (pointsAllowed <= 20) return 1;
  if (pointsAllowed <= 27) return 0;
  if (pointsAllowed <= 34) return -1;
  return -4;
}

export function scoreStandardDst(stats: DstStatLine) {
  const breakdown: FootballScoreBreakdown = {
    sacks: stats.sacks ?? 0,
    interceptions: (stats.interceptions ?? 0) * 2,
    fumble_recoveries: (stats.fumbleRecoveries ?? 0) * 2,
    defensive_td: (stats.defensiveTd ?? 0) * 6,
    safety: (stats.safety ?? 0) * 2,
    blocked_kick: (stats.blockedKick ?? 0) * 2,
    return_td: (stats.returnTd ?? 0) * 6,
    points_allowed: pointsAllowedScore(stats.pointsAllowed)
  };

  return {
    points: Object.values(breakdown).reduce((sum, points) => sum + points, 0),
    breakdown
  };
}
