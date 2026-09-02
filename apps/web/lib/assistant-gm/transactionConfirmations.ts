import { createHash, randomUUID } from 'node:crypto';

export type AssistantGmTransactionActionType =
  | 'lineup_set'
  | 'free_agent_claim'
  | 'waiver_claim'
  | 'waiver_withdraw'
  | 'draft_pick'
  | 'draft_queue'
  | 'trade_propose'
  | 'trade_resolve';

export type AssistantGmTransactionConfirmation<TChanges = unknown> = {
  actionId: string;
  userId: string;
  leagueId: string;
  actionType: AssistantGmTransactionActionType;
  proposedChanges: TChanges;
  stateVersionHash: string;
  proposalHash: string;
  createdAt: string;
  expiresAt: string;
};

export type AssistantGmStaleStateReason =
  | 'player_drafted'
  | 'waiver_unavailable'
  | 'lineup_eligibility_changed'
  | 'faab_changed'
  | 'roster_changed'
  | 'state_changed';

export type TransactionConfirmationValidationContext<TChanges = unknown> = {
  userId: string;
  leagueId: string;
  actionType: AssistantGmTransactionActionType;
  proposedChanges: TChanges;
  stateVersionHash: string;
  staleReason?: AssistantGmStaleStateReason;
  now?: Date;
};

export type TransactionConfirmationValidationResult =
  | { ok: true }
  | { ok: false; code: 'missing_confirmation' | 'expired' | 'scope_mismatch' | 'proposal_changed' | 'invalid_confirmation'; message: string };

type TransactionConfirmationValidationErrorCode = Extract<TransactionConfirmationValidationResult, { ok: false }>['code'];

export type TransactionConfirmationCommitResult<TResult> =
  | { ok: true; actionId: string; result: TResult; duplicate?: boolean }
  | { ok: false; actionId?: string; code: TransactionConfirmationValidationErrorCode; message: string };

export type AssistantGmIdempotencyRecord<TResult = unknown> = {
  actionId: string;
  result: TResult;
  committedAt: string;
};

