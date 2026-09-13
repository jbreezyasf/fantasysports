type RealGameWeek = { week: number; starts_at: string };

type FranchiseMatchup = {
  week: number;
  home_season_franchise_id: string;
  away_season_franchise_id: string;
  is_final: boolean;
};

export function currentCompetitionWeek(games: RealGameWeek[], now = new Date()) {
  const ordered = games
    .filter(game => Number.isInteger(game.week) && !Number.isNaN(Date.parse(game.starts_at)))
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at));
  const started = ordered.filter(game => Date.parse(game.starts_at) <= now.getTime());
  return started.at(-1)?.week ?? ordered[0]?.week ?? null;
}

export function selectFrontOfficeMatchup<T extends FranchiseMatchup>(matchups: T[], seasonFranchiseId: string | undefined, currentWeek: number | null) {
  if (!seasonFranchiseId) return null;
  const mine = matchups.filter(matchup => matchup.home_season_franchise_id === seasonFranchiseId || matchup.away_season_franchise_id === seasonFranchiseId);
  return mine.find(matchup => matchup.week === currentWeek) ?? mine.find(matchup => !matchup.is_final) ?? mine.at(-1) ?? null;
}
