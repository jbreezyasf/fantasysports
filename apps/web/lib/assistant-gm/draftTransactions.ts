import {
  commitIdempotentlyWithTransactionConfirmation,
  hashAssistantGmState,
  missingTransactionConfirmation,
  prepareTransactionConfirmation,
  type AssistantGmIdempotencyStore,
  type AssistantGmTransactionConfirmation
} from './transactionConfirmations';

export type VoiceDraftCandidate = {
  assetType: 'athlete' | 'team';
  assetId: string;
  displayName: string;
  position?: string | null;
  team?: string | null;
  rank?: number | null;
};

export type VoiceDraftPickRow = {
  pick_number: number;
  season_franchise_id: string;
  picked_at?: string | null;
  athlete_id?: string | null;
  real_team_id?: string | null;
};

export type VoiceDraftState = {
  id: string;
  status: string;
  current_pick: number;
  picks: VoiceDraftPickRow[];
};

export type VoiceDraftProposal = {
  draftId: string;
  pickNumber: number;
  seasonFranchiseId: string;
  athleteId: string | null;
  realTeamId: string | null;
  assetLabel: string;
};

type SupabaseRpcLike = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } | null }> };

function candidateLabel(candidate: VoiceDraftCandidate) {
  if (candidate.assetType === 'team') return `${candidate.team ?? candidate.displayName} D/ST`;
  return `${candidate.displayName}${candidate.position ? `, ${candidate.position}` : ''}${candidate.team ? `, ${candidate.team}` : ''}`;
}

export function voiceDraftStateHash(input: { draft: VoiceDraftState; availablePlayers: VoiceDraftCandidate[] }) {
  return hashAssistantGmState({
    draft: { id: input.draft.id, status: input.draft.status, current_pick: input.draft.current_pick },
    picks: input.draft.picks.map((pick) => ({
      pick_number: pick.pick_number,
      season_franchise_id: pick.season_franchise_id,
      picked_at: pick.picked_at ?? null,
      athlete_id: pick.athlete_id ?? null,
      real_team_id: pick.real_team_id ?? null
    })).sort((a, b) => a.pick_number - b.pick_number),
    available: input.availablePlayers.map((candidate) => ({
      assetType: candidate.assetType,
      assetId: candidate.assetId,
      rank: candidate.rank ?? null
    })).sort((a, b) => `${a.assetType}:${a.assetId}`.localeCompare(`${b.assetType}:${b.assetId}`))
  });
}

export function prepareVoiceDraftPick(input: {
  userId: string;
  leagueId: string;
  requesterSeasonFranchiseId: string;
  playerQuery: string;
  draft: VoiceDraftState;
  availablePlayers: VoiceDraftCandidate[];
  now?: Date;
}) {
  if (input.draft.status !== 'live') return { ok: false as const, code: 'draft_not_live', message: 'The draft is not live right now.' };
  const currentPick = input.draft.picks.find((pick) => pick.pick_number === input.draft.current_pick);
  if (!currentPick) return { ok: false as const, code: 'stale_draft_state', message: 'I cannot verify the current pick. Refresh the draft state before selecting.' };
  if (currentPick.season_franchise_id !== input.requesterSeasonFranchiseId) {
    return { ok: false as const, code: 'not_on_clock', message: 'You are not on the clock, so I cannot prepare a draft pick.' };
  }

  const query = input.playerQuery.trim().toLowerCase();
  const matches = input.availablePlayers.filter((candidate) => candidateLabel(candidate).toLowerCase().includes(query));
  if (!query || !matches.length) return { ok: false as const, code: 'unavailable_player', message: `${input.playerQuery || 'That player'} is not in the verified available draft pool. I will not substitute another player.` };
  if (matches.length > 1) return { ok: false as const, code: 'ambiguous_player', message: `That draft request matched ${matches.length} available players. Choose the exact player before I prepare a pick.` };

  const selected = matches[0];
  const proposal: VoiceDraftProposal = {
    draftId: input.draft.id,
    pickNumber: currentPick.pick_number,
    seasonFranchiseId: currentPick.season_franchise_id,
    athleteId: selected.assetType === 'athlete' ? selected.assetId : null,
    realTeamId: selected.assetType === 'team' ? selected.assetId : null,
    assetLabel: candidateLabel(selected)
  };
  const confirmation = prepareTransactionConfirmation({
    userId: input.userId,
    leagueId: input.leagueId,
    actionType: 'draft_pick',
    proposedChanges: proposal,
    stateVersionHash: voiceDraftStateHash(input),
    now: input.now
  });

  return {
    ok: true as const,
    proposal,
    confirmation,
    spokenConfirmation: `Draft ${proposal.assetLabel} with pick ${proposal.pickNumber}. Confirm to submit this pick.`
  };
}

export async function commitVoiceDraftPick(input: {
  confirmation: AssistantGmTransactionConfirmation<VoiceDraftProposal> | null | undefined;
  userId: string;
  leagueId: string;
  currentStateVersionHash: string;
  supabase: SupabaseRpcLike;
  idempotencyStore: AssistantGmIdempotencyStore<{ rpc: 'make_draft_pick'; data: unknown }>;
  now?: Date;
}) {
  if (!input.confirmation) return missingTransactionConfirmation();
  const proposal = input.confirmation.proposedChanges;
  return commitIdempotentlyWithTransactionConfirmation(input.confirmation, {
    userId: input.userId,
    leagueId: input.leagueId,
    actionType: 'draft_pick',
    proposedChanges: proposal,
    stateVersionHash: input.currentStateVersionHash,
    staleReason: 'player_drafted',
    now: input.now
  }, input.idempotencyStore, async () => {
    const { data, error } = await input.supabase.rpc('make_draft_pick', {
      p_draft_id: proposal.draftId,
      p_athlete_id: proposal.athleteId,
      p_real_team_id: proposal.realTeamId,
      p_auto: false
    });
    if (error) throw new Error(error.message ?? 'Draft pick failed');
    return { rpc: 'make_draft_pick' as const, data };
  });
}