export type AssistantGmIdempotencyStore<TResult = unknown> = {
  get: (actionId: string) => Promise<AssistantGmIdempotencyRecord<TResult> | null> | AssistantGmIdempotencyRecord<TResult> | null;
  save: (record: AssistantGmIdempotencyRecord<TResult>) => Promise<void> | void;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const staleStateMessages: Record<AssistantGmStaleStateReason, string> = {
  player_drafted: 'That player has already been drafted. I will not substitute another player automatically.',
  waiver_unavailable: 'That player is no longer available on waivers. I will not substitute another player automatically.',
  lineup_eligibility_changed: 'Lineup eligibility changed after confirmation. Review the lineup before submitting again.',
  faab_changed: 'Your waiver budget changed after confirmation. Review the claim before submitting again.',
  roster_changed: 'Your roster changed after confirmation. Review the transaction before submitting again.',
  state_changed: 'League state changed after confirmation. Review the action again before submitting.'
};

export function missingTransactionConfirmation<TResult>(): TransactionConfirmationCommitResult<TResult> {
  return { ok: false, code: 'missing_confirmation', message: 'Confirm this Assistant GM action before submitting it.' };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export function hashAssistantGmState(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function hashTransactionProposal(input: { actionType: AssistantGmTransactionActionType; proposedChanges: unknown; stateVersionHash: string }) {
  return createHash('sha256')
    .update(stableJson({
      actionType: input.actionType,
      proposedChanges: input.proposedChanges,
      stateVersionHash: input.stateVersionHash
    }))
    .digest('hex');
}

export function prepareTransactionConfirmation<TChanges>(input: {
  userId: string;
  leagueId: string;
  actionType: AssistantGmTransactionActionType;
  proposedChanges: TChanges;
  stateVersionHash: string;
  now?: Date;
  ttlMs?: number;
}): AssistantGmTransactionConfirmation<TChanges> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS));
  return {
    actionId: randomUUID(),
    userId: input.userId,
    leagueId: input.leagueId,
    actionType: input.actionType,
    proposedChanges: input.proposedChanges,
    stateVersionHash: input.stateVersionHash,
    proposalHash: hashTransactionProposal(input),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

export function validateTransactionConfirmation<TChanges>(
  confirmation: AssistantGmTransactionConfirmation<TChanges> | null | undefined,
  context: TransactionConfirmationValidationContext<TChanges>
): TransactionConfirmationValidationResult {
  if (!confirmation) return { ok: false, code: 'missing_confirmation', message: 'Confirm this Assistant GM action before submitting it.' };
  if (!confirmation.actionId || !confirmation.createdAt || !confirmation.expiresAt || !confirmation.proposalHash) {
    return { ok: false, code: 'invalid_confirmation', message: 'The Assistant GM confirmation is incomplete. Review the action again.' };
  }

  const createdAt = Date.parse(confirmation.createdAt);
  const expiresAt = Date.parse(confirmation.expiresAt);
  const now = context.now ?? new Date();
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    return { ok: false, code: 'invalid_confirmation', message: 'The Assistant GM confirmation timing is invalid. Review the action again.' };
  }
  if (now.getTime() > expiresAt) {
    return { ok: false, code: 'expired', message: 'That Assistant GM confirmation expired. Review the current state and confirm again.' };
  }

  if (confirmation.userId !== context.userId || confirmation.leagueId !== context.leagueId || confirmation.actionType !== context.actionType) {
    return { ok: false, code: 'scope_mismatch', message: 'That Assistant GM confirmation is not valid for this user, league, or action.' };
  }

  if (confirmation.stateVersionHash !== context.stateVersionHash) {
    return { ok: false, code: 'proposal_changed', message: staleStateMessages[context.staleReason ?? 'state_changed'] };
  }

  const expectedHash = hashTransactionProposal({
    actionType: context.actionType,
    proposedChanges: context.proposedChanges,
    stateVersionHash: context.stateVersionHash
  });
  if (confirmation.proposalHash !== expectedHash || stableJson(confirmation.proposedChanges) !== stableJson(context.proposedChanges)) {
    return { ok: false, code: 'proposal_changed', message: 'The proposed Assistant GM transaction changed. Confirm the revised action before submitting.' };
  }

  return { ok: true };
}

export async function commitWithTransactionConfirmation<TChanges, TResult>(
  confirmation: AssistantGmTransactionConfirmation<TChanges> | null | undefined,
  context: TransactionConfirmationValidationContext<TChanges>,
  commit: (confirmation: AssistantGmTransactionConfirmation<TChanges>) => Promise<TResult> | TResult
): Promise<TransactionConfirmationCommitResult<TResult>> {
  if (!confirmation) return missingTransactionConfirmation();
  const validation = validateTransactionConfirmation(confirmation, context);
  if (!validation.ok) return { ok: false, actionId: confirmation.actionId, code: validation.code, message: validation.message };
  return { ok: true, actionId: confirmation.actionId, result: await commit(confirmation) };
}

export function createMemoryAssistantGmIdempotencyStore<TResult = unknown>(): AssistantGmIdempotencyStore<TResult> {
  const records = new Map<string, AssistantGmIdempotencyRecord<TResult>>();
  return {
    get: (actionId) => records.get(actionId) ?? null,
    save: (record) => {
      if (!records.has(record.actionId)) records.set(record.actionId, record);
    }
  };
}

export async function commitIdempotentlyWithTransactionConfirmation<TChanges, TResult>(
  confirmation: AssistantGmTransactionConfirmation<TChanges> | null | undefined,
  context: TransactionConfirmationValidationContext<TChanges>,
  store: AssistantGmIdempotencyStore<TResult>,
  commit: (confirmation: AssistantGmTransactionConfirmation<TChanges>) => Promise<TResult> | TResult
): Promise<TransactionConfirmationCommitResult<TResult>> {
  if (!confirmation) return missingTransactionConfirmation();
  const validation = validateTransactionConfirmation(confirmation, context);
  if (!validation.ok) return { ok: false, actionId: confirmation.actionId, code: validation.code, message: validation.message };

  const prior = await store.get(confirmation.actionId);
  if (prior) return { ok: true, actionId: confirmation.actionId, result: prior.result, duplicate: true };

  const result = await commit(confirmation);
  await store.save({ actionId: confirmation.actionId, result, committedAt: (context.now ?? new Date()).toISOString() });
  return { ok: true, actionId: confirmation.actionId, result, duplicate: false };
}
