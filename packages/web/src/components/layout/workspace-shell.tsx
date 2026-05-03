"use client";

import { useCallback, useEffect, useState } from "react";
import { Layout, Model, TabNode, IJsonModel, Actions, ITabRenderValues } from "flexlayout-react";
import { Hash, ListChecks, FolderOpen, Code2, MessageSquare, FileText, TerminalSquare, GitBranch, FileDiff, GitCommitHorizontal, Network } from "lucide-react";
import { EditorPanel } from "@/components/editor/editor-panel";
import { CodeEditor } from "@/components/editor/code-editor";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ChannelList } from "@/components/chat/channel-list";
import { ChatPanel } from "@/components/chat/chat-panel";
import { IssueList } from "@/components/issue/issue-list";
import { IssueDetail } from "@/components/issue/issue-detail";
import { GitChangesPanel } from "@/components/git/git-changes-panel";
import { GitCommitsPanel } from "@/components/git/git-commits-panel";
import { GitGraphPanel } from "@/components/git/git-graph-panel";
import { getWS } from "@/lib/ws";
import { useIssueStore } from "@/stores/issue";
import { useTaskStore } from "@/stores/task";
import { useEditorStore } from "@/stores/editor";
import { useChannelStore } from "@/stores/channel";
import { useGitStore } from "@/stores/git";
import type { Issue, Task } from "@agent-spaces/shared";

const tabIcons: Record<string, React.ReactNode> = {
  "channel-list": <Hash size={16} />,
  "issue-list": <ListChecks size={16} />,
  "editor": <FolderOpen size={16} />,
  "code-editor": <Code2 size={16} />,
  "chat": <MessageSquare size={16} />,
  "issue-detail": <FileText size={16} />,
  "terminal": <TerminalSquare size={16} />,
  "git-changes": <FileDiff size={16} />,
  "git-commits": <GitCommitHorizontal size={16} />,
  "git-graph": <Network size={16} />,
};

const defaultJson: IJsonModel = {
  global: {
    tabSetEnableTabStrip: true,
    borderEnableDrop: true,
    tabEnableClose: false,
  },
  borders: [
    {
      type: "border",
      location: "bottom",
      children: [
        { type: "tab", name: "Terminal", component: "terminal" },
        { type: "tab", name: "Changes", component: "git-changes" },
        { type: "tab", name: "Commits", component: "git-commits" },
        { type: "tab", name: "Graph", component: "git-graph" },
      ],
    },
  ],
  layout: {
    type: "row",
    children: [
      {
        type: "tabset",
        weight: 0.25,
        children: [
          { type: "tab", name: "Channels", component: "channel-list" },
          { type: "tab", name: "Issues", component: "issue-list" },
          { type: "tab", name: "Editor", component: "editor" },
        ],
      },
      {
        type: "tabset",
        weight: 0.75,
        children: [
          { type: "tab", name: "Code Editor", component: "code-editor", id: "code-editor" },
          { type: "tab", name: "Chat", component: "chat", id: "chat" },
          { type: "tab", name: "Issue Detail", component: "issue-detail", id: "issue-detail" },
        ],
      },
    ],
  },
};

interface WorkspaceShellProps {
  workspaceId: string;
}

export function WorkspaceShell({ workspaceId }: WorkspaceShellProps) {
  const issueStore = useIssueStore();
  const taskStore = useTaskStore();
  const activeIssueId = useIssueStore((s) => s.activeIssueId);
  const activeFilePath = useEditorStore((s) => s.activeFilePath);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const [model] = useState(() => Model.fromJson(defaultJson));

  // 点击 issue 时自动切换到 Issue Detail tab
  useEffect(() => {
    if (activeIssueId) {
      const node = model.getNodeById("issue-detail");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [activeIssueId, model]);

  // 选中 channel 时自动切换到 Chat tab
  useEffect(() => {
    if (activeChannelId) {
      const node = model.getNodeById("chat");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [activeChannelId, model]);

  // 打开文件时自动切换到 Code Editor tab
  useEffect(() => {
    if (activeFilePath) {
      const node = model.getNodeById("code-editor");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [activeFilePath, model]);

  useEffect(() => {
    const ws = getWS(workspaceId);
    const unsubs = [
      ws.on('issue.created', (data) => issueStore.upsertIssue(data as Issue)),
      ws.on('issue.updated', (data) => issueStore.upsertIssue(data as Issue)),
      ws.on('issue.status_changed', () => {
        issueStore.loadIssues(workspaceId);
      }),
      ws.on('task.created', (data) => taskStore.upsertTask(data as Task)),
      ws.on('task.updated', (data) => taskStore.upsertTask(data as Task)),
      ws.on('task.status_changed', () => {
        const activeIssueId = useIssueStore.getState().activeIssueId;
        if (activeIssueId) {
          taskStore.loadTasks(workspaceId, activeIssueId);
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [workspaceId]);

  const factory = useCallback(
    (node: TabNode) => {
      const comp = node.getComponent();
      switch (comp) {
        case "channel-list":
          return <ChannelList workspaceId={workspaceId} />;
        case "issue-list":
          return <IssueList workspaceId={workspaceId} />;
        case "editor":
          return <EditorPanel workspaceId={workspaceId} />;
        case "code-editor":
          return <CodeEditor workspaceId={workspaceId} />;
        case "chat":
          return <ChatPanel workspaceId={workspaceId} />;
        case "issue-detail":
          return <IssueDetail workspaceId={workspaceId} />;
        case "terminal":
          return <TerminalPanel workspaceId={workspaceId} />;
        case "git-changes":
          return <GitChangesPanel workspaceId={workspaceId} />;
        case "git-commits":
          return <GitCommitsPanel workspaceId={workspaceId} />;
        case "git-graph":
          return <GitGraphPanel workspaceId={workspaceId} />;
        default:
          return <Placeholder name={node.getName()} />;
      }
    },
    [workspaceId],
  );

  const onRenderTab = useCallback((node: TabNode, renderValues: ITabRenderValues) => {
    const comp = node.getComponent();
    const icon = comp ? tabIcons[comp] : undefined;
    if (icon) {
      renderValues.content = (
        <span title={node.getName()} className="flex items-center justify-center">
          {icon}
        </span>
      );
    }
  }, []);

  const onModelChange = useCallback(
    (_model: Model, action: { type: string; data: Record<string, any> }) => {
      if (action.type !== Actions.SELECT_TAB) return;
      const node = _model.getNodeById(action.data.tabNode);
      if (!node || !(node instanceof TabNode)) return;
      const comp = node.getComponent();
      const git = useGitStore.getState();
      if (comp === "git-changes") {
        git.loadStatus(workspaceId);
        git.loadDiffs(workspaceId);
      } else if (comp === "git-commits") {
        git.loadLog(workspaceId);
      } else if (comp === "git-graph") {
        git.loadLog(workspaceId);
        git.loadStatus(workspaceId);
      }
    },
    [workspaceId],
  );

  return (
    <div className="h-full w-full">
      <Layout model={model} factory={factory} onRenderTab={onRenderTab} onModelChange={onModelChange} />
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {name} (coming soon)
    </div>
  );
}
