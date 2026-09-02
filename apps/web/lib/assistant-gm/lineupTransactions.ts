import {
  commitIdempotentlyWithTransactionConfirmation,
  hashAssistantGmState,
  missingTransactionConfirmation,
  prepareTransactionConfirmation,
  type AssistantGmIdempotencyStore,
  type AssistantGmTransactionConfirmation
} from './transactionConfirmations';

type Relation<T> = T | T[] | null | undefined;
type RealTeam = { display_name?: string | null; abbreviation?: string | null };
type Athlete = { display_name?: string; position?: string; real_teams?: Relation<RealTeam> };
export type VoiceLineupRosterAsset = { id: string; athlete_id?: string | null; real_team_id?: string | null; athletes?: Relation<Athlete>; real_teams?: Relation<RealTeam> };
export type VoiceLineupSlot = { slot: string; slot_index: number; athlete_id?: string | null; real_team_id?: string | null; athletes?: Relation<Athlete>; real_teams?: Relation<RealTeam> };
export type VoiceLineupProposal = {
  seasonFranchiseId: string;
  week: number;
  slot: string;
  slotIndex: number;
  athleteId: string | null;
  realTeamId: string | null;
  assetLabel: string;
  targetSlotLabel: string;
  replacedAssetLabel: string | null;
};

type SupabaseRpcLike = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } | null }> };

const slotLabels: Record<string, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLEX', K: 'K', DST: 'D/ST' };

function first<T>(value: Relation<T>): T | null {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function athlete(asset: VoiceLineupRosterAsset | VoiceLineupSlot) {
  return first(asset.athletes);
}

function team(asset: VoiceLineupRosterAsset | VoiceLineupSlot) {
  return first(asset.real_teams) ?? first(athlete(asset)?.real_teams);
}

function assetPosition(asset: VoiceLineupRosterAsset | VoiceLineupSlot) {
  return asset.real_team_id ? 'DST' : athlete(asset)?.position?.toUpperCase() ?? '';
}

export function voiceLineupAssetLabel(asset: VoiceLineupRosterAsset | VoiceLineupSlot) {
  const player = athlete(asset);
  if (player) return `${player.display_name ?? 'Player'}${player.position ? `, ${player.position}` : ''}${team(asset)?.abbreviation ? `, ${team(asset)?.abbreviation}` : ''}`;
  return `${team(asset)?.abbreviation ?? team(asset)?.display_name ?? 'Team'} D/ST`;
}

export function normalizeLineupSlot(input: string) {
  const clean = input.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (clean === 'DST' || clean === 'DEF' || clean === 'DEFENSE') return 'DST';
  return clean;
}

export function isLegalLineupDestination(position: string, slot: string) {
  if (slot === 'FLEX') return ['RB', 'WR', 'TE'].includes(position);
  return position === slot;
}

export function voiceLineupStateHash(input: { roster: VoiceLineupRosterAsset[]; lineup: VoiceLineupSlot[] }) {
  return hashAssistantGmState({
    roster: input.roster.map((asset) => ({ id: asset.id, athlete_id: asset.athlete_id ?? null, real_team_id: asset.real_team_id ?? null, position: assetPosition(asset) })).sort((a, b) => a.id.localeCompare(b.id)),
    lineup: input.lineup.map((slot) => ({ slot: slot.slot, slot_index: slot.slot_index, athlete_id: slot.athlete_id ?? null, real_team_id: slot.real_team_id ?? null })).sort((a, b) => `${a.slot}:${a.slot_index}`.localeCompare(`${b.slot}:${b.slot_index}`))
  });
}

export function prepareVoiceLineupMove(input: {
  userId: string;
  leagueId: string;
  seasonFranchiseId: string;
  week: number;
  playerQuery: string;
  targetSlot: string;
  targetSlotIndex?: number;
  roster: VoiceLineupRosterAsset[];
  lineup: VoiceLineupSlot[];
  now?: Date;
}) {
  const query = input.playerQuery.trim().toLowerCase();
  const matches = input.roster.filter((asset) => voiceLineupAssetLabel(asset).toLowerCase().includes(query));
  if (!query || matches.length === 0) return { ok: false as const, code: 'not_found', message: 'I could not find that player on your verified roster.' };
  if (matches.length > 1) return { ok: false as const, code: 'ambiguous_player', message: `That player name matched ${matches.length} roster assets. Choose the exact player before I prepare a lineup move.` };

  const asset = matches[0];
  const slot = normalizeLineupSlot(input.targetSlot);
  const slotIndex = input.targetSlotIndex ?? 1;
  const position = assetPosition(asset);
  if (!isLegalLineupDestination(position, slot)) {
    return { ok: false as const, code: 'invalid_move', message: `${voiceLineupAssetLabel(asset)} is not eligible for ${slotLabels[slot] ?? slot}.` };
  }

  const current = input.lineup.find((item) => item.slot === slot && item.slot_index === slotIndex) ?? null;
  const proposal: VoiceLineupProposal = {
    seasonFranchiseId: input.seasonFranchiseId,
    week: input.week,
    slot,
    slotIndex,
    athleteId: asset.athlete_id ?? null,
    realTeamId: asset.real_team_id ?? null,
    assetLabel: voiceLineupAssetLabel(asset),
    targetSlotLabel: `${slotLabels[slot] ?? slot}${slotIndex > 1 ? slotIndex : ''}`,
    replacedAssetLabel: current ? voiceLineupAssetLabel(current) : null
  };
  const confirmation = prepareTransactionConfirmation({
    userId: input.userId,
    leagueId: input.leagueId,
    actionType: 'lineup_set',
    proposedChanges: proposal,
    stateVersionHash: voiceLineupStateHash(input),
    now: input.now
  });

  return {
    ok: true as const,
    proposal,
    confirmation,
    spokenConfirmation: `${proposal.assetLabel} will move to ${proposal.targetSlotLabel} for week ${proposal.week}${proposal.replacedAssetLabel ? `, replacing ${proposal.replacedAssetLabel}` : ''}. Confirm to submit this lineup move.`
  };
}

export async function commitVoiceLineupMove(input: {
  confirmation: AssistantGmTransactionConfirmation<VoiceLineupProposal> | null | undefined;
  userId: string;
  leagueId: string;
  currentStateVersionHash: string;
  supabase: SupabaseRpcLike;
  idempotencyStore: AssistantGmIdempotencyStore<{ rpc: 'set_lineup_slot'; data: unknown }>;
  now?: Date;
}) {
  if (!input.confirmation) return missingTransactionConfirmation();
  const proposal = input.confirmation.proposedChanges;
  return commitIdempotentlyWithTransactionConfirmation(input.confirmation, {
    userId: input.userId,
    leagueId: input.leagueId,
    actionType: 'lineup_set',
    proposedChanges: proposal,
    stateVersionHash: input.currentStateVersionHash,
    staleReason: 'lineup_eligibility_changed',
    now: input.now
  }, input.idempotencyStore, async () => {
    const { data, error } = await input.supabase.rpc('set_lineup_slot', {
      p_season_franchise_id: proposal.seasonFranchiseId,
      p_week: proposal.week,
      p_slot: proposal.slot,
      p_slot_index: proposal.slotIndex,
      p_athlete_id: proposal.athleteId,
      p_real_team_id: proposal.realTeamId
    });
    if (error) throw new Error(error.message ?? 'Lineup transaction failed');
    return { rpc: 'set_lineup_slot' as const, data };
  });
}
