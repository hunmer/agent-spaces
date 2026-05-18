"use client";

import React from "react";
import { Hash, ListChecks, FolderOpen, Code2, MessageSquare, FileText, TerminalSquare, FileDiff, GitCommitHorizontal, Settings2, LucideIcon } from "lucide-react";

export interface TabItem {
  id: string;
  icon: LucideIcon;
  group: string;
}

export const TAB_ITEMS: TabItem[] = [
  { id: "channel-list", icon: Hash, group: "channel" },
  { id: "chat", icon: MessageSquare, group: "channel" },
  { id: "issue-list", icon: ListChecks, group: "issue" },
  { id: "issue-detail", icon: FileDiff, group: "issue" },
  { id: "workfolder", icon: FolderOpen, group: "workfolder" },
  { id: "code-editor", icon: Code2, group: "workfolder" },
  { id: "terminal", icon: TerminalSquare, group: "tools" },
  { id: "git-commits", icon: GitCommitHorizontal, group: "git" },
  { id: "project-settings", icon: Settings2, group: "settings" },
];

export const TAB_ICONS: Record<string, React.ReactNode> = {
  "channel-list": <Hash size={16} />,
  "issue-list": <ListChecks size={16} />,
  "workfolder": <FolderOpen size={16} />,
  "code-editor": <Code2 size={16} />,
  "chat": <MessageSquare size={16} />,
  "issue-detail": <FileText size={16} />,
  "terminal": <TerminalSquare size={16} />,
  "git-commits": <GitCommitHorizontal size={16} />,
  "project-settings": <Settings2 size={16} />,
};

export const RIGHT_TO_LEFT_TAB_MAP: Record<string, string> = {
  "code-editor": "workfolder",
  "chat": "channel-list",
  "issue-detail": "issue-list",
};

interface BadgeResult {
  trailing: React.ReactNode;
  badge: React.ReactNode;
}

export function getTabBadge(
  comp: string,
  gitStatus: { clean: boolean; insertions: number; deletions: number; files: unknown[]; ahead: number } | null | undefined,
  terminalSessions: unknown[],
  channelMessages: Record<string, { status?: string }[]>,
  tasks: { status: string }[],
): BadgeResult {
  if (comp === 'git-commits' && gitStatus && !gitStatus.clean) {
    const hasStat = gitStatus.insertions > 0 || gitStatus.deletions > 0;
    const trailing = (
      <span className="ml-1 text-[10px] font-medium leading-none flex items-center gap-0.5">
        {hasStat ? (
          <>
            {gitStatus.insertions > 0 && <span className="text-green-600">+{gitStatus.insertions}</span>}
            {gitStatus.deletions > 0 && <span className="text-red-500">-{gitStatus.deletions}</span>}
          </>
        ) : (
          <span className="text-orange-500">{gitStatus.files.length}</span>
        )}
      </span>
    );
    const changedFiles = gitStatus.files.length;
    const badge = changedFiles > 0 ? (
      <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-blue-500 text-white text-[9px] font-medium leading-none flex items-center justify-center px-0.5">
        {changedFiles}
      </span>
    ) : null;
    return { trailing, badge };
  }

  if (comp === 'terminal' && terminalSessions.length > 0) {
    return {
      trailing: null,
      badge: (
        <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-green-500 text-white text-[9px] font-medium leading-none flex items-center justify-center px-0.5">
          {terminalSessions.length}
        </span>
      ),
    };
  }

  const runningBadge = (
    <span className="absolute -top-1 -right-1 flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
    </span>
  );

  if (comp === 'channel-list') {
    const hasRunning = Object.values(channelMessages).some((msgs) =>
      msgs.some((m) => m.status === 'streaming' || m.status === 'pending')
    );
    if (hasRunning) {
      return { trailing: null, badge: runningBadge };
    }
  }

  if (comp === 'issue-detail') {
    const hasRunning = tasks.some((t) =>
      t.status === 'pending' || t.status === 'running' || t.status === 'retrying' || t.status === 'waiting_review'
    );
    if (hasRunning) {
      return { trailing: null, badge: runningBadge };
    }
  }

  return { trailing: null, badge: null };
}

export function renderTabIcon(
  comp: string,
  name: string,
  gitStatus: Parameters<typeof getTabBadge>[1],
  terminalSessions: Parameters<typeof getTabBadge>[2],
  channelMessages: Parameters<typeof getTabBadge>[3],
  tasks: Parameters<typeof getTabBadge>[4],
) {
  const icon = TAB_ICONS[comp];
  if (!icon) return null;
  const { trailing, badge } = getTabBadge(comp, gitStatus, terminalSessions, channelMessages, tasks);
  return (
    <span title={name} className="flex items-center justify-center">
      <span className="relative">
        {icon}
        {badge}
      </span>
      {trailing}
    </span>
  );
}
