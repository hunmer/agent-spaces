"use client";

import { useCallback, useEffect, useState } from "react";
import { Layout, Model, TabNode, IJsonModel, Actions, ITabRenderValues, Action } from "flexlayout-react";
import { Hash, ListChecks, FolderOpen, Code2, MessageSquare, FileText, TerminalSquare, FileDiff, GitCommitHorizontal, Network, Settings2 } from "lucide-react";
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
import { ProjectSettingsPanel } from "@/components/settings/project-settings-panel";
import { getWS } from "@/lib/ws";
import { useIssueStore } from "@/stores/issue";
import { useTaskStore } from "@/stores/task";
import { useEditorStore } from "@/stores/editor";
import { useChannelStore } from "@/stores/channel";
import { useGitStore } from "@/stores/git";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { useIsMobile } from "@/hooks/use-mobile";
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
  "project-settings": <Settings2 size={16} />,
};

// 右侧 tab → 左侧 tab 同步映射
const rightToLeftTabMap: Record<string, string> = {
  "code-editor": "editor",
  "chat": "channel-list",
  "issue-detail": "issue-list",
};

const defaultJson: IJsonModel = {
  global: {
    tabSetEnableTabStrip: true,
    borderEnableDrop: true,
    tabEnableClose: false,
    tabEnableRename: false,
    tabSetEnableMaximize: false,
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
          { type: "tab", name: "Settings", component: "project-settings", id: "project-settings" },
          { type: "tab", name: "Channels", component: "channel-list", id: "channel-list" },
          { type: "tab", name: "Issues", component: "issue-list", id: "issue-list" },
          { type: "tab", name: "Editor", component: "editor", id: "editor" },
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
  boundDirs: string[];
}

export function WorkspaceShell({ workspaceId, boundDirs }: WorkspaceShellProps) {
  const isMobile = useIsMobile();
  const issueStore = useIssueStore();
  const taskStore = useTaskStore();
  const activeIssueId = useIssueStore((s) => s.activeIssueId);
  const issueSelectSeq = useIssueStore((s) => s.issueSelectSeq);
  const activeFilePath = useEditorStore((s) => s.activeFilePath);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const channelSelectSeq = useChannelStore((s) => s.channelSelectSeq);
  const gitStatus = useGitStore((s) => s.status);
  const { activePanel, setActivePanel } = useMobilePanelStore();
  const [model] = useState(() => Model.fromJson(defaultJson));

  // 点击 issue 时自动切换到 Issue Detail tab
  useEffect(() => {
    if (!activeIssueId) return;
    if (isMobile) {
      setActivePanel("issue-detail");
    } else {
      const node = model.getNodeById("issue-detail");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [issueSelectSeq, activeIssueId, model, isMobile, setActivePanel]);

  // 选中 channel 时自动切换到 Chat tab
  useEffect(() => {
    if (!activeChannelId) return;
    if (isMobile) {
      setActivePanel("chat");
    } else {
      const node = model.getNodeById("chat");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [channelSelectSeq, activeChannelId, model, isMobile, setActivePanel]);

  // 打开文件时自动切换到 Code Editor tab
  useEffect(() => {
    if (!activeFilePath) return;
    if (isMobile) {
      setActivePanel("code-editor");
    } else {
      const node = model.getNodeById("code-editor");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [activeFilePath, model, isMobile, setActivePanel]);

  // 加载 git 状态
  useEffect(() => {
    useGitStore.getState().loadStatus(workspaceId);
    const interval = setInterval(() => {
      useGitStore.getState().loadStatus(workspaceId);
    }, 30000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  // 移动端切换到 git 面板时加载数据
  useEffect(() => {
    if (!isMobile) return;
    const git = useGitStore.getState();
    if (activePanel === "git-changes") {
      git.loadStatus(workspaceId);
      git.loadDiffs(workspaceId);
    } else if (activePanel === "git-commits") {
      git.loadLog(workspaceId);
    } else if (activePanel === "git-graph") {
      git.loadLog(workspaceId);
      git.loadStatus(workspaceId);
    }
  }, [activePanel, workspaceId, isMobile]);

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
  }, [issueStore, taskStore, workspaceId]);

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
          return <TerminalPanel workspaceId={workspaceId} boundDirs={boundDirs} />;
        case "git-changes":
          return <GitChangesPanel workspaceId={workspaceId} />;
        case "git-commits":
          return <GitCommitsPanel workspaceId={workspaceId} />;
        case "git-graph":
          return <GitGraphPanel workspaceId={workspaceId} />;
        case "project-settings":
          return <ProjectSettingsPanel workspaceId={workspaceId} />;
        default:
          return <Placeholder name={node.getName()} />;
      }
    },
    [boundDirs, workspaceId],
  );

  const onRenderTab = useCallback((node: TabNode, renderValues: ITabRenderValues) => {
    const comp = node.getComponent();
    const icon = comp ? tabIcons[comp] : undefined;
    if (!icon) return;

    let badge: React.ReactNode = null;
    if (comp === 'git-changes' && gitStatus && !gitStatus.clean) {
      badge = (
        <span className="ml-0.5 text-[10px] font-medium text-orange-500 leading-none">
          {gitStatus.files.length}
        </span>
      );
    } else if (comp === 'git-commits' && gitStatus && gitStatus.ahead > 0) {
      badge = (
        <span className="ml-0.5 text-[10px] font-medium text-blue-500 leading-none">
          ↑{gitStatus.ahead}
        </span>
      );
    } else if (comp === 'git-graph' && gitStatus) {
      badge = (
        <span className="ml-0.5 text-[10px] font-medium text-muted-foreground leading-none max-w-[80px] truncate">
          {gitStatus.branch}
        </span>
      );
    }

    renderValues.content = (
      <span title={node.getName()} className="flex items-center justify-center">
        {icon}
        {badge}
      </span>
    );
  }, [gitStatus]);

  const onModelChange = useCallback(
    (_model: Model, action: Action) => {
      if (action.type !== Actions.SELECT_TAB) return;
      const node = _model.getNodeById(action.data.tabNode);
      if (!node || !(node instanceof TabNode)) return;
      const comp = node.getComponent();

      // 右侧 tab 切换时，同步切换左侧对应 tab
      const leftTabId = rightToLeftTabMap[comp ?? ""];
      if (leftTabId) {
        const leftNode = _model.getNodeById(leftTabId);
        if (leftNode && leftNode instanceof TabNode) {
          _model.doAction(Actions.selectTab(leftNode.getId()));
        }
      }

      // Git 面板数据加载
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

  if (isMobile) {
    return (
      <div className="relative h-full w-full">
        <MobilePanelRenderer panel={activePanel} workspaceId={workspaceId} boundDirs={boundDirs} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Layout model={model} factory={factory} onRenderTab={onRenderTab} onModelChange={onModelChange} />
    </div>
  );
}

function MobilePanelRenderer({ panel, workspaceId, boundDirs }: { panel: string; workspaceId: string; boundDirs: string[] }) {
  switch (panel) {
    case "channel-list":
      return <ChannelList workspaceId={workspaceId} />;
    case "chat":
      return <ChatPanel workspaceId={workspaceId} />;
    case "issue-list":
      return <IssueList workspaceId={workspaceId} />;
    case "issue-detail":
      return <IssueDetail workspaceId={workspaceId} />;
    case "editor":
      return <EditorPanel workspaceId={workspaceId} />;
    case "code-editor":
      return <CodeEditor workspaceId={workspaceId} />;
    case "terminal":
      return <TerminalPanel workspaceId={workspaceId} boundDirs={boundDirs} />;
    case "git-changes":
      return <GitChangesPanel workspaceId={workspaceId} />;
    case "git-commits":
      return <GitCommitsPanel workspaceId={workspaceId} />;
    case "git-graph":
      return <GitGraphPanel workspaceId={workspaceId} />;
    case "project-settings":
      return <ProjectSettingsPanel workspaceId={workspaceId} />;
    default:
      return <ChannelList workspaceId={workspaceId} />;
  }
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {name} (coming soon)
    </div>
  );
}
