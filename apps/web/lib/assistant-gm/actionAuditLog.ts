import { randomUUID } from 'node:crypto';
import type { AssistantGmTransactionActionType } from './transactionConfirmations';

export type AssistantGmActionAuditEntry = {
  id: string;
  userId: string;
  leagueId: string;
  source: 'Assistant GM';
  requestedAction: string;
  actionType: AssistantGmTransactionActionType;
  preparedAction: unknown;
  confirmationTimestamp: string | null;
  commitResult: 'prepared' | 'committed' | 'failed' | 'rejected';
  failureReason: string | null;
  stateVersionHash: string | null;
  actionId: string | null;
  createdAt: string;
};

export type AssistantGmActionAuditStore = {
  append: (entry: AssistantGmActionAuditEntry) => Promise<void> | void;
};

type AuditInput = {
  userId: string;
  leagueId: string;
  requestedAction: string;
  actionType: AssistantGmTransactionActionType;
  preparedAction?: unknown;
  confirmationTimestamp?: string | null;
  commitResult: AssistantGmActionAuditEntry['commitResult'];
  failureReason?: string | null;
  stateVersionHash?: string | null;
  actionId?: string | null;
  now?: Date;
};

const rawAudioKeys = new Set(['audio', 'audioBlob', 'audioBuffer', 'audioBytes', 'rawAudio', 'rawVoiceAudio', 'microphoneStream']);

export function sanitizeAssistantGmAuditPayload(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeAssistantGmAuditPayload);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !rawAudioKeys.has(key))
      .map(([key, nested]) => [key, sanitizeAssistantGmAuditPayload(nested)])
  );
}

export function createAssistantGmActionAuditEntry(input: AuditInput): AssistantGmActionAuditEntry {
  return {
    id: randomUUID(),
    userId: input.userId,
    leagueId: input.leagueId,
    source: 'Assistant GM',
    requestedAction: input.requestedAction,
    actionType: input.actionType,
    preparedAction: sanitizeAssistantGmAuditPayload(input.preparedAction ?? null),
    confirmationTimestamp: input.confirmationTimestamp ?? null,
    commitResult: input.commitResult,
    failureReason: input.failureReason ?? null,
    stateVersionHash: input.stateVersionHash ?? null,
    actionId: input.actionId ?? null,
    createdAt: (input.now ?? new Date()).toISOString()
  };
}

export async function recordAssistantGmActionAudit(store: AssistantGmActionAuditStore, input: AuditInput) {
  const entry = createAssistantGmActionAuditEntry(input);
  await store.append(entry);
  return entry;
}

export function createMemoryAssistantGmActionAuditStore() {
  const entries: AssistantGmActionAuditEntry[] = [];
  return {
    entries,
    append: (entry: AssistantGmActionAuditEntry) => {
      entries.push(entry);
    }
  };
}
