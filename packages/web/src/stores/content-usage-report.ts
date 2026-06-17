import { create } from 'zustand';
import { useWorkspaceStore } from '@/stores/workspace';
import { useEditorStore } from '@/stores/editor';
import { useTerminalStore } from '@/stores/terminal';
import { getTerminalRegistryStats } from '@/lib/terminal-registry';
import { useChannelStore } from '@/stores/channel';
import { useIssueStore } from '@/stores/issue';
import { useTaskStore } from '@/stores/task';
import { useAgentStore } from '@/stores/agent';
import { useNotificationStore } from '@/stores/notification';
import { useCommandStore } from '@/stores/command';
import { getActivityLogStore } from '@/stores/activity-log';
import { useInspectorHistoryStore } from '@/stores/inspector-history';
import { useGitStore } from '@/stores/git';

export interface TerminalUsageDetail {
  sessionId: string;
  bufferLines: number;
  outputBytes: number;
  cols: number;
  rows: number;
}

export interface ContentUsageSnapshot {
  id: string;
  capturedAt: string;
  route: string;
  visibility: DocumentVisibilityState;
  jsHeap?: {
    used: number;
    total: number;
    limit: number;
  };
  counts: {
    workspaces: number;
    agents: number;
    issues: number;
    tasks: number;
    channels: number;
    channelMessages: number;
    channelMessageBytes: number;
    notifications: number;
    commands: number;
    runningCommands: number;
    terminalSessions: number;
    terminalRegistrySessions: number;
    terminalOutputBytes: number;
    openFiles: number;
    openFileBytes: number;
    modifiedBytes: number;
    treeNodes: number;
    activityLogEntries: number;
    activityLogBytes: number;
    inspectorHistoryEntries: number;
    gitDiffEntries: number;
    gitLogEntries: number;
    gitBranchEntries: number;
  };
  terminalDetails: TerminalUsageDetail[];
}

interface ContentUsageReportState {
  reports: ContentUsageSnapshot[];
  latest: ContentUsageSnapshot | null;
  append: (report: ContentUsageSnapshot) => void;
  clear: () => void;
}

const MAX_REPORTS = 30;

function bytesToString(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function countTreeNodes(nodes: Array<{ children?: Array<{ children?: unknown[] }> }>): number {
  let total = 0;
  const walk = (items: Array<{ children?: Array<{ children?: unknown[] }> }>) => {
    for (const item of items) {
      total += 1;
      if (item.children?.length) {
        walk(item.children as Array<{ children?: Array<{ children?: unknown[] }> }>);
      }
    }
  };
  walk(nodes);
  return total;
}

function sumChannelMessages(): { count: number; bytes: number } {
  const { messages } = useChannelStore.getState();
  let count = 0;
  let bytes = 0;
  for (const list of Object.values(messages)) {
    count += list.length;
    for (const message of list) {
      bytes += typeof message.content === 'string' ? message.content.length : 0;
    }
  }
  return { count, bytes };
}

function sumActivityLogEntries(): { count: number; bytes: number } {
  const workspaces = useWorkspaceStore.getState().workspaces;
  return workspaces.reduce((total, workspace) => {
    const entries = getActivityLogStore(workspace.id).getState().entries;
    return {
      count: total.count + entries.length,
      bytes: total.bytes + entries.reduce((sum, entry) => sum + entry.message.length, 0),
    };
  }, { count: 0, bytes: 0 });
}

function getJsHeap() {
  const perf = globalThis.performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };
  const memory = perf.memory;
  if (!memory) return undefined;
  return {
    used: memory.usedJSHeapSize,
    total: memory.totalJSHeapSize,
    limit: memory.jsHeapSizeLimit,
  };
}

