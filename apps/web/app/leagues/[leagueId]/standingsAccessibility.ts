export type StandingRowAccessibility = {
  rank: number | string;
  team: string;
  manager?: string | null;
  record: string;
  pointsFor?: number | null;
  pointsAgainst?: number | null;
  streak?: string | null;
};

export function standingRowLabel(row: StandingRowAccessibility) {
  const manager = row.manager ? `Manager ${row.manager}. ` : '';
  const points = row.pointsFor == null ? '' : ` Points for ${row.pointsFor.toFixed(2)}.`;
  const against = row.pointsAgainst == null ? '' : ` Points against ${row.pointsAgainst.toFixed(2)}.`;
  const streak = row.streak ? ` Streak ${row.streak}.` : '';
  return `Rank ${row.rank}. Team ${row.team}. ${manager}Record ${row.record}.${points}${against}${streak}`;
}
