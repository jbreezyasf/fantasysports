export type PlayerSearchResultAccessibility = {
  name: string;
  position: string;
  team: string;
  availability: string;
  injuryStatus?: string | null;
  opponent?: string | null;
  projection?: number | null;
  action: string;
};

export function describePlayerSearchResult(result: PlayerSearchResultAccessibility) {
  const projection = result.projection == null ? 'Projection not displayed' : `Projection ${result.projection}`;
  return [
    result.name,
    `Position ${result.position}`,
    `NFL team ${result.team || 'not available'}`,
    `Availability ${result.availability}`,
    `Injury status ${result.injuryStatus || 'not available'}`,
    `Opponent ${result.opponent || 'not displayed'}`,
    projection,
    `Action ${result.action}`
  ].join('. ');
}

export function playerSearchSummary(count: number, filter: string, availableOnly: boolean, sortOrder: string) {
  const availability = availableOnly ? 'available players only' : 'all roster statuses';
  return `${count} result${count === 1 ? '' : 's'} for ${filter}, ${availability}. Sorted by ${sortOrder}.`;
}
