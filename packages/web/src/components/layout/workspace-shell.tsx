"use client";

import { useCallback, useEffect, useState } from "react";
import { Layout, Model, TabNode, IJsonModel, Actions, ITabRenderValues, Action } from "flexlayout-react";
import { Hash, ListChecks, FolderOpen, Code2, MessageSquare, FileText, TerminalSquare, FileDiff, GitCommitHorizontal, Settings2, Star } from "lucide-react";
import { TAB_ICONS, RIGHT_TO_LEFT_TAB_MAP, renderTabIcon } from "./tab-config";

import { EditorPanel } from "@/components/editor/editor-panel";
import { CodeEditor } from "@/components/editor/code-editor";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ChannelList } from "@/components/chat/channel-list";
import { ChatPanel } from "@/components/chat/chat-panel";
import { IssueList } from "@/components/issue/issue-list";
import { IssueDetail } from "@/components/issue/issue-detail";
import { GitCommitsPanel } from "@/components/git/git-commits-panel";
import { ProjectSettingsPanel } from "@/components/settings/project-settings-panel";
import { CodeFavoritesPanel } from "@/components/editor/code-favorites-panel";
import { getWS } from "@/lib/ws";
import { useIssueStore } from "@/stores/issue";
import { useTaskStore } from "@/stores/task";
import { useEditorStore } from "@/stores/editor";
import { useChannelStore } from "@/stores/channel";
import { useGitStore } from "@/stores/git";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTerminalStore } from "@/stores/terminal";
import { sendAndroidOngoingTaskNotification, sendNativeNotification } from "@/lib/native-notification";
import { useNotificationStore } from "@/stores/notification";
import { useInspectorHistoryStore } from "@/stores/inspector-history";
import type { Issue, Task, IssueStatusChangedPayload, TaskStatusChangedPayload, AppNotification } from "@agent-spaces/shared";

type FlutterBridge = { emit?: (event: string, data: unknown) => void };

function emitFlutterInspectorJump(data: { path: string; line: number; column?: number }) {
  const bridge = (window as Window & { __flutterBridge?: FlutterBridge }).__flutterBridge;
  bridge?.emit?.('inspector.jump', data);
}

// tab 图标、右→左同步映射、badge 渲染逻辑见 tab-config.tsx

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
        { type: "tab", name: "Commits", component: "git-commits" },
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
          { type: "tab", name: "Favorites", component: "code-favorites", id: "code-favorites" },
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
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const channelMessages = useChannelStore((s) => s.messages);
  const { activePanel, setActivePanel, handleBackAction } = useMobilePanelStore();
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

  useEffect(() => {
    if (!isMobile) return;

    const handlePopState = (event: PopStateEvent) => {
      const handled = handleBackAction();
      if (!handled) return;
      event.preventDefault();
      window.history.pushState({ workspaceId, mobileBackGuard: true }, "");
    };

    window.history.replaceState({ workspaceId, mobileBackGuard: true }, "");
    window.history.pushState({ workspaceId, mobileBackGuard: true }, "");
    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [handleBackAction, isMobile, workspaceId]);

  // Flutter handles back button natively via PopScope / WillPopScope

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
    if (activePanel === "git-commits") {
      git.loadLog(workspaceId);
    }
  }, [activePanel, workspaceId, isMobile]);

  const getNativeNotificationConfig = useCallback(() => {
    const ws = useWorkspaceStore.getState().workspaces.find(w => w.id === workspaceId);
    const ns = ws?.notificationSettings;
    if (!ns?.enabled || ns.provider !== 'native' || !ns.native?.permissionGranted) return null;
    return ns;
  }, [workspaceId]);

  const formatOngoingTaskNotificationBody = useCallback((task: Task) => {
    const statusText = task.status.replace(/_/g, " ");
    if (task.result?.summary) {
      return `${task.title}: ${statusText} - ${task.result.summary}`;
    }
    return `${task.title}: ${statusText}`;
  }, []);

  useEffect(() => {
    const ws = getWS(workspaceId);
    const notificationStore = useNotificationStore.getState();
    notificationStore.load(workspaceId);
    const unsubs = [
      ws.on('issue.created', (data) => issueStore.upsertIssue(data as Issue)),
      ws.on('issue.updated', (data) => issueStore.upsertIssue(data as Issue)),
      ws.on('issue.status_changed', (data) => {
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
      ws.on('task.created', (data) => {
        const task = data as Task;
        taskStore.upsertTask(task);
        const ns = getNativeNotificationConfig();
        if (ns?.native?.androidOngoingTaskNotification) {
          sendAndroidOngoingTaskNotification(formatOngoingTaskNotificationBody(task));
        }
      }),
      ws.on('task.updated', (data) => {
        const task = data as Task;
        taskStore.upsertTask(task);
        const ns = getNativeNotificationConfig();
        if (ns?.native?.androidOngoingTaskNotification) {
          sendAndroidOngoingTaskNotification(formatOngoingTaskNotificationBody(task));
        }
      }),
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
        const notification = data as AppNotification;
        notificationStore.addNotification(notification);
        const ns = getNativeNotificationConfig();
        if (ns) {
          sendNativeNotification(notification.title, notification.description || '');
        }
      }),
      ws.on('notification.cleared', () => {
        notificationStore.reset();
      }),
      ws.on('inspector.jump', (data) => {
        const { path, name, line, column, timestamp } = data as {
          path: string;
          name?: string;
          line: number;
          column?: number;
          timestamp?: number;
        };
        const normalizedColumn = column ?? 1;
        useInspectorHistoryStore.getState().addEntry(workspaceId, {
          path,
          name,
          line,
          column: normalizedColumn,
          timestamp: timestamp ?? Date.now(),
        });
        useEditorStore.getState().jumpToPosition(workspaceId, path, line, column);
        emitFlutterInspectorJump({ path, line, column: normalizedColumn });
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [issueStore, taskStore, workspaceId, getNativeNotificationConfig, formatOngoingTaskNotificationBody]);

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
        case "git-commits":
          return <GitCommitsPanel workspaceId={workspaceId} />;
        case "project-settings":
          return <ProjectSettingsPanel workspaceId={workspaceId} />;
        case "code-favorites":
          return <CodeFavoritesPanel workspaceId={workspaceId} />;
        default:
          return <Placeholder name={node.getName()} />;
      }
    },
    [boundDirs, workspaceId],
  );

  const tasks = useTaskStore((s) => s.tasks);
  const onRenderTab = useCallback((node: TabNode, renderValues: ITabRenderValues) => {
    const comp = node.getComponent();
    if (!comp) return;
    const content = renderTabIcon(comp, node.getName(), gitStatus, terminalSessions, channelMessages, tasks);
    if (content) renderValues.content = content;
  }, [gitStatus, terminalSessions, channelMessages, tasks]);

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
      const leftTabId = RIGHT_TO_LEFT_TAB_MAP[comp ?? ""];
      if (leftTabId) {
        const leftNode = _model.getNodeById(leftTabId);
        if (leftNode && leftNode instanceof TabNode) {
          _model.doAction(Actions.selectTab(leftNode.getId()));
        }
      }

      // Git 面板数据加载
      const git = useGitStore.getState();
      if (comp === "git-commits") {
        git.loadStatus(workspaceId);
        git.loadDiffs(workspaceId);
        git.loadLog(workspaceId);
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
    case "git-commits":
      return <GitCommitsPanel workspaceId={workspaceId} />;
    case "project-settings":
      return <ProjectSettingsPanel workspaceId={workspaceId} />;
    case "code-favorites":
      return <CodeFavoritesPanel workspaceId={workspaceId} />;
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
