import { BUILT_IN_AGENT_TOOLS, getNodesForExecutionScope, type BuiltInAgentToolName, type ExecutionLog, type Workflow } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import type { ExecutionManager } from '../execution-manager.js';
import { listAvailableAgentCapabilities } from '../agent-capability-catalog.js';
import * as agentService from '../agent.js';
import * as workflowService from '../workflow.js';

type JsonRecord = Record<string, unknown>;

let workflowExecutionManager: ExecutionManager | null = null;

const DEFAULT_SYNC_TIMEOUT_MS = 120_000;
const MAX_SYNC_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 500;

const pagingInputSchema = schema({
  page: { type: 'number', description: 'Page number, starting from 1. Defaults to 1.' },
  page_size: { type: 'number', description: 'Page size. Defaults to 10, max 50.' },
});

const executeWorkflowInputSchema = schema({
  workflow_id: { type: 'string', description: 'Workflow ID. workflowId is also accepted.' },
  workflowId: { type: 'string', description: 'Workflow ID alias.' },
  input: { type: 'object', description: 'Workflow input object.', properties: {} },
  start_node_id: { type: 'string', description: 'Optional start node ID when the workflow has multiple start nodes.' },
  startNodeId: { type: 'string', description: 'Start node ID alias.' },
  max_wait_ms: { type: 'number', description: `Sync execution wait timeout. Defaults to ${DEFAULT_SYNC_TIMEOUT_MS}, max ${MAX_SYNC_TIMEOUT_MS}.` },
});

const listAgentCapabilitiesInputSchema = schema({
  agent_ids: {
    type: 'array',
    description: 'Optional agent preset IDs to filter. Defaults to all enabled agent presets.',
    items: { type: 'string' },
  },
  include_disabled: {
    type: 'boolean',
    description: 'Whether to include disabled agent presets. Defaults to false.',
  },
});

export function setWorkflowExecutionManager(manager: ExecutionManager): void {
  workflowExecutionManager = manager;
}

export function createWorkflowExecutionFunctionTools(workspaceId = '', allowedTools?: BuiltInAgentToolName[]): AgentFunctionTool[] {
  const allowedToolNames = getAllowedWorkflowToolNames(allowedTools);
  const tools: AgentFunctionTool[] = [
    {
      name: 'list_available_agent_capabilities',
      description: 'List all available MCP servers, skills, and built-in tools in the current environment. Use this before assigning mcps/tools/skills to agent nodes.',
      inputSchema: schema({}),
      annotations: { readOnly: true, openWorld: false },
      execute: async () => ({
        success: true,
        data: listAvailableAgentCapabilities(),
      }),
    },
    {
      name: 'list_agent_capabilities',
      description: 'List agent presets with their configured MCP servers, skills, tools, model fields, and descriptions. Use this before designing multi-agent workflows so you can assign capabilities by role.',
      inputSchema: listAgentCapabilitiesInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => listAgentCapabilities(workspaceId, input),
    },
    {
      name: 'list_workflows',
      description: 'List saved workflows, newest updated first. Returns workflow IDs, descriptions, start nodes, and input fields.',
      inputSchema: pagingInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => listWorkflows(input),
    },
    {
      name: 'search_workflow',
      description: 'Search saved workflows by keyword in workflow name or description.',
      inputSchema: schema({
        keyword: { type: 'string', description: 'Keyword to search in workflow name and description.' },
        page: { type: 'number', description: 'Page number, starting from 1. Defaults to 1.' },
        page_size: { type: 'number', description: 'Page size. Defaults to 10, max 50.' },
      }, ['keyword']),
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => searchWorkflow(input),
    },
    {
      name: 'execute_workflow_sync',
      description: 'Start a workflow and wait until it completes, errors, pauses, or reaches max_wait_ms. Returns execution steps.',
      inputSchema: executeWorkflowInputSchema,
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => executeWorkflowSync(input),
    },
    {
      name: 'execute_workflow_async',
      description: 'Start a workflow without waiting for completion. Use get_workflow_result with the returned executionId.',
      inputSchema: executeWorkflowInputSchema,
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => executeWorkflowAsync(input),
    },
    {
      name: 'get_workflow_result',
      description: 'Read workflow execution result by execution_id. Optionally filter steps by node_id.',
      inputSchema: schema({
        execution_id: { type: 'string', description: 'Execution ID returned by execute_workflow_sync or execute_workflow_async.' },
        workflow_id: { type: 'string', description: 'Optional workflow ID to narrow the lookup.' },
        workflowId: { type: 'string', description: 'Workflow ID alias.' },
        node_id: { type: 'string', description: 'Optional node ID. If provided, only that node step is returned.' },
      }, ['execution_id']),
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => getWorkflowResult(input),
    },
    {
      name: 'get_workflow_latest_result',
      description: 'Read the latest execution result for a workflow. Optionally filter steps by node_id.',
      inputSchema: schema({
        workflow_id: { type: 'string', description: 'Workflow ID. workflowId is also accepted.' },
        workflowId: { type: 'string', description: 'Workflow ID alias.' },
        node_id: { type: 'string', description: 'Optional node ID. If provided, only that node step is returned.' },
      }),
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => getWorkflowLatestResult(input),
    },
  ];

  return tools.filter((tool) => allowedToolNames.has(tool.name as BuiltInAgentToolName));
}

