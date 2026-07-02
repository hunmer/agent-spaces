import type { Workflow } from './workflow.js';
import type { CommandProcessEvent } from './command.js';
import type { AppNotification } from './notification.js';
import type { ClientNodeRequest, ClientNodeResponse, InteractionRequest, InteractionResponse } from './workflow-ws.js';

export interface WSEvent<T = unknown> {
  event: string;
  workspaceId: string;
  timestamp: string;
  data: T;
}

// ---- Terminal Events ----

export interface TerminalCreatePayload {
  sessionId: string;
  cwd?: string;
  shell?: string;
}

export interface TerminalInputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalClosePayload {
  sessionId: string;
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalClosedPayload {
  sessionId: string;
  exitCode?: number;
}

export interface TerminalSessionsPayload {
  sessions: Array<{
    sessionId: string;
    cwd: string;
    shell?: string;
    buffer?: string;
  }>;
}

// ---- Agent Events ----

export interface AgentStatusChangedPayload {
  agentId: string;
  from: string;
  to: string;
}

export interface AgentOutputPayload {
  agentId: string;
  data: string;
}

export interface AgentCompletedPayload {
  agentId: string;
  result?: import('./task.js').TaskResult;
  error?: string;
}

// ---- Issue Events ----

export interface IssueStatusChangedPayload {
  issueId: string;
  from: string;
  to: string;
}

export interface IssueCommentDeletedPayload {
  workspaceId: string;
  issueId: string;
  commentId: string;
}

// ---- Task Events ----

export interface TaskStatusChangedPayload {
  taskId: string;
  from: string;
  to: string;
}

export interface TaskOutputPayload {
  taskId: string;
  data: string;
}

export interface MiniAppMessageContext {
  projectId: string;
  activeFilePath?: string;
  projectType?: 'react' | 'html';
  fileContent?: string;
}

// ---- Client → Server Event Map ----

export type ClientEventMap = {
  'terminal.list': Record<string, never>;
  'terminal.create': TerminalCreatePayload;
  'terminal.input': TerminalInputPayload;
  'terminal.resize': TerminalResizePayload;
  'terminal.close': TerminalClosePayload;
  'channel.message': { channelId: string; content: string; type?: string; mentions?: string[]; attachments?: import('./channel.js').Attachment[]; replyToMessageId?: string; contextLength?: number; miniAppContext?: MiniAppMessageContext };
  'channel.stop': { channelId: string };
  'channel.answer_question': { channelId: string; messageId: string; questionId: string; answer: string };
  'agent.start': { workspaceId: string; role: string; issueId?: string };
  'agent.stop': { agentId: string };
  'workflow:execute': { workflowId: string; input?: Record<string, unknown>; env?: Record<string, unknown>; context?: Record<string, unknown>; snapshot?: unknown; startNodeId?: string };
  'workflow:pause': { executionId: string };
  'workflow:resume': { executionId: string };
  'workflow:stop': { executionId: string };
  'workflow:debug-node': { workflowId: string; nodeId: string; input?: Record<string, unknown>; env?: Record<string, unknown>; context?: Record<string, unknown>; snapshot?: unknown; embeddedNode?: unknown };
  'workflow:get-execution-recovery': { workflowId: string; executionId?: string | null };
  'workflow:interaction': InteractionResponse;
  'workflow:client-node': ClientNodeResponse;
  'miniApp.clientResponse': { requestId: string; ok: boolean; result?: unknown; error?: string };
};

// ---- Workflow UI Task Events ----

export type MiniAppTaskStatus = 'running' | 'completed' | 'failed';

export interface MiniAppTask {
  taskId: string;
  projectId: string;
  pluginId: string;
  toolName: string;
  executorId: string;
  status: MiniAppTaskStatus;
  startedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: string;
  /** 前端自定义上下文（mode/provider/modeLabel/prompt 等），后端原样存取与广播 */
  meta?: Record<string, unknown>;
}

export interface MiniAppTaskEvent {
  taskId: string;
  executorId: string;
  pluginId: string;
  toolName: string;
  meta?: Record<string, unknown>;
}

// ---- Server → Client Event Map ----

export type ServerEventMap = {
  'connected': { workspaceId: string };
  'terminal.created': TerminalCreatePayload;
  'terminal.sessions': TerminalSessionsPayload;
  'terminal.output': TerminalOutputPayload;
  'terminal.closed': TerminalClosedPayload;
  'channel.message': import('./channel.js').Message;
  'channel.message.updated': import('./channel.js').Message;
  'channel.message.deleted': { channelId: string; messageId: string };
  'channel.messages.cleared': { channelId: string };
  'channel.updated': import('./channel.js').Channel;
  'agent.started': import('./agent.js').AgentSession;
  'agent.status_changed': AgentStatusChangedPayload;
  'agent.output': AgentOutputPayload;
  'agent.completed': AgentCompletedPayload;
  'agent.error': { agentId: string; error: string };
  'issue.created': import('./issue.js').Issue;
  'issue.updated': import('./issue.js').Issue;
  'issue.status_changed': IssueStatusChangedPayload;
  'issue.comment.created': import('./issue.js').IssueComment;
  'issue.comment.updated': import('./issue.js').IssueComment;
  'issue.comment.deleted': IssueCommentDeletedPayload;
  'task.created': import('./task.js').Task;
  'task.updated': import('./task.js').Task;
  'task.status_changed': TaskStatusChangedPayload;
  'task.output': TaskOutputPayload;
  'workflow.created': { workflow: Workflow };
  'workflow.updated': { workflow: Workflow };
  'workflow.deleted': { workflowId: string };
  'command.started': CommandProcessEvent;
  'command.stopped': CommandProcessEvent;
  'command.restarted': CommandProcessEvent;
  'notification.created': AppNotification;
  'notification.cleared': null;
  'worktree.created': import('./worktree.js').WorktreeInfo;
  'worktree.deleted': { id: string; workspaceId: string };
  'worktree.pr_created': import('./worktree.js').WorktreeInfo;
  'worktree.merged': import('./worktree.js').WorktreeInfo;
  'workflow:execute:result': { executionId: string; status?: string };
  'workflow:execute:error': { error: string };
  'workflow:pause:result': unknown;
  'workflow:pause:error': { error: string };
  'workflow:resume:result': unknown;
  'workflow:resume:error': { error: string };
  'workflow:stop:result': unknown;
  'workflow:stop:error': { error: string };
  'workflow:debug-node:result': unknown;
  'workflow:debug-node:error': { error: string };
  'workflow:get-execution-recovery:result': unknown;
  'workflow:get-execution-recovery:error': { error: string };
  'workflow:interaction': InteractionRequest;
  'workflow:client-node': ClientNodeRequest;
  'interaction:ui_required': unknown;
  'miniApp.taskSnapshot': { tasks: MiniAppTask[] };
  'miniApp.taskStarted': MiniAppTaskEvent;
  'miniApp.taskFinished': MiniAppTaskEvent & { result?: unknown };
  'miniApp.taskFailed': MiniAppTaskEvent & { error: string };
  'miniApp.configSnapshot': { configs: Record<string, unknown> };
  'miniApp.configChanged': { path: string; value: unknown };
  'miniApp.clientRequest': { requestId: string; type: string; payload?: unknown };
};

export type ClientEventName = keyof ClientEventMap;
export type ServerEventName = keyof ServerEventMap;
