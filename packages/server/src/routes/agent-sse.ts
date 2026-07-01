import { Router, type Request, type Response } from 'express';
import type { AgentConfig, Message, NodeTypeDefinition, Workflow, WorkflowNode } from '@agent-spaces/shared';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import { verifyToken } from '../middleware/auth.js';
import * as agentService from '../services/agent.js';
import * as workspaceService from '../services/workspace.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';
import { buildAgentPrompt } from '../ws/agent-prompt.js';
import { wrapOnEventWithHooks } from '../services/hook-engine.js';
import { buildWorkflowEditorSystemPrompt, createWorkflowEditorFunctionTools } from '../services/builtin-tools/workflow-editor-tools.js';

const router = Router();
const MAX_LANGCHAIN_STALL_RETRIES = 5;
const LANGCHAIN_STALL_ERROR = 'LangChain stream stalled after tool results';

type AgentSseMessage = Pick<Message, 'senderId' | 'senderRole' | 'content' | 'status' | 'parts'>;

interface AgentSseRequestBody {
  key?: string;
  workspaceId?: string;
  agentid?: string;
  agentId?: string;
  messages?: AgentSseMessage[];
  message?: string;
  prompt?: string;
  mcp?: AgentConfig['mcps'];
  mcps?: AgentConfig['mcps'];
  skill?: string | string[];
  skills?: string[];
  systemPrompt?: string;
  outputStyle?: string;
  maxTurns?: number;
  workflowAgent?: {
    workflow?: Workflow;
    nodeDefinitions?: NodeTypeDefinition[];
    selectedNodes?: WorkflowNode[];
  };
}

interface WorkflowToolRunRequestBody {
  workspaceId?: string;
  workflowAgent?: AgentSseRequestBody['workflowAgent'];
  toolName?: string;
  input?: unknown;
}

