import * as issueService from '../issue.js';
import * as channelService from '../channel.js';
import * as notificationCenter from '../notification-center.js';
import type { BroadcastEnvelope } from './types.js';
import { adapters } from './types.js';
import { shouldNotify, isIssueStartStatus } from './helpers.js';

export function publishWorkspaceEvent(workspaceId: string, wsEvent: string, data: unknown): void {
  persistInAppNotification(workspaceId, wsEvent, data);

  const envelope = wsEvent === 'agent.completed'
    ? buildAgentCompletedEnvelope(workspaceId, data)
    : buildNotificationEnvelope(workspaceId, wsEvent, data);
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
        issue,
      },
    };
  }

  return null;
}

function buildAgentCompletedEnvelope(workspaceId: string, data: unknown): BroadcastEnvelope | null {
  const payload = data as { channelId?: string; agentId?: string; result?: { success?: boolean; summary?: string } };
  if (!payload.channelId) return null;

  const channel = channelService.getChannel(workspaceId, payload.channelId);
  if (!channel?.notifyOnComplete) return null;
  if (!shouldNotify(workspaceId, 'channel_agent_completed')) return null;

  return {
    event: 'channel_agent_completed',
    workspaceId,
    timestamp: new Date().toISOString(),
    data: {
      channelId: channel.id,
      channelName: channel.name,
      agentId: payload.agentId,
      summary: payload.result?.summary,
    },
  };
}

function persistInAppNotification(workspaceId: string, wsEvent: string, data: unknown): void {
  if (wsEvent === 'issue.status_changed') {
    const payload = data as { issueId?: string; from?: string; to?: string };
    if (!payload.issueId) return;
    const issue = issueService.getById(workspaceId, payload.issueId);
    if (!issue) return;

    if (payload.to === 'completed') {
      notificationCenter.createNotification(
        workspaceId, 'issue_completed',
        `议题完成: ${issue.title}`,
        issue.description || undefined,
        { issueId: issue.id, status: 'completed' },
      );
    } else if (payload.to === 'error') {
      notificationCenter.createNotification(
        workspaceId, 'issue_failed',
        `议题失败: ${issue.title}`,
        issue.description || undefined,
        { issueId: issue.id, status: 'error' },
      );
    }
  }

  if (wsEvent === 'agent.completed') {
    const payload = data as { channelId?: string; result?: { success?: boolean; summary?: string } };
    if (!payload.channelId) return;
    const channel = channelService.getChannel(workspaceId, payload.channelId);
    if (!channel?.notifyOnComplete || !payload.result?.success) return;

    notificationCenter.createNotification(
      workspaceId, 'channel_agent_completed',
      `Agent 回复完成: ${channel.name}`,
      payload.result.summary || undefined,
      { channelId: channel.id, summary: payload.result.summary },
    );
  }
}