function listAgentCapabilities(workspaceId: string, input: unknown) {
  const record = asRecord(input);
  const includeDisabled = booleanInput(record, 'include_disabled', false);
  const requestedIds = new Set(stringArrayInput(record, 'agent_ids'));
  const presets = agentService.listPresets(workspaceId)
    .filter((agent) => (includeDisabled || agent.enabled !== false) && (!requestedIds.size || requestedIds.has(agent.id)))
    .map((agent) => {
      const configDir = workspaceId ? agentService.getAgentConfigDir(workspaceId, agent) : undefined;
      const mcpServers = agentService.getMcpServers(agent.mcps);
      const configuredMcpServers = objectKeys(((agent.mcps as { mcpServers?: unknown } | undefined)?.mcpServers));
      const skillNames = agentService.getAvailableSkillNames(configDir, agent.skills);
      const configuredSkills = stringArray(agent.skills);
      const toolNames = Array.isArray(agent.tools) ? [...agent.tools] : [];
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        description: agent.description ?? '',
        enabled: agent.enabled,
        providerId: agent.providerId ?? '',
        modelId: agent.modelId ?? '',
        modelProvider: agent.modelProvider ?? '',
        mcp_servers: Object.keys(mcpServers ?? {}).length ? Object.keys(mcpServers ?? {}) : configuredMcpServers,
        skills: skillNames.length ? skillNames : configuredSkills,
        tools: toolNames,
      };
    });

  return {
    success: true,
    message: presets.length
      ? `Found ${presets.length} agent preset(s).`
      : 'No matching agent presets found.',
    data: {
      total: presets.length,
      agents: presets,
    },
  };
}

function listWorkflows(input: unknown) {
  const record = asRecord(input);
  const { page, pageSize } = pageArgs(record);
  const workflows = workflowService.listWorkflows().sort((a, b) => b.updatedAt - a.updatedAt);
  const total = workflows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = workflows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(summarizeWorkflowForTool);

  return {
    success: true,
    message: `Page ${currentPage} of ${totalPages}.`,
    data: { page: currentPage, page_size: pageSize, total, total_pages: totalPages, workflows: items },
  };
}

function searchWorkflow(input: unknown) {
  const record = asRecord(input);
  const keyword = stringInput(record, 'keyword')?.toLowerCase();
  if (!keyword) return { success: false, message: 'keyword is required' };

  const { page, pageSize } = pageArgs(record);
  const matches = workflowService.listWorkflows()
    .filter((workflow) => [workflow.name, workflow.description ?? ''].join('\n').toLowerCase().includes(keyword))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(summarizeWorkflowForTool);

  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return {
    success: true,
    message: `Found ${total} matching workflows. Page ${currentPage} of ${totalPages}.`,
    data: { page: currentPage, page_size: pageSize, total, total_pages: totalPages, workflows: items },
  };
}

