import * as Lark from '@larksuiteoapi/node-sdk';
import type { Issue, Task, TaskResult, Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';
import * as workspaceService from './workspace.js';
import * as issueService from './issue.js';
import * as taskService from './task.js';

export type NotificationBroadcastEvent =
  | 'issuse_status_change'
  | 'issue_status_change'
  | 'issue_task_start'
  | 'issue_task_done'
  | 'issue_task_output';

interface BroadcastEnvelope {
  event: NotificationBroadcastEvent;
  workspaceId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface BotAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(envelope: BroadcastEnvelope): Promise<void>;
}

const adapters = new Map<string, BotAdapter>();
const larkChatIdsByWorkspace = new Map<string, Set<string>>();

export async function startWorkspaceNotificationService(workspaceId: string): Promise<{ started: boolean; provider?: string }> {
  const workspace = workspaceService.getById(workspaceId);
  const settings = workspace?.notificationSettings;
  if (!workspace || !settings?.enabled) return { started: false };

  await stopWorkspaceNotificationService(workspaceId);

  if (settings.provider === 'lark') {
    const adapter = new LarkNotificationAdapter(workspace, settings);
    await adapter.start();
    adapters.set(workspaceId, adapter);
    return { started: true, provider: 'lark' };
  }

  return { started: false, provider: settings.provider };
}

export async function stopWorkspaceNotificationService(workspaceId: string): Promise<void> {
  const adapter = adapters.get(workspaceId);
  if (!adapter) return;
  adapters.delete(workspaceId);
  await adapter.stop();
}

export function publishWorkspaceEvent(workspaceId: string, wsEvent: string, data: unknown): void {
  const envelope = buildNotificationEnvelope(workspaceId, wsEvent, data);
  if (!envelope) return;

  const adapter = adapters.get(workspaceId);
  if (!adapter) return;
  adapter.send(envelope).catch((err) => {
    console.error(`[notification] failed to send ${envelope.event} workspaceId=${workspaceId}:`, err);
  });
}

function buildNotificationEnvelope(workspaceId: string, wsEvent: string, data: unknown): BroadcastEnvelope | null {
  if (wsEvent === 'issue.status_changed') {
    const payload = data as { issueId?: string; from?: string; to?: string };
    if (!payload.issueId) return null;
    const issue = issueService.getById(workspaceId, payload.issueId);
    if (!issue || !shouldNotify(workspaceId, payload.to === 'completed' ? 'issue_completed' : 'issue_started')) {
      return null;
    }
    if (!isIssueStartStatus(payload.to) && payload.to !== 'completed') return null;
    return {
      event: 'issuse_status_change',
      workspaceId,
      timestamp: new Date().toISOString(),
      data: {
        issueId: issue.id,
        channelId: issue.channelId,
        title: issue.title,
        description: issue.description,
        from: payload.from,
        to: payload.to,
        status: issue.status,
        tasks: taskService.list(workspaceId, issue.id),
        issue,
        queryCommands: buildQueryCommands(workspaceId, issue.id),
      },
    };
  }

  if (wsEvent === 'task.status_changed') {
    const payload = data as { taskId?: string; from?: string; to?: string };
    if (!payload.taskId) return null;
    const task = taskService.getById(workspaceId, payload.taskId);
    if (!task) return null;
    const issue = issueService.getById(workspaceId, task.issueId);
    if (!issue) return null;
    if (payload.to === 'running' && shouldNotify(workspaceId, 'issue_started')) {
      return {
        event: 'issue_task_start',
        workspaceId,
        timestamp: new Date().toISOString(),
        data: {
          issueId: issue.id,
          channelId: issue.channelId,
          taskId: task.id,
          title: task.title,
          description: task.description,
          assignedAgentId: task.assignedAgentId,
          from: payload.from,
          to: payload.to,
          task,
          issue,
          queryCommands: buildQueryCommands(workspaceId, issue.id),
        },
      };
    }
    if (isTaskDoneStatus(payload.to) && shouldNotify(workspaceId, 'issue_task_completed')) {
      return {
        event: 'issue_task_done',
        workspaceId,
        timestamp: new Date().toISOString(),
        data: {
          issueId: issue.id,
          channelId: issue.channelId,
          taskId: task.id,
          title: task.title,
          description: task.description,
          assignedAgentId: task.assignedAgentId,
          from: payload.from,
          to: payload.to,
          result: task.result,
          task,
          issue,
          queryCommands: buildQueryCommands(workspaceId, issue.id),
        },
      };
    }
  }

  if (wsEvent === 'task.output' && shouldNotify(workspaceId, 'issue_started')) {
    const payload = data as { taskId?: string; data?: string };
    if (!payload.taskId || !payload.data) return null;
    const task = taskService.getById(workspaceId, payload.taskId);
    if (!task) return null;
    const issue = issueService.getById(workspaceId, task.issueId);
    if (!issue) return null;
    return {
      event: 'issue_task_output',
      workspaceId,
      timestamp: new Date().toISOString(),
      data: {
        issueId: issue.id,
        channelId: issue.channelId,
        taskId: task.id,
        title: task.title,
        output: payload.data,
        assignedAgentId: task.assignedAgentId,
        task,
        issue,
        queryCommands: buildQueryCommands(workspaceId, issue.id),
      },
    };
  }

  return null;
}

function shouldNotify(workspaceId: string, event: NonNullable<WorkspaceNotificationSettings['events']>[number]): boolean {
  const settings = workspaceService.getById(workspaceId)?.notificationSettings;
  return Boolean(settings?.enabled && settings.events?.includes(event));
}

function isIssueStartStatus(status?: string): boolean {
  return status === 'planned' || status === 'in_progress';
}

function isTaskDoneStatus(status?: string): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled';
}

