import type { TaskResult } from '@agent-spaces/shared';
import type { BroadcastEnvelope } from './types.js';

export function formatLarkTitle(envelope: BroadcastEnvelope): string {
  const title = typeof envelope.data.title === 'string' ? String(envelope.data.title) : 'Issue update';
  if (envelope.event === 'issue_task_start') return `Task started: ${title}`;
  if (envelope.event === 'issue_task_done') return `Task done: ${title}`;
  return `Issue status: ${title}`;
}

export function formatLarkContent(envelope: BroadcastEnvelope): string {
  const lines = [
    `Event: ${envelope.event}`,
    `Workspace: ${envelope.workspaceId}`,
    envelope.data.issueId ? `Issue: ${envelope.data.issueId}` : '',
    envelope.data.taskId ? `Task: ${envelope.data.taskId}` : '',
    envelope.data.to ? `Status: ${String(envelope.data.from ?? '')} -> ${String(envelope.data.to)}` : '',
    envelope.data.message ? String(envelope.data.message) : '',
    formatResult(envelope.data.result as TaskResult | undefined),
  ];
  return lines.filter(Boolean).join('\n');
}

export function formatResult(result?: TaskResult): string {
  if (!result) return '';
  return [
    `Success: ${result.success}`,
    result.summary ? `Summary: ${result.summary}` : '',
    result.error ? `Error: ${result.error}` : '',
  ].filter(Boolean).join('\n');
}

export function truncateLine(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}
