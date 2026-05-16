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
import { useWorkspaceStore } from "@/stores/workspace";
import { sendNativeNotification } from "@/lib/native-notification";
import { useNotificationStore } from "@/stores/notification";
import type { Issue, Task, IssueStatusChangedPayload, TaskStatusChangedPayload, AppNotification } from "@agent-spaces/shared";

const tabIcons: Record<string, React.ReactNode> = {
  "channel-list": <Hash size={16} />,
  "issue-list": <ListChecks size={16} />,
  "workfolder": <FolderOpen size={16} />,
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
  "code-editor": "workfolder",
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
          { type: "tab", name: "Workfolder", component: "workfolder", id: "workfolder" },
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
  const loadEditorState = useEditorStore((s) => s.loadEditorState);
  const revealPath = useEditorStore((s) => s.revealPath);
  const clearRevealPath = useEditorStore((s) => s.clearRevealPath);
  const [model, setModel] = useState(() => {
    try {
      const saved = localStorage.getItem(`flexlayout-${workspaceId}`);
      if (saved) return Model.fromJson(JSON.parse(saved));
    } catch { /* ignore corrupt data */ }
    return Model.fromJson(defaultJson);
  });

  useEffect(() => {
    const handler = () => {
      localStorage.removeItem(`flexlayout-${workspaceId}`);
      setModel(Model.fromJson(defaultJson));
    };
    window.addEventListener("reset-layout", handler);
    return () => window.removeEventListener("reset-layout", handler);
  }, [workspaceId]);

  useEffect(() => {
    loadEditorState(workspaceId);
  }, [workspaceId, loadEditorState]);

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

  // 打开文件时自动切换到 Code Editor tab，关闭最后一个文件时切换回 Workfolder tab
  useEffect(() => {
    if (activeFilePath) {
      if (isMobile) {
        setActivePanel("code-editor");
      } else {
        const node = model.getNodeById("code-editor");
        if (node && node instanceof TabNode) {
          model.doAction(Actions.selectTab(node.getId()));
        }
      }
    } else if (useEditorStore.getState().openFiles.length === 0) {
      if (isMobile) {
        setActivePanel("workfolder");
      } else {
        const node = model.getNodeById("workfolder");
        if (node && node instanceof TabNode) {
          model.doAction(Actions.selectTab(node.getId()));
        }
      }
    }
  }, [activeFilePath, model, isMobile, setActivePanel]);

  // 在文件树中显示：切换到 workfolder tab
  useEffect(() => {
    if (!revealPath) return;
    if (isMobile) {
      setActivePanel("workfolder");
    } else {
      const node = model.getNodeById("workfolder");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [revealPath, model, isMobile, setActivePanel]);

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

  const getNativeNotificationConfig = useCallback(() => {
    const ws = useWorkspaceStore.getState().workspaces.find(w => w.id === workspaceId);
    const ns = ws?.notificationSettings;
    if (!ns?.enabled || ns.provider !== 'native' || !ns.native?.permissionGranted) return null;
    return ns;
  }, [workspaceId]);

  useEffect(() => {
    const ws = getWS(workspaceId);
    const notificationStore = useNotificationStore.getState();
    notificationStore.load(workspaceId);
    const unsubs = [
      ws.on('issue.created', (data) => issueStore.upsertIssue(data as Issue)),
      ws.on('issue.updated', (data) => issueStore.upsertIssue(data as Issue)),
      ws.on('issue.status_changed', (data) => {
        issueStore.loadIssues(workspaceId);
        const ns = getNativeNotificationConfig();
        if (ns) {
          const { from, to } = data as IssueStatusChangedPayload;
          const events = ns.events ?? [];
          const shouldNotify =
            (to === 'in_progress' && events.includes('issue_started')) ||
            (to === 'completed' && events.includes('issue_completed'));
          if (shouldNotify) {
            const title = 'Issue Status Updated';
            const body = `Status changed: ${from} → ${to}`;
            sendNativeNotification(title, body);
          }
        }
      }),
      ws.on('task.created', (data) => taskStore.upsertTask(data as Task)),
      ws.on('task.updated', (data) => taskStore.upsertTask(data as Task)),
      ws.on('task.status_changed', (data) => {
        const activeIssueId = useIssueStore.getState().activeIssueId;
        if (activeIssueId) {
          taskStore.loadTasks(workspaceId, activeIssueId);
        }
        const ns = getNativeNotificationConfig();
        if (ns) {
          const { from, to } = data as TaskStatusChangedPayload;
          const events = ns.events ?? [];
          const shouldNotify =
            to === 'completed' && events.includes('issue_task_completed');
          if (shouldNotify) {
            const title = 'Task Status Updated';
            const body = `Status changed: ${from} → ${to}`;
            sendNativeNotification(title, body);
          }
        }
      }),
      ws.on('notification.created', (data) => {
        notificationStore.addNotification(data as AppNotification);
      }),
      ws.on('notification.cleared', () => {
        notificationStore.reset();
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [issueStore, taskStore, workspaceId, getNativeNotificationConfig]);

  const factory = useCallback(
    (node: TabNode) => {
      const comp = node.getComponent();
      switch (comp) {
        case "channel-list":
          return <ChannelList workspaceId={workspaceId} />;
        case "issue-list":
          return <IssueList workspaceId={workspaceId} />;
        case "workfolder":
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
      // 持久化布局（忽略高频的 SELECT_TAB，避免无意义写入）
      if (action.type !== Actions.SELECT_TAB) {
        try {
          localStorage.setItem(`flexlayout-${workspaceId}`, JSON.stringify(_model.toJson()));
        } catch { /* quota exceeded — ignore */ }
      }

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
    case "workfolder":
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