function buildQueryCommands(workspaceId: string, issueId?: string): Record<string, string> {
  return {
    newIssue: `/new_issue workspace=${workspaceId}`,
    issueList: `/issue_list workspace=${workspaceId}`,
    issueDetail: issueId ? `/issue_detail workspace=${workspaceId} issue=${issueId}` : `/issue_detail workspace=${workspaceId} issue=`,
  };
}

class LarkNotificationAdapter implements BotAdapter {
  private client: Lark.Client;
  private wsClient: Lark.WSClient;
  private started = false;

  constructor(
    private workspace: Workspace,
    settings: WorkspaceNotificationSettings,
  ) {
    const appId = settings.lark?.appId?.trim();
    const appSecret = settings.lark?.appSecret?.trim();
    if (!appId || !appSecret) {
      throw new Error('Lark app_id and app_secret are required');
    }
    const baseConfig = { appId, appSecret };
    this.client = new Lark.Client(baseConfig);
    this.wsClient = new Lark.WSClient({ ...baseConfig, loggerLevel: Lark.LoggerLevel.info });
  }

  async start(): Promise<void> {
    this.wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => this.handleMessage(data),
      }),
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.wsClient.close({ force: true });
  }

  async send(envelope: BroadcastEnvelope): Promise<void> {
    const chatIds = larkChatIdsByWorkspace.get(this.workspace.id);
    if (!chatIds?.size) return;

    for (const chatId of chatIds) {
      await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          content: Lark.messageCard.defaultCard({
            title: formatLarkTitle(envelope),
            content: formatLarkContent(envelope),
          }),
          msg_type: 'interactive',
        },
      });
    }
  }

  private async handleMessage(data: {
    message?: { chat_id?: string; content?: string };
  }): Promise<void> {
    const chatId = data.message?.chat_id;
    if (!chatId) return;
    const chatIds = larkChatIdsByWorkspace.get(this.workspace.id) ?? new Set<string>();
    chatIds.add(chatId);
    larkChatIdsByWorkspace.set(this.workspace.id, chatIds);

    const text = parseLarkText(data.message?.content);
    const content = buildCommandResponse(this.workspace.id, text);
    await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: Lark.messageCard.defaultCard({
          title: 'Agent Spaces',
          content,
        }),
        msg_type: 'interactive',
      },
    });
  }
}

function parseLarkText(content?: string): string {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text?.trim() ?? '';
  } catch {
    return content.trim();
  }
}

function buildCommandResponse(workspaceId: string, text: string): string {
  if (text.startsWith('/issue_list')) {
    const issues = issueService.list(workspaceId);
    return issues.length
      ? issues.map((issue) => `- ${issue.title} [${issue.status}] ${issue.id}`).join('\n')
      : 'No issues.';
  }
  if (text.startsWith('/new_issue')) {
    return 'Create a new issue from Agent Spaces UI for now. Command payload is reserved for bot-platform adapters.';
  }
  if (text.startsWith('/issue_detail')) {
    const issueId = text.match(/issue=([^\s]+)/)?.[1];
    const issue = issueId ? issueService.getById(workspaceId, issueId) : null;
    if (!issue) return 'Issue not found. Usage: /issue_detail issue=<issueId>';
    const tasks = taskService.list(workspaceId, issue.id);
    return [
      `${issue.title} [${issue.status}]`,
      issue.description,
      '',
      ...tasks.map((task) => `- ${task.title} [${task.status}]`),
    ].filter(Boolean).join('\n');
  }
  return [
    'Supported commands:',
    `/new_issue workspace=${workspaceId}`,
    `/issue_list workspace=${workspaceId}`,
    `/issue_detail workspace=${workspaceId} issue=<issueId>`,
  ].join('\n');
}

function formatLarkTitle(envelope: BroadcastEnvelope): string {
  const title = typeof envelope.data.title === 'string' ? envelope.data.title : 'Issue update';
  if (envelope.event === 'issue_task_output') return `Task output: ${title}`;
  if (envelope.event === 'issue_task_start') return `Task started: ${title}`;
  if (envelope.event === 'issue_task_done') return `Task done: ${title}`;
  return `Issue status: ${title}`;
}

function formatLarkContent(envelope: BroadcastEnvelope): string {
  const lines = [
    `Event: ${envelope.event}`,
    `Workspace: ${envelope.workspaceId}`,
    envelope.data.issueId ? `Issue: ${envelope.data.issueId}` : '',
    envelope.data.taskId ? `Task: ${envelope.data.taskId}` : '',
    envelope.data.to ? `Status: ${String(envelope.data.from ?? '')} -> ${String(envelope.data.to)}` : '',
    envelope.data.output ? `Output:\n${truncate(String(envelope.data.output), 3000)}` : '',
    formatResult(envelope.data.result as TaskResult | undefined),
    '',
    'Commands:',
    ...Object.values(envelope.data.queryCommands as Record<string, string> | undefined ?? {}),
  ];
  return lines.filter(Boolean).join('\n');
}

function formatResult(result?: TaskResult): string {
  if (!result) return '';
  return [
    `Success: ${result.success}`,
    result.summary ? `Summary: ${result.summary}` : '',
    result.error ? `Error: ${result.error}` : '',
  ].filter(Boolean).join('\n');
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
