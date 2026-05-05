import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { v4 as uuid } from 'uuid';
import type { AgentSession, AgentUsageDashboard, AgentUsageRecord, MessageTokenUsage } from '@agent-spaces/shared';
import { getDataDir, ensureDir } from './json-store.js';
import { listModels } from './llm-store.js';

export interface CompleteAgentUsageInput {
  runtime?: string;
  model?: string;
  summary?: string;
  output?: string[];
  durationMs?: number;
  usage?: MessageTokenUsage;
}

interface AgentUsageInsert {
  session: AgentSession;
  runtime?: string;
  model?: string;
  summary?: string;
  durationMs?: number;
  usage: MessageTokenUsage;
}

let db: DatabaseSync | null = null;

function openDb(): DatabaseSync {
  if (db) return db;
  ensureDir(agentsDir());
  db = new DatabaseSync(join(agentsDir(), 'agents.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      agent_config_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      current_task_id TEXT,
      process_id INTEGER,
      started_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace ON agent_sessions(workspace_id, last_activity_at DESC);

    CREATE TABLE IF NOT EXISTS agent_usage (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      agent_session_id TEXT NOT NULL,
      agent_config_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      runtime TEXT,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      input_cost_usd REAL NOT NULL DEFAULT 0,
      output_cost_usd REAL NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      summary TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      duration_ms INTEGER,
      UNIQUE(agent_session_id, completed_at)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_usage_completed ON agent_usage(completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_usage_workspace_completed ON agent_usage(workspace_id, completed_at DESC);
  `);
  return db;
}

function agentsDir(): string {
  return join(getDataDir(), 'agents');
}

export function listAgentSessions(workspaceId: string): AgentSession[] {
  const database = openDb();
  const rows = database.prepare(`
    SELECT * FROM agent_sessions
    WHERE workspace_id = ?
    ORDER BY last_activity_at DESC
  `).all(workspaceId);
  return rows.map(mapSessionRow);
}

export function getAgentSession(workspaceId: string, sessionId: string): AgentSession | null {
  const database = openDb();
  const row = database.prepare(`
    SELECT * FROM agent_sessions
    WHERE workspace_id = ? AND id = ?
  `).get(workspaceId, sessionId);
  if (row) return mapSessionRow(row);
  return null;
}

export function createAgentSession(session: AgentSession): void {
  const database = openDb();
  insertSession(database, session);
}

export function updateAgentSession(session: AgentSession): void {
  const database = openDb();
  insertSession(database, session);
}

export function deleteAgentSession(workspaceId: string, sessionId: string): void {
  const database = openDb();
  database.prepare('DELETE FROM agent_usage WHERE workspace_id = ? AND agent_session_id = ?').run(workspaceId, sessionId);
  database.prepare('DELETE FROM agent_sessions WHERE workspace_id = ? AND id = ?').run(workspaceId, sessionId);
}

export function recordAgentUsage(input: AgentUsageInsert): AgentUsageRecord {
  const database = openDb();
  const completedAt = input.session.lastActivityAt || new Date().toISOString();
  const inputTokens = toCount(input.usage.inputTokens);
  const outputTokens = toCount(input.usage.outputTokens);
  const cachedInputTokens = toCount(input.usage.cachedInputTokens);
  const reasoningTokens = toCount(input.usage.reasoningTokens);
  const totalTokens = toCount(input.usage.totalTokens) || inputTokens + outputTokens + cachedInputTokens + reasoningTokens;
  const cost = estimateCost(input.model, inputTokens + cachedInputTokens, outputTokens + reasoningTokens);
  const record: AgentUsageRecord = {
    id: uuid(),
    workspaceId: input.session.workspaceId,
    agentSessionId: input.session.id,
    agentConfigId: input.session.agentConfigId,
    role: input.session.role,
    status: input.session.status,
    runtime: input.runtime,
    model: input.model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens,
    inputCostUsd: cost.inputCostUsd,
    outputCostUsd: cost.outputCostUsd,
    totalCostUsd: cost.totalCostUsd,
    summary: input.summary,
    error: input.session.error,
    startedAt: input.session.startedAt,
    completedAt,
    durationMs: input.durationMs,
  };

  database.prepare(`
    INSERT INTO agent_usage (
      id, workspace_id, agent_session_id, agent_config_id, role, status, runtime, model,
      input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, total_tokens,
      input_cost_usd, output_cost_usd, total_cost_usd, summary, error, started_at, completed_at, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.workspaceId,
    record.agentSessionId,
    record.agentConfigId,
    record.role,
    record.status,
    record.runtime ?? null,
    record.model ?? null,
    record.inputTokens,
    record.outputTokens,
    record.cachedInputTokens,
    record.reasoningTokens,
    record.totalTokens,
    record.inputCostUsd,
    record.outputCostUsd,
    record.totalCostUsd,
    record.summary ?? null,
    record.error ?? null,
    record.startedAt,
    record.completedAt,
    record.durationMs ?? null,
  );
  return record;
}

export function getAgentUsageDashboard(days = 30): AgentUsageDashboard {
  const database = openDb();
  const since = new Date(Date.now() - Math.max(days - 1, 0) * 86_400_000);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const records = database.prepare(`
    SELECT * FROM agent_usage
    WHERE completed_at >= ?
    ORDER BY completed_at DESC
  `).all(sinceIso).map(mapUsageRow);

  const dailyMap = new Map<string, AgentUsageDashboard['daily'][number]>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    dailyMap.set(key, {
      date: key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });
  }

  const modelMap = new Map<string, AgentUsageDashboard['byModel'][number]>();
  let durationTotal = 0;
  let durationCount = 0;
  for (const record of records) {
    const day = dailyMap.get(record.completedAt.slice(0, 10));
    if (day) {
      day.inputTokens += record.inputTokens + record.cachedInputTokens;
      day.outputTokens += record.outputTokens + record.reasoningTokens;
      day.totalTokens += record.totalTokens;
      day.costUsd += record.totalCostUsd;
    }

    const model = record.model || 'Unknown model';
    const modelItem = modelMap.get(model) ?? {
      model,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
    modelItem.requests += 1;
    modelItem.inputTokens += record.inputTokens + record.cachedInputTokens;
    modelItem.outputTokens += record.outputTokens + record.reasoningTokens;
    modelItem.totalTokens += record.totalTokens;
    modelItem.costUsd += record.totalCostUsd;
    modelMap.set(model, modelItem);

    if (typeof record.durationMs === 'number' && Number.isFinite(record.durationMs)) {
      durationTotal += record.durationMs;
      durationCount += 1;
    }
  }

  const totals = records.reduce(
    (acc, record) => {
      acc.requests += 1;
      acc.inputTokens += record.inputTokens + record.cachedInputTokens;
      acc.outputTokens += record.outputTokens + record.reasoningTokens;
      acc.totalTokens += record.totalTokens;
      acc.totalCostUsd += record.totalCostUsd;
      return acc;
    },
    { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCostUsd: 0, avgDurationMs: 0 },
  );
  totals.avgDurationMs = durationCount ? Math.round(durationTotal / durationCount) : 0;

  return {
    periodLabel: `${days} days`,
    totals,
    daily: Array.from(dailyMap.values()),
    byModel: Array.from(modelMap.values()).sort((a, b) => b.costUsd - a.costUsd).slice(0, 5),
    recent: records.slice(0, 6),
  };
}

function insertSession(database: DatabaseSync, session: AgentSession): void {
  database.prepare(`
    INSERT INTO agent_sessions (
      id, workspace_id, agent_config_id, role, status, current_task_id,
      process_id, started_at, last_activity_at, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      agent_config_id = excluded.agent_config_id,
      role = excluded.role,
      status = excluded.status,
      current_task_id = excluded.current_task_id,
      process_id = excluded.process_id,
      started_at = excluded.started_at,
      last_activity_at = excluded.last_activity_at,
      error = excluded.error
  `).run(
    session.id,
    session.workspaceId,
    session.agentConfigId,
    session.role,
    session.status,
    session.currentTaskId ?? null,
    session.processId ?? null,
    session.startedAt,
    session.lastActivityAt,
    session.error ?? null,
  );
}

function mapSessionRow(row: Record<string, unknown>): AgentSession {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    agentConfigId: String(row.agent_config_id),
    role: row.role as AgentSession['role'],
    status: row.status as AgentSession['status'],
    currentTaskId: typeof row.current_task_id === 'string' ? row.current_task_id : undefined,
    processId: typeof row.process_id === 'number' ? row.process_id : undefined,
    startedAt: String(row.started_at),
    lastActivityAt: String(row.last_activity_at),
    error: typeof row.error === 'string' ? row.error : undefined,
  };
}

function mapUsageRow(row: Record<string, unknown>): AgentUsageRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    agentSessionId: String(row.agent_session_id),
    agentConfigId: String(row.agent_config_id),
    role: row.role as AgentUsageRecord['role'],
    status: row.status as AgentUsageRecord['status'],
    runtime: typeof row.runtime === 'string' ? row.runtime : undefined,
    model: typeof row.model === 'string' ? row.model : undefined,
    inputTokens: toCount(row.input_tokens),
    outputTokens: toCount(row.output_tokens),
    cachedInputTokens: toCount(row.cached_input_tokens),
    reasoningTokens: toCount(row.reasoning_tokens),
    totalTokens: toCount(row.total_tokens),
    inputCostUsd: toMoney(row.input_cost_usd),
    outputCostUsd: toMoney(row.output_cost_usd),
    totalCostUsd: toMoney(row.total_cost_usd),
    summary: typeof row.summary === 'string' ? row.summary : undefined,
    error: typeof row.error === 'string' ? row.error : undefined,
    startedAt: String(row.started_at),
    completedAt: String(row.completed_at),
    durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : undefined,
  };
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function toMoney(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function estimateCost(model: string | undefined, inputTokens: number, outputTokens: number) {
  const prices = getModelPrices(model);
  const inputCostUsd = (inputTokens / 1_000_000) * prices.inputPerMillion;
  const outputCostUsd = (outputTokens / 1_000_000) * prices.outputPerMillion;
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}

function getModelPrices(model: string | undefined): { inputPerMillion: number; outputPerMillion: number } {
  const configured = findConfiguredModelCost(model);
  if (configured) return configured;

  const normalized = (model || '').toLowerCase();
  if (normalized.includes('gpt-4o-mini')) return { inputPerMillion: 0.15, outputPerMillion: 0.6 };
  if (normalized.includes('gpt-4o')) return { inputPerMillion: 2.5, outputPerMillion: 10 };
  if (normalized.includes('gpt-5-mini')) return { inputPerMillion: 0.25, outputPerMillion: 2 };
  if (normalized.includes('gpt-5')) return { inputPerMillion: 1.25, outputPerMillion: 10 };
  if (normalized.includes('sonnet')) return { inputPerMillion: 3, outputPerMillion: 15 };
  if (normalized.includes('haiku')) return { inputPerMillion: 0.8, outputPerMillion: 4 };
  if (normalized.includes('opus')) return { inputPerMillion: 15, outputPerMillion: 75 };
  if (normalized.includes('gemini')) return { inputPerMillion: 1.25, outputPerMillion: 5 };
  return { inputPerMillion: 1, outputPerMillion: 3 };
}

function findConfiguredModelCost(model: string | undefined): { inputPerMillion: number; outputPerMillion: number } | null {
  if (!model) return null;
  const configured = listModels().find((item) => item.modelId === model || item.name === model);
  if (!configured?.cost) return null;
  return {
    inputPerMillion: toMoney(configured.cost.inputPerMillion),
    outputPerMillion: toMoney(configured.cost.outputPerMillion),
  };
}
