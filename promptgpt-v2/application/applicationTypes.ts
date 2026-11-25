import type { AdvancedDiagnosticReport } from '../style/diagnosticsTypes';

export interface PromptResultHistoryEntry {
  id: string;
  createdAt: string;
  prompt: string;
  resultText: string;
  sourceText?: string;
  model?: string;
  provider?: string;
  durationMs?: number;
  stageDurationsMs?: Record<string, number>;
  metrics?: Record<string, number | string | boolean | null>;
  diagnostics?: AdvancedDiagnosticReport | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TransferTraceEvent {
  id?: string;
  stage: string;
  timestamp?: string;
  elapsedMs?: number;
  durationMs?: number;
  model?: string;
  status?: 'start' | 'success' | 'warn' | 'error' | 'retry' | 'fallback' | string;
  message?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface StagePromptRecord {
  id?: string;
  stage: string;
  createdAt: string;
  prompt?: string;
  systemPrompt?: string;
  userPrompt?: string;
  responseText?: string;
  model?: string;
  attempt?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface CandidateOutcome<T = unknown> {
  ok?: boolean;
  candidate?: T;
  text?: string;
  score?: number;
  model?: string;
  attempt?: number;
  durationMs?: number;
  reason?: string;
  error?: string;
  diagnostics?: AdvancedDiagnosticReport | Record<string, unknown>;
  stageRecords?: StagePromptRecord[];
  trace?: TransferTraceEvent[];
  metadata?: Record<string, unknown>;
}

export interface StyleTransferResult {
  resultText: string;
  sourceText?: string;
  durationMs?: number;
  stageDurationsMs?: Record<string, number>;
  trace?: TransferTraceEvent[];
  stageRecords?: StagePromptRecord[];
  candidates?: CandidateOutcome[];
  diagnostics?: AdvancedDiagnosticReport | Record<string, unknown>;
  historyEntry?: PromptResultHistoryEntry;
  metadata?: Record<string, unknown>;
}
