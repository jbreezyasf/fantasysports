export { currentCompetitionWeek } from '../../../lib/fantasy/currentWeek';

type FranchiseMatchup = {
  week: number;
  home_season_franchise_id: string;
  away_season_franchise_id: string;
  is_final: boolean;
};

export function selectFrontOfficeMatchup<T extends FranchiseMatchup>(matchups: T[], seasonFranchiseId: string | undefined, currentWeek: number | null) {
  if (!seasonFranchiseId) return null;
  const mine = matchups.filter(matchup => matchup.home_season_franchise_id === seasonFranchiseId || matchup.away_season_franchise_id === seasonFranchiseId);
  return mine.find(matchup => matchup.week === currentWeek) ?? mine.find(matchup => !matchup.is_final) ?? mine.at(-1) ?? null;
}