async function executeWorkflowAsync(input: unknown) {
  const manager = requireWorkflowExecutionManager();
  if ('success' in manager) return manager;

  const record = asRecord(input);
  const workflowId = resolveWorkflowId(record);
  const validation = validateWorkflowId(workflowId);
  if (validation) return validation;

  const result = await manager.execute({
    workflowId,
    input: objectInput(record, 'input'),
    startNodeId: stringInput(record, 'start_node_id') ?? stringInput(record, 'startNodeId'),
  }, 'agent-tools');

  return {
    success: true,
    message: 'Workflow execution started.',
    data: { workflow_id: workflowId, executionId: result.executionId, status: result.status },
  };
}

async function executeWorkflowSync(input: unknown) {
  const manager = requireWorkflowExecutionManager();
  if ('success' in manager) return manager;

  const record = asRecord(input);
  const workflowId = resolveWorkflowId(record);
  const validation = validateWorkflowId(workflowId);
  if (validation) return validation;

  const result = await manager.execute({
    workflowId,
    input: objectInput(record, 'input'),
    startNodeId: stringInput(record, 'start_node_id') ?? stringInput(record, 'startNodeId'),
  }, 'agent-tools');

  const timeoutMs = Math.min(MAX_SYNC_TIMEOUT_MS, Math.max(POLL_INTERVAL_MS, numberInput(record, 'max_wait_ms', DEFAULT_SYNC_TIMEOUT_MS)));
  const startedAt = Date.now();
  let log: ExecutionLog | null = null;
  let status = result.status;

  while (Date.now() - startedAt < timeoutMs) {
    const recovery = manager.getExecutionRecovery({ workflowId, executionId: result.executionId }, 'agent-tools');
    log = recovery.execution?.log ?? workflowService.getExecutionLog(workflowId, result.executionId);
    status = log?.status ?? recovery.execution?.status ?? status;
    if (status !== 'running') break;
    await sleep(POLL_INTERVAL_MS);
  }

  log = log ?? workflowService.getExecutionLog(workflowId, result.executionId);
  status = log?.status ?? status;
  const timedOut = status === 'running';

  return {
    success: true,
    message: timedOut ? `Workflow is still running after ${timeoutMs}ms.` : `Workflow finished with status: ${status}.`,
    data: {
      workflow_id: workflowId,
      executionId: result.executionId,
      status,
      timedOut,
      steps: log ? formatExecutionSteps(log) : [],
    },
  };
}

function getWorkflowResult(input: unknown) {
  const record = asRecord(input);
  const executionId = stringInput(record, 'execution_id');
  if (!executionId) return { success: false, message: 'execution_id is required' };

  const workflowId = resolveWorkflowId(record);
  const nodeId = stringInput(record, 'node_id');
  const scopedLog = workflowId ? workflowService.getExecutionLog(workflowId, executionId) : null;
  if (workflowId && scopedLog) return executionLogResult(workflowId, scopedLog, nodeId);

  for (const workflow of workflowService.listWorkflows()) {
    const log = workflowService.getExecutionLog(workflow.id, executionId);
    if (log) return executionLogResult(workflow.id, log, nodeId);
  }

  return { success: false, message: `Execution log not found: ${executionId}` };
}

function getWorkflowLatestResult(input: unknown) {
  const record = asRecord(input);
  const workflowId = resolveWorkflowId(record);
  const validation = validateWorkflowId(workflowId);
  if (validation) return validation;

  const log = workflowService.listExecutionLogs(workflowId)[0] ?? null;
  if (!log) return { success: false, message: `Workflow has no execution logs: ${workflowId}` };

  return executionLogResult(workflowId, log, stringInput(record, 'node_id'), true);
}

