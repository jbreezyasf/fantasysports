export type WeeklyPlayerScore = {
  athlete_id: string | null;
  week: number;
  points: number | string | null;
};
export type PlayerPerformance = {
  games: number;
  seasonAverage: number;
  lastThreeAverage: number;
  lastWeek: number;
  bestWeek: number;
  bestPoints: number;
  trend: "up" | "down" | "steady" | "new";
  weekly: Array<{ week: number; points: number }>;
};

const asPoints = (value: number | string | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildPlayerPerformance(rows: WeeklyPlayerScore[]) {
  const grouped = new Map<string, Array<{ week: number; points: number }>>();
  for (const row of rows) {
    if (!row.athlete_id || !Number.isInteger(Number(row.week))) continue;
    const weekly = grouped.get(row.athlete_id) ?? [];
    weekly.push({ week: Number(row.week), points: asPoints(row.points) });
    grouped.set(row.athlete_id, weekly);
  }
  const result = new Map<string, PlayerPerformance>();
  for (const [athleteId, unsorted] of grouped) {
    const weekly = [...unsorted].sort((a, b) => a.week - b.week);
    const recent = weekly.slice(-3);
    const best = weekly.reduce(
      (current, item) => (item.points > current.points ? item : current),
      weekly[0],
    );
    const seasonAverage =
      weekly.reduce((sum, item) => sum + item.points, 0) / weekly.length;
    const lastThreeAverage =
      recent.reduce((sum, item) => sum + item.points, 0) / recent.length;
    const previous = recent.at(-2)?.points;
    const latest = recent.at(-1)?.points ?? 0;
    const trend =
      previous == null
        ? "new"
        : latest > previous + 0.5
          ? "up"
          : latest < previous - 0.5
            ? "down"
            : "steady";
    result.set(athleteId, {
      games: weekly.length,
      seasonAverage,
      lastThreeAverage,
      lastWeek: latest,
      bestWeek: best.week,
      bestPoints: best.points,
      trend,
      weekly,
    });
  }
  return result;
}

export function performanceSummary(performance: PlayerPerformance | undefined) {
  if (!performance) return "No scored weeks yet";
  const recentLabel =
    performance.games >= 3 ? "LAST 3 AVG" : `${performance.games} WEEK AVG`;
  return `${recentLabel} ${performance.lastThreeAverage.toFixed(1)} • LAST ${performance.lastWeek.toFixed(1)} • BEST ${performance.bestPoints.toFixed(1)} IN WEEK ${performance.bestWeek}`;
}
