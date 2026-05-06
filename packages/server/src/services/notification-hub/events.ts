import * as issueService from '../issue.js';
import * as taskService from '../task.js';
import type { BroadcastEnvelope } from './types.js';
import { adapters } from './types.js';
import { shouldNotify, isIssueStartStatus, isTaskDoneStatus } from './helpers.js';

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
        },
      };
    }
  }

  return null;
}