router.post('/run', async (req: Request, res: Response) => {
  const body = req.body as AgentSseRequestBody;
  if (!verifyRequestKey(req, body)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const workspaceId = resolveWorkspaceId(body.workspaceId);
  const workspace = workspaceService.getById(workspaceId);

  const agentConfigId = (body.agentId ?? body.agentid)?.trim();
  if (!agentConfigId) {
    res.status(400).json({ error: 'agentid is required' });
    return;
  }

  const preset = agentService.listPresets(workspaceId).find((agent) => agent.id === agentConfigId);
  if (!preset || preset.enabled === false) {
    res.status(404).json({ error: 'agent preset not found' });
    return;
  }

  const userPrompt = resolveUserPrompt(body);
  if (!userPrompt) {
    res.status(400).json({ error: 'message, prompt, or messages is required' });
    return;
  }

  const session = agentService.create(workspaceId, preset.role, preset.id);
  const startTime = Date.now();
  const mcpConfig = body.mcps ?? body.mcp ?? preset.mcps;
  const mcpServers = agentService.getMcpServers(mcpConfig);
  const requestedSkills = normalizeSkills(body.skills ?? body.skill) ?? preset.skills;
  const configDir = agentService.getAgentConfigDir(workspaceId, { ...preset, skills: requestedSkills });
  const skills = agentService.getAvailableSkillNames(configDir, requestedSkills);
  const workflowAgent = normalizeWorkflowAgent(body.workflowAgent);
  const functionTools = workflowAgent
    ? createWorkflowEditorFunctionTools({
        workspaceId,
        workflow: workflowAgent.workflow,
        nodeDefinitions: workflowAgent.nodeDefinitions,
      })
    : undefined;
  const runtimeKind = workflowAgent ? 'langchain' : preset.runtimeKind;
  const systemPrompt = workflowAgent
    ? buildWorkflowEditorSystemPrompt(workflowAgent.workflow)
    : body.systemPrompt ?? preset.systemPrompt;
  const history = insertWorkflowSelectedNodesMessage(
    normalizeMessages(body.messages),
    workflowAgent?.selectedNodes,
  );
  const output: string[] = [];
  const workingDir = agentService.resolveWorkingDir(workspaceId, preset);
  let completed = false;

  prepareSse(res);
  writeSse(res, 'session', { session, workspaceId });

  const createRuntime = () => createAgentRuntime({
    kind: runtimeKind,
    provider: preset.modelProvider,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
    adapterBaseURL: preset.apiBase,
    ...getThinkingRuntimeConfig(preset),
  });
  let currentRuntime: ReturnType<typeof createAgentRuntime> | null = null;

  res.on('close', () => {
    if (!completed && !res.writableEnded) currentRuntime?.stop();
  });

  try {
    agentService.updateStatus(workspaceId, session.id, 'active');
    writeSse(res, 'status', { agentId: session.id, status: 'active' });

    const agentPrompt = buildAgentPrompt(
      workspaceId,
      systemPrompt,
      userPrompt,
      history,
      {
        runtimeKind,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        boundDirs: workspace?.boundDirs ?? [],
        workingDir,
        excludeNativeClaudeMd: runtimeKind === 'claude-code',
        builtInTools: (functionTools ?? []).map((tool) => ({ name: tool.name, description: tool.description })),
      },
    );
    let result: Awaited<ReturnType<ReturnType<typeof createAgentRuntime>['execute']>>;
    let retryCount = 0;
    while (true) {
      currentRuntime = createRuntime();
      result = await currentRuntime.execute(
        agentPrompt,
        workingDir,
        {
          maxTurns: normalizeMaxTurns(body.maxTurns),
          mcpServers,
          skills,
          functionTools: functionTools ?? [],
          configDir,
          sandboxDirs: preset.sandboxDirs,
          userPrompt,
          outputStyle: body.outputStyle ?? preset.outputStyle,
          onEvent: wrapOnEventWithHooks((event) => {
            if (event.type === 'output') output.push(event.line);
            writeSse(res, event.type, serializeRuntimeEvent(event, functionTools?.getDraftWorkflow()));
          }, workspaceId, workspace?.hooksEnabled),
        },
      );
      currentRuntime = null;

      if (!isRetryableLangChainStall(result.error) || retryCount >= MAX_LANGCHAIN_STALL_RETRIES) break;
      retryCount += 1;
      writeSse(res, 'retry', {
        agentId: session.id,
        attempt: retryCount + 1,
        maxRetries: MAX_LANGCHAIN_STALL_RETRIES,
        error: result.error,
      });
    }

    completed = true;
    const displayOutput = output.length ? output : result.output;
    agentService.complete(workspaceId, session.id, result.success ? undefined : result.error, {
      runtime: runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: displayOutput,
      durationMs: Date.now() - startTime,
      usage: result.usage,
      costUsd: result.costUsd,
      forceRecord: true,
    });
    agentService.persistSessionCliHistory(session.id);

    writeSse(res, 'done', {
      agentId: session.id,
      success: result.success,
      summary: result.summary,
      artifacts: result.artifacts,
      error: result.error,
      output: displayOutput,
      usage: result.usage,
      costUsd: result.costUsd,
      durationMs: Date.now() - startTime,
    });
    res.end();
  } catch (err) {
    completed = true;
    const error = err instanceof Error ? err.message : String(err);
    agentService.complete(workspaceId, session.id, error, {
      runtime: runtimeKind,
      model: preset.modelId,
      summary: error,
      output: output.length ? output : [error],
      durationMs: Date.now() - startTime,
      forceRecord: true,
    });
    agentService.persistSessionCliHistory(session.id);
    writeSse(res, 'error', { agentId: session.id, error });
    res.end();
  }
});

router.post('/workflow-tool/run', async (req: Request, res: Response) => {
  const body = req.body as WorkflowToolRunRequestBody;
  if (!verifyRequestKey(req, req.body as AgentSseRequestBody)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const workflowAgent = normalizeWorkflowAgent(body.workflowAgent);
  if (!workflowAgent) {
    res.status(400).json({ error: 'workflowAgent is required' });
    return;
  }

  const toolName = body.toolName?.trim();
  if (!toolName) {
    res.status(400).json({ error: 'toolName is required' });
    return;
  }

  const tools = createWorkflowEditorFunctionTools({
    workspaceId: body.workspaceId,
    workflow: workflowAgent.workflow,
    nodeDefinitions: workflowAgent.nodeDefinitions,
  });
  const tool = tools.find((item) => item.name === toolName);

  if (!tool) {
    res.status(404).json({ error: `Tool not found: ${toolName}` });
    return;
  }

  try {
    const result = await tool.execute(body.input);
    res.json({ result: withWorkflowPatch(result, tools.getDraftWorkflow()) });
  } catch (err) {
    res.status(500).json({ result: { success: false, error: err instanceof Error ? err.message : String(err) } });
  }
});

function withWorkflowPatch(result: unknown, workflow: Workflow): unknown {
  const record = result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown>
    : null;
  if (!record || record.success === false || record.workflow_patch) return result;
  return {
    ...record,
    workflow_patch: {
      workflow_id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      updatedAt: workflow.updatedAt,
    },
  };
}

function verifyRequestKey(req: Request, body: AgentSseRequestBody): boolean {
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const headerKey = typeof req.headers['x-agent-spaces-key'] === 'string'
    ? req.headers['x-agent-spaces-key']
    : undefined;
  return verifyToken(body.key ?? bearer ?? headerKey ?? null);
}

function resolveWorkspaceId(workspaceId: string | undefined): string {
  const explicit = workspaceId?.trim();
  if (explicit) return explicit;
  return workspaceService.getAll()[0]?.id ?? 'default';
}

function prepareSse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.socket?.setNoDelay?.(true);
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Force flush — compression middleware and some proxies buffer small writes
  const flushable = res as Response & { flush?: () => void };
  if (typeof flushable.flush === 'function') flushable.flush();
}

function resolveUserPrompt(body: AgentSseRequestBody): string {
  const direct = body.prompt ?? body.message;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const messages = normalizeMessages(body.messages);
  const lastUserMessage = [...messages].reverse().find((message) => message.senderId === 'user');
  return lastUserMessage?.content?.trim() ?? '';
}

function normalizeMessages(messages: AgentSseRequestBody['messages']): Message[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message.content === 'string')
    .map((message, index) => ({
      id: `sse-message-${index}`,
      channelId: 'sse',
      senderId: message.senderId ?? 'user',
      senderRole: message.senderRole,
      content: message.content,
      type: 'text',
      status: message.status ?? 'completed',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      parts: message.parts,
    })) as Message[];
}

