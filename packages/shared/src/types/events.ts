import type { WorkflowTemplate } from './workflow.js';
import type { CommandProcessEvent } from './command.js';
import type { AppNotification } from './notification.js';

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

// ---- Client → Server Event Map ----

export type ClientEventMap = {
  'terminal.create': TerminalCreatePayload;
  'terminal.input': TerminalInputPayload;
  'terminal.resize': TerminalResizePayload;
  'terminal.close': TerminalClosePayload;
  'channel.message': { channelId: string; content: string; type?: string; mentions?: string[]; attachments?: import('./channel.js').Attachment[] };
  'channel.stop': { channelId: string };
  'channel.answer_question': { channelId: string; messageId: string; questionId: string; answer: string };
  'agent.start': { workspaceId: string; role: string; issueId?: string };
  'agent.stop': { agentId: string };
};

// ---- Server → Client Event Map ----

export type ServerEventMap = {
  'connected': { workspaceId: string };
  'terminal.created': TerminalCreatePayload;
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
  'task.created': import('./task.js').Task;
  'task.updated': import('./task.js').Task;
  'task.status_changed': TaskStatusChangedPayload;
  'task.output': TaskOutputPayload;
  'workflow.created': { workflow: WorkflowTemplate };
  'workflow.updated': { workflow: WorkflowTemplate };
  'workflow.deleted': { workflowId: string };
  'command.started': CommandProcessEvent;
  'command.stopped': CommandProcessEvent;
  'command.restarted': CommandProcessEvent;
  'notification.created': AppNotification;
  'notification.cleared': null;
};

export type ClientEventName = keyof ClientEventMap;
export type ServerEventName = keyof ServerEventMap;
