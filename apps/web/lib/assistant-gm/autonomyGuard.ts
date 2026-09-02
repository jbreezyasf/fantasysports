import {
  validateTransactionConfirmation,
  type AssistantGmTransactionActionType,
  type AssistantGmTransactionConfirmation,
  type TransactionConfirmationValidationContext
} from './transactionConfirmations';

export type AssistantGmAutonomyActionType = AssistantGmTransactionActionType | 'roster_drop' | 'payment_action' | 'account_action';

export type UserOriginatedAssistantGmRequest = {
  requestId: string;
  userId: string;
  leagueId: string;
  source: 'voice' | 'text';
  requestedAction: string;
  createdAt: string;
};

export type AssistantGmAutonomyGuardResult =
  | { ok: true }
  | { ok: false; code: 'missing_user_request' | 'request_scope_mismatch' | 'unsupported_autonomy_action' | 'invalid_confirmation'; message: string };

const transactionActionTypes: AssistantGmTransactionActionType[] = [
  'lineup_set',
  'free_agent_claim',
  'waiver_claim',
  'waiver_withdraw',
  'draft_pick',
  'draft_queue',
  'trade_propose',
  'trade_resolve'
];

function isTransactionAction(actionType: AssistantGmAutonomyActionType): actionType is AssistantGmTransactionActionType {
  return transactionActionTypes.includes(actionType as AssistantGmTransactionActionType);
}

export function validateAssistantGmAutonomy<TChanges>(input: {
  actionType: AssistantGmAutonomyActionType;
  userRequest?: UserOriginatedAssistantGmRequest | null;
  confirmation?: AssistantGmTransactionConfirmation<TChanges> | null;
  confirmationContext?: TransactionConfirmationValidationContext<TChanges>;
}): AssistantGmAutonomyGuardResult {
  if (input.actionType === 'payment_action' || input.actionType === 'account_action') {
    return { ok: false, code: 'unsupported_autonomy_action', message: 'Assistant GM cannot perform payment or account actions.' };
  }
  if (input.actionType === 'roster_drop') {
    return { ok: false, code: 'unsupported_autonomy_action', message: 'Assistant GM cannot perform standalone roster drops in beta.' };
  }
  if (!isTransactionAction(input.actionType)) {
    return { ok: false, code: 'unsupported_autonomy_action', message: 'Assistant GM cannot perform that action in beta.' };
  }
  if (!input.userRequest) {
    return { ok: false, code: 'missing_user_request', message: 'Assistant GM cannot commit a transaction without a user-originated request.' };
  }
  if (!input.confirmationContext || input.userRequest.userId !== input.confirmationContext.userId || input.userRequest.leagueId !== input.confirmationContext.leagueId) {
    return { ok: false, code: 'request_scope_mismatch', message: 'Assistant GM request scope does not match this user and league.' };
  }
  const confirmation = validateTransactionConfirmation(input.confirmation, input.confirmationContext);
  if (!confirmation.ok) return { ok: false, code: 'invalid_confirmation', message: confirmation.message };
  return { ok: true };
}

export async function commitWithAssistantGmAutonomyGuard<TChanges, TResult>(input: {
  actionType: AssistantGmAutonomyActionType;
  userRequest?: UserOriginatedAssistantGmRequest | null;
  confirmation?: AssistantGmTransactionConfirmation<TChanges> | null;
  confirmationContext?: TransactionConfirmationValidationContext<TChanges>;
  commit: () => Promise<TResult> | TResult;
}) {
  const validation = validateAssistantGmAutonomy(input);
  if (!validation.ok) return validation;
  return { ok: true as const, result: await input.commit() };
}