function insertWorkflowSelectedNodesMessage(messages: Message[], selectedNodes: WorkflowNode[] | undefined): Message[] {
  if (!selectedNodes?.length) return messages;

  const contextMessage: Message = {
    id: 'sse-workflow-selected-nodes',
    channelId: 'sse',
    senderId: 'workflow-context',
    senderRole: 'Workflow context',
    content: `当前选中节点：\n\`\`\`json\n${JSON.stringify(selectedNodes, null, 2)}\n\`\`\``,
    type: 'text',
    status: 'completed',
    createdAt: new Date(0).toISOString(),
  };

  const latestUserIndex = findLastIndex(messages, (message) => message.senderId === 'user');
  if (latestUserIndex < 0) return [...messages, contextMessage];
  return [
    ...messages.slice(0, latestUserIndex),
    contextMessage,
    ...messages.slice(latestUserIndex),
  ];
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function normalizeSkills(input: AgentSseRequestBody['skills'] | AgentSseRequestBody['skill']): string[] | undefined {
  if (!input) return undefined;
  const values = Array.isArray(input) ? input : [input];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeMaxTurns(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 100;
}

function isRetryableLangChainStall(error: string | undefined): boolean {
  return typeof error === 'string' && error.includes(LANGCHAIN_STALL_ERROR);
}

function normalizeWorkflowAgent(input: AgentSseRequestBody['workflowAgent']): {
  workflow: Workflow;
  nodeDefinitions: NodeTypeDefinition[];
  selectedNodes?: WorkflowNode[];
} | null {
  if (!input || typeof input !== 'object') return null;
  if (!isWorkflow(input.workflow)) return null;
  const nodeDefinitions = Array.isArray(input.nodeDefinitions)
    ? input.nodeDefinitions.filter(isNodeDefinition)
    : [];
  if (!nodeDefinitions.length) return null;
  const selectedNodes = Array.isArray(input.selectedNodes)
    ? input.selectedNodes.filter(isWorkflowNode)
    : undefined;
  return { workflow: input.workflow, nodeDefinitions, selectedNodes };
}

function isWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && Array.isArray(record.nodes)
    && Array.isArray(record.edges)
    && record.nodes.every(isWorkflowNode);
}

function isWorkflowNode(value: unknown): value is WorkflowNode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const position = record.position as Record<string, unknown> | undefined;
  return typeof record.id === 'string'
    && typeof record.type === 'string'
    && typeof record.label === 'string'
    && Boolean(position)
    && typeof position?.x === 'number'
    && typeof position?.y === 'number'
    && typeof record.data === 'object'
    && record.data !== null
    && !Array.isArray(record.data);
}

function isNodeDefinition(value: unknown): value is NodeTypeDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === 'string'
    && typeof record.label === 'string'
    && typeof record.category === 'string'
    && typeof record.description === 'string'
    && Array.isArray(record.properties);
}

function serializeRuntimeEvent(event: AgentRuntimeEvent, workflow?: Workflow): unknown {
  if (event.type === 'tool_use') {
    return {
      type: event.type,
      id: event.id,
      name: event.name,
      input: event.input,
      line: event.line,
    };
  }
  if (event.type === 'tool_result' && workflow) {
    return {
      ...event,
      result: withWorkflowPatch(event.result, workflow),
    };
  }
  return event;
}

function getRuntimeBaseURL(provider?: string, apiBase?: string): string | undefined {
  if (
    provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return undefined;
  return apiBase;
}

export default router;