function executionLogResult(workflowId: string, log: ExecutionLog, nodeId?: string, latest = false) {
  return {
    success: true,
    message: `${latest ? 'Latest execution status' : 'Execution status'}: ${log.status}.`,
    data: {
      workflow_id: workflowId,
      executionId: log.id,
      status: log.status,
      startedAt: log.startedAt,
      finishedAt: log.finishedAt,
      steps: formatExecutionSteps(log, nodeId),
    },
  };
}

function summarizeWorkflowForTool(workflow: Workflow) {
  const startNodes = getNodesForExecutionScope(workflow.nodes, null)
    .filter((node) => node.type === 'start')
    .map((node) => ({
      id: node.id,
      label: node.label,
      inputFields: Array.isArray(node.data?.inputFields) ? clone(node.data.inputFields) : [],
    }));

  return {
    workflow_id: workflow.id,
    title: workflow.name,
    description: workflow.description ?? '',
    inputFields: startNodes[0]?.inputFields ?? [],
    startNodes,
    updatedAt: workflow.updatedAt,
  };
}

function formatExecutionSteps(log: ExecutionLog, nodeId?: string) {
  return log.steps
    .filter((step) => !nodeId || step.nodeId === nodeId)
    .map((step) => ({
      nodeId: step.nodeId,
      nodeLabel: step.nodeLabel,
      status: step.status,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      duration: step.finishedAt ? step.finishedAt - step.startedAt : undefined,
      input: step.input,
      output: step.output,
      error: step.error,
      logs: step.logs,
    }));
}

function validateWorkflowId(workflowId: string) {
  if (!workflowId) return { success: false, message: 'workflow_id is required' };
  if (!workflowService.getWorkflow(workflowId)) return { success: false, message: `Workflow not found: ${workflowId}` };
  return null;
}

function requireWorkflowExecutionManager() {
  if (!workflowExecutionManager) return { success: false, message: 'Workflow execution manager is not initialized' };
  return workflowExecutionManager;
}

export function getWorkflowExecutionManager(): ExecutionManager | null {
  return workflowExecutionManager;
}

function getAllowedWorkflowToolNames(allowedTools?: BuiltInAgentToolName[]): Set<BuiltInAgentToolName> {
  const names = new Set(allowedTools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));
  const hasWorkflowTools = Array.from(names).some((name) => isWorkflowExecutionToolName(name));
  if (hasWorkflowTools) {
    names.add('list_available_agent_capabilities');
    names.add('list_agent_capabilities');
    names.add('list_workflows');
    names.add('search_workflow');
    names.add('get_workflow_result');
    names.add('get_workflow_latest_result');
  }
  return names;
}

function isWorkflowExecutionToolName(name: string): boolean {
  return name === 'list_agent_capabilities'
    || name === 'list_available_agent_capabilities'
    || name === 'list_workflows'
    || name === 'search_workflow'
    || name === 'execute_workflow_sync'
    || name === 'execute_workflow_async'
    || name === 'get_workflow_result'
    || name === 'get_workflow_latest_result';
}

function pageArgs(input: JsonRecord): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Math.floor(numberInput(input, 'page', 1))),
    pageSize: Math.min(50, Math.max(1, Math.floor(numberInput(input, 'page_size', 10)))),
  };
}

function resolveWorkflowId(input: JsonRecord): string {
  return stringInput(input, 'workflow_id') ?? stringInput(input, 'workflowId') ?? '';
}

function schema(properties: Record<string, unknown>, required?: string[]): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

function asRecord(input: unknown): JsonRecord {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {};
}

function stringInput(input: JsonRecord, key: string): string | undefined {
  const value = input[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function numberInput(input: JsonRecord, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanInput(input: JsonRecord, key: string, fallback: boolean): boolean {
  const value = input[key];
  return typeof value === 'boolean' ? value : fallback;
}

function stringArrayInput(input: JsonRecord, key: string): string[] {
  const value = input[key];
  return stringArray(value);
}

function objectInput(input: JsonRecord, key: string): JsonRecord {
  const value = input[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
