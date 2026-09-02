export type StarterState = 'starter' | 'bench';

export type RosterAccessibilityAsset = {
  name: string;
  position: string;
  team: string;
  starterState: StarterState;
  slotLabel?: string;
  gameStatus?: string | null;
  injuryStatus?: string | null;
  projectedPoints?: number | null;
};

const unavailable = 'not available';

export function describeRosterAsset(asset: RosterAccessibilityAsset) {
  const state = asset.starterState === 'starter'
    ? `Starter${asset.slotLabel ? ` in ${asset.slotLabel}` : ''}`
    : 'Bench player';
  const projected = asset.projectedPoints == null ? 'Projected points not displayed' : `Projected points ${asset.projectedPoints}`;
  return [
    `${state}: ${asset.name}`,
    `Position ${asset.position || unavailable}`,
    `NFL team ${asset.team || unavailable}`,
    `Game status ${asset.gameStatus || unavailable}`,
    `Injury status ${asset.injuryStatus || unavailable}`,
    projected
  ].join('. ');
}

export function describeLineupSlot(slotLabel: string, currentAsset?: string) {
  return currentAsset
    ? `Starter slot ${slotLabel}. Current player: ${currentAsset}. Valid move actions follow.`
    : `Starter slot ${slotLabel}. Empty slot. Valid move actions follow if eligible players are available.`;
}

export function lineupMoveButtonLabel(assetLabel: string, slotLabel: string, week: number) {
  return `Move ${assetLabel} to ${slotLabel} for week ${week}`;
}

export function lineupMoveConfirmation(assetLabel: string, slotLabel: string, week: number) {
  return `${assetLabel} moved to ${slotLabel} for week ${week}.`;
}
