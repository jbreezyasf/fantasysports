type DraftState = {
  status: string;
  currentRound?: number | null;
  currentPick?: number | null;
  roundPick?: number | null;
  managerOnClock?: string | null;
  userNextPick?: number | null;
};

export function draftStateAnnouncement(state: DraftState) {
  const current = state.currentRound && state.roundPick
    ? `Round ${state.currentRound}, Pick ${state.roundPick}`
    : 'Current pick not available';
  const manager = state.managerOnClock ? `${state.managerOnClock} is on the clock` : 'Manager on clock not available';
  const userNext = state.userNextPick ? `Your next pick is pick ${state.userNextPick}` : 'Your next pick is not currently scheduled';
  return `Draft status ${state.status}. ${current}. Overall pick ${state.currentPick ?? 'not available'}. ${manager}. ${userNext}.`;
}

export function onClockAnnouncement(round?: number | null, pick?: number | null, seconds?: number | null) {
  return `You are on the clock. Round ${round ?? 'unknown'}, Pick ${pick ?? 'unknown'}. ${seconds ?? 'unknown'} seconds remaining.`;
}

export function draftCandidateLabel(asset: { name: string; position: string; team: string; rank: number; score: string; action: string }) {
  return `${asset.name}. Position ${asset.position}. NFL team ${asset.team || 'FA'}. Overall rank ${asset.rank}. Score ${asset.score}. Action ${asset.action}.`;
}