export function captureContentUsageSnapshot(): ContentUsageSnapshot {
  const editor = useEditorStore.getState();
  const terminal = useTerminalStore.getState();
  const channel = useChannelStore.getState();
  const issue = useIssueStore.getState();
  const task = useTaskStore.getState();
  const agent = useAgentStore.getState();
  const notification = useNotificationStore.getState();
  const command = useCommandStore.getState();
  const inspector = useInspectorHistoryStore.getState();
  const git = useGitStore.getState();

  const openFileBytes = editor.openFiles.reduce((total, file) => total + file.content.length, 0);
  const modifiedBytes = Object.values(editor.modifiedFileContents).reduce((total, content) => total + content.length, 0);
  const channelUsage = sumChannelMessages();
  const treeNodes = countTreeNodes(editor.tree);
  const heap = getJsHeap();
  const activeGitDiffs = Object.keys(editor.commitDiffs).length;
  const terminalUsage = getTerminalRegistryStats();
  const activityLogUsage = sumActivityLogEntries();

  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAt: new Date().toISOString(),
    route: `${window.location.pathname}${window.location.search}`,
    visibility: document.visibilityState,
    jsHeap: heap,
    counts: {
      workspaces: useWorkspaceStore.getState().workspaces.length,
      agents: agent.agents.length,
      issues: issue.issues.length,
      tasks: task.tasks.length,
      channels: channel.channels.length,
      channelMessages: channelUsage.count,
      channelMessageBytes: channelUsage.bytes,
      notifications: notification.notifications.length,
      commands: command.commands.length,
      runningCommands: Object.keys(command.runningMap).length,
      terminalSessions: terminal.sessions.length,
      terminalRegistrySessions: terminalUsage.sessionCount,
      terminalOutputBytes: terminalUsage.outputBytes,
      openFiles: editor.openFiles.length,
      openFileBytes,
      modifiedBytes,
      treeNodes,
      activityLogEntries: activityLogUsage.count,
      activityLogBytes: activityLogUsage.bytes,
      inspectorHistoryEntries: Object.values(inspector.histories).reduce((total, entries) => total + entries.length, 0),
      gitDiffEntries: activeGitDiffs,
      gitLogEntries: git.log.length,
      gitBranchEntries: git.branches.length,
    },
    terminalDetails: terminalUsage.sessions,
  };
}

export function formatContentUsageSnapshot(report: ContentUsageSnapshot): string[] {
  const lines = [
    `Captured: ${report.capturedAt} (${report.visibility})`,
    `Route: ${report.route}`,
  ];
  if (report.jsHeap) {
    lines.push(`JS heap: ${bytesToString(report.jsHeap.used)} / ${bytesToString(report.jsHeap.total)} (limit ${bytesToString(report.jsHeap.limit)})`);
  } else {
    lines.push('JS heap: unavailable');
  }

  lines.push(
    `Editor: ${report.counts.openFiles} files, ${bytesToString(report.counts.openFileBytes)} content, ${bytesToString(report.counts.modifiedBytes)} modified`,
    `Tree: ${report.counts.treeNodes} nodes`,
    `Terminal: ${report.counts.terminalSessions} sessions, ${report.counts.terminalRegistrySessions} tracked, ${bytesToString(report.counts.terminalOutputBytes)} buffered output`,
    `Terminal sessions: ${report.terminalDetails.length > 0 ? report.terminalDetails.map((session) => `${session.sessionId.slice(0, 8)} ${bytesToString(session.outputBytes)} ${session.bufferLines} lines ${session.cols}x${session.rows}`).join('; ') : 'none'}`,
    `Chat: ${report.counts.channels} channels, ${report.counts.channelMessages} messages, ${bytesToString(report.counts.channelMessageBytes)} text`,
    `Work items: ${report.counts.issues} issues, ${report.counts.tasks} tasks`,
    `Automation: ${report.counts.commands} commands, ${report.counts.runningCommands} running`,
    `Events: ${report.counts.notifications} notifications, ${report.counts.activityLogEntries} activity log entries, ${bytesToString(report.counts.activityLogBytes)} log text`,
    `History: ${report.counts.inspectorHistoryEntries} inspector jumps, ${report.counts.gitLogEntries} git log entries, ${report.counts.gitBranchEntries} git branches, ${report.counts.gitDiffEntries} open diffs`,
    `Workspace: ${report.counts.workspaces} loaded, ${report.counts.agents} agents`,
  );

  return lines;
}

export const useContentUsageReportStore = create<ContentUsageReportState>((set) => ({
  reports: [],
  latest: null,

  append: (report) => set((state) => ({
    reports: [...state.reports.slice(-(MAX_REPORTS - 1)), report],
    latest: report,
  })),

  clear: () => set({ reports: [], latest: null }),
}));
