import {
  commitIdempotentlyWithTransactionConfirmation,
  hashAssistantGmState,
  missingTransactionConfirmation,
  prepareTransactionConfirmation,
  type AssistantGmIdempotencyStore,
  type AssistantGmTransactionConfirmation
} from './transactionConfirmations';

type Relation<T> = T | T[] | null | undefined;
type Team = { display_name?: string | null; abbreviation?: string | null };
type Athlete = { display_name?: string; position?: string; real_teams?: Relation<Team> };

export type VoiceWaiverHold = { id: string; status: string; clears_at?: string | null; athlete_id?: string | null; real_team_id?: string | null; athletes?: Relation<Athlete>; real_teams?: Relation<Team> };
export type VoiceWaiverRosterAsset = { id: string; athlete_id?: string | null; real_team_id?: string | null; athletes?: Relation<Athlete>; real_teams?: Relation<Team> };
export type VoiceWaiverRules = { faabEnabled: boolean; faabBalance?: number | null; priorityModel: string };
export type VoiceWaiverProposal = {
  seasonFranchiseId: string;
  waiverHoldId: string;
  addAssetLabel: string;
  dropRosterEntryId: string | null;
  dropAssetLabel: string | null;
  faabBid: number | null;
  ruleContext: string;
};

type SupabaseRpcLike = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } | null }> };

function first<T>(value: Relation<T>): T | null {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function label(asset: VoiceWaiverHold | VoiceWaiverRosterAsset) {
  const athlete = first(asset.athletes);
  const team = first(asset.real_teams) ?? first(athlete?.real_teams);
  if (athlete) return `${athlete.display_name ?? 'Player'}${athlete.position ? `, ${athlete.position}` : ''}${team?.abbreviation ? `, ${team.abbreviation}` : ''}`;
  return `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`;
}

export function voiceWaiverStateHash(input: { holds: VoiceWaiverHold[]; roster: VoiceWaiverRosterAsset[]; rules: VoiceWaiverRules }) {
  return hashAssistantGmState({
    holds: input.holds.map((hold) => ({ id: hold.id, status: hold.status, clears_at: hold.clears_at ?? null, athlete_id: hold.athlete_id ?? null, real_team_id: hold.real_team_id ?? null })).sort((a, b) => a.id.localeCompare(b.id)),
    roster: input.roster.map((asset) => ({ id: asset.id, athlete_id: asset.athlete_id ?? null, real_team_id: asset.real_team_id ?? null })).sort((a, b) => a.id.localeCompare(b.id)),
    rules: input.rules
  });
}

export function prepareVoiceWaiverClaim(input: {
  userId: string;
  leagueId: string;
  seasonFranchiseId: string;
  addQuery: string;
  dropQuery?: string;
  rosterLimit: number;
  holds: VoiceWaiverHold[];
  roster: VoiceWaiverRosterAsset[];
  rules: VoiceWaiverRules;
  faabBid?: number | null;
  now?: Date;
}) {
  const addQuery = input.addQuery.trim().toLowerCase();
  const openMatches = input.holds.filter((hold) => hold.status === 'open' && label(hold).toLowerCase().includes(addQuery));
  if (!addQuery || !openMatches.length) return { ok: false as const, code: 'unavailable_player', message: `${input.addQuery || 'That player'} is not on the verified waiver wire. I will not substitute another player.` };
  if (openMatches.length > 1) return { ok: false as const, code: 'ambiguous_player', message: `That waiver request matched ${openMatches.length} available players. Choose the exact player before I prepare a claim.` };

  const rosterFull = input.roster.length >= input.rosterLimit;
  let drop: VoiceWaiverRosterAsset | null = null;
  if (rosterFull) {
    const dropQuery = input.dropQuery?.trim().toLowerCase() ?? '';
    if (!dropQuery) return { ok: false as const, code: 'drop_required', message: 'Your roster is full. Choose a verified roster player to drop before I prepare the waiver claim.' };
    const dropMatches = input.roster.filter((asset) => label(asset).toLowerCase().includes(dropQuery));
    if (!dropMatches.length) return { ok: false as const, code: 'drop_not_found', message: 'I could not find that drop player on your verified roster.' };
    if (dropMatches.length > 1) return { ok: false as const, code: 'ambiguous_drop', message: `That drop player matched ${dropMatches.length} roster assets. Choose the exact player before I prepare the waiver claim.` };
    drop = dropMatches[0];
  }

  let faabBid: number | null = input.rules.faabEnabled ? input.faabBid ?? null : null;
  if (input.rules.faabEnabled) {
    if (faabBid == null || !Number.isFinite(faabBid) || faabBid < 0) return { ok: false as const, code: 'invalid_faab', message: 'Enter a valid FAAB bid before I prepare the waiver claim.' };
    if (input.rules.faabBalance != null && faabBid > input.rules.faabBalance) return { ok: false as const, code: 'invalid_faab', message: `That FAAB bid exceeds your verified budget of ${input.rules.faabBalance}.` };
  }

  const hold = openMatches[0];
  const proposal: VoiceWaiverProposal = {
    seasonFranchiseId: input.seasonFranchiseId,
    waiverHoldId: hold.id,
    addAssetLabel: label(hold),
    dropRosterEntryId: drop?.id ?? null,
    dropAssetLabel: drop ? label(drop) : null,
    faabBid,
    ruleContext: input.rules.faabEnabled ? `FAAB bid ${faabBid}. Budget ${input.rules.faabBalance ?? 'not verified'}.` : input.rules.priorityModel
  };
  const confirmation = prepareTransactionConfirmation({
    userId: input.userId,
    leagueId: input.leagueId,
    actionType: 'waiver_claim',
    proposedChanges: proposal,
    stateVersionHash: voiceWaiverStateHash(input),
    now: input.now
  });

  return {
    ok: true as const,
    proposal,
    confirmation,
    spokenConfirmation: `Submit waiver claim for ${proposal.addAssetLabel}${proposal.dropAssetLabel ? ` and drop ${proposal.dropAssetLabel}` : ''}. ${proposal.ruleContext}. Confirm to submit this claim.`
  };
}

export async function commitVoiceWaiverClaim(input: {
  confirmation: AssistantGmTransactionConfirmation<VoiceWaiverProposal> | null | undefined;
  userId: string;
  leagueId: string;
  currentStateVersionHash: string;
  supabase: SupabaseRpcLike;
  idempotencyStore: AssistantGmIdempotencyStore<{ rpc: 'submit_waiver_claim'; data: unknown }>;
  now?: Date;
}) {
  if (!input.confirmation) return missingTransactionConfirmation();
  const proposal = input.confirmation.proposedChanges;
  return commitIdempotentlyWithTransactionConfirmation(input.confirmation, {
    userId: input.userId,
    leagueId: input.leagueId,
    actionType: 'waiver_claim',
    proposedChanges: proposal,
    stateVersionHash: input.currentStateVersionHash,
    staleReason: 'waiver_unavailable',
    now: input.now
  }, input.idempotencyStore, async () => {
    const { data, error } = await input.supabase.rpc('submit_waiver_claim', {
      p_waiver_hold_id: proposal.waiverHoldId,
      p_season_franchise_id: proposal.seasonFranchiseId,
      p_drop_roster_entry_id: proposal.dropRosterEntryId
    });
    if (error) throw new Error(error.message ?? 'Waiver claim failed');
    return { rpc: 'submit_waiver_claim' as const, data };
  });
}
