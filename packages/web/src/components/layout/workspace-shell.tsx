"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Layout, Model, TabNode, IJsonModel, Actions, ITabRenderValues, Action } from "flexlayout-react";
import { RIGHT_TO_LEFT_TAB_MAP, renderTabIcon } from "./tab-config";

import { LAYOUT_STORAGE_KEY } from "@/lib/layout-templates";
import { getWS } from "@/lib/ws";
import { useIssueStore } from "@/stores/issue";
import { useTaskStore } from "@/stores/task";
import { useEditorStore } from "@/stores/editor";
import { useChannelStore } from "@/stores/channel";
import { useGitStore } from "@/stores/git";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { startActivityLogListeners, stopActivityLogListeners } from "@/stores/activity-log";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTerminalStore } from "@/stores/terminal";
import { useAgentStore } from "@/stores/agent";
import { sendAndroidOngoingTaskNotification, sendNativeNotification } from "@/lib/native-notification";
import { useNotificationStore } from "@/stores/notification";
import { useInspectorHistoryStore } from "@/stores/inspector-history";
import type { Issue, Task, IssueStatusChangedPayload, TaskStatusChangedPayload, AppNotification } from "@agent-spaces/shared";

const panelLoader = () => <PanelLoading />;

const EditorPanel = dynamic(() => import("@/components/editor/editor-panel").then((mod) => mod.EditorPanel), {
  ssr: false,
  loading: panelLoader,
});
const CodeEditor = dynamic(() => import("@/components/editor/code-editor").then((mod) => mod.CodeEditor), {
  ssr: false,
  loading: panelLoader,
});
const TerminalPanel = dynamic(() => import("@/components/terminal/terminal-panel").then((mod) => mod.TerminalPanel), {
  ssr: false,
  loading: panelLoader,
});
const ChannelList = dynamic(() => import("@/components/chat/channel-list").then((mod) => mod.ChannelList), {
  ssr: false,
  loading: panelLoader,
});
const ChatPanel = dynamic(() => import("@/components/chat/chat-panel").then((mod) => mod.ChatPanel), {
  ssr: false,
  loading: panelLoader,
});
const IssueList = dynamic(() => import("@/components/issue/issue-list").then((mod) => mod.IssueList), {
  ssr: false,
  loading: panelLoader,
});
const IssueDetail = dynamic(() => import("@/components/issue/issue-detail").then((mod) => mod.IssueDetail), {
  ssr: false,
  loading: panelLoader,
});
const GitCommitsPanel = dynamic(() => import("@/components/git/git-commits-panel").then((mod) => mod.GitCommitsPanel), {
  ssr: false,
  loading: panelLoader,
});
const ProjectSettingsPanel = dynamic(() => import("@/components/settings/project-settings-panel").then((mod) => mod.ProjectSettingsPanel), {
  ssr: false,
  loading: panelLoader,
});
const CodeFavoritesPanel = dynamic(() => import("@/components/editor/code-favorites-panel").then((mod) => mod.CodeFavoritesPanel), {
  ssr: false,
  loading: panelLoader,
});
const AddFavoriteDialog = dynamic(() => import("@/components/editor/add-favorite-dialog").then((mod) => mod.AddFavoriteDialog), {
  ssr: false,
  loading: () => null,
});
const SendToChannelDialog = dynamic(() => import("@/components/editor/send-to-channel-dialog").then((mod) => mod.SendToChannelDialog), {
  ssr: false,
  loading: () => null,
});
const SendToIssueDialog = dynamic(() => import("@/components/editor/send-to-issue-dialog").then((mod) => mod.SendToIssueDialog), {
  ssr: false,
  loading: () => null,
});
const InspectorActionDialog = dynamic(() => import("@/components/editor/inspector-action-dialog").then((mod) => mod.InspectorActionDialog), {
  ssr: false,
  loading: () => null,
});
const WorktreePanel = dynamic(() => import("@/components/worktree/worktree-panel").then((mod) => mod.WorktreePanel), {
  ssr: false,
  loading: panelLoader,
});
const ActivityLogPanel = dynamic(() => import("@/components/viewers/activity-log-panel").then((mod) => mod.ActivityLogPanel), {
  ssr: false,
  loading: panelLoader,
});
const ChannelDialog = dynamic(() => import("@/components/chat/channel-dialog").then((mod) => mod.ChannelDialog), {
  ssr: false,
  loading: () => null,
});
const CreateIssueDialog = dynamic(() => import("@/components/issue/create-issue-dialog").then((mod) => mod.CreateIssueDialog), {
  ssr: false,
  loading: () => null,
});

function PanelLoading() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>;
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
        { type: "tab", name: "Favorites", component: "code-favorites", id: "code-favorites" },
        { type: "tab", name: "Worktrees", component: "worktree-panel", id: "worktree-panel" },
        { type: "tab", name: "Logger", component: "activity-log", id: "activity-log" },
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeIssueId = useIssueStore((s) => s.activeIssueId);
  const issueSelectSeq = useIssueStore((s) => s.issueSelectSeq);
  const upsertIssue = useIssueStore((s) => s.upsertIssue);
  const setActiveIssue = useIssueStore((s) => s.setActiveIssue);
  const activeFilePath = useEditorStore((s) => s.activeFilePath);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const channelSelectSeq = useChannelStore((s) => s.channelSelectSeq);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const loadChannels = useChannelStore((s) => s.loadChannels);
  const gitStatus = useGitStore((s) => s.status);
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const channelMessages = useChannelStore((s) => s.messages);
  const { activePanel, setActivePanel, handleBackAction } = useMobilePanelStore();
  const loadEditorState = useEditorStore((s) => s.loadEditorState);
  const revealPath = useEditorStore((s) => s.revealPath);
  const _clearRevealPath = useEditorStore((s) => s.clearRevealPath);
  const channelCreateOpen = useChannelStore((s) => s.createDialogOpen);
  const setChannelCreateOpen = useChannelStore((s) => s.setCreateDialogOpen);
  const issueCreateOpen = useIssueStore((s) => s.createDialogOpen);
  const setIssueCreateOpen = useIssueStore((s) => s.setCreateDialogOpen);
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const agents = useAgentStore((s) => s.agents);
  const createChannel = useChannelStore((s) => s.createChannel);
  const createIssue = useIssueStore((s) => s.createIssue);
  // 用户首次交互后才允许 tab 联动，避免恢复期间覆盖选中状态
  const userInteractedRef = useRef(false);
  useEffect(() => {
    const mark = () => { userInteractedRef.current = true; };
    window.addEventListener("pointerdown", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);
  const [model, setModel] = useState(() => {
    let m: Model;
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        const json = JSON.parse(saved);
        // Ensure bottom border has code-favorites tab
        const borders = json.borders as { type: string; location: string; children: unknown[] }[] | undefined;
        const bottom = borders?.find((b) => b.location === 'bottom');
        if (bottom && !bottom.children.some((c) => { const t = c as Record<string, unknown>; return t.id === 'code-favorites' || t.component === 'code-favorites'; })) {
          bottom.children.push({ type: 'tab', name: 'Favorites', component: 'code-favorites', id: 'code-favorites' });
        }
        if (bottom && !bottom.children.some((c) => { const t = c as Record<string, unknown>; return t.id === 'worktree-panel' || t.component === 'worktree-panel'; })) {
          bottom.children.push({ type: 'tab', name: 'Worktrees', component: 'worktree-panel', id: 'worktree-panel' });
        }
        if (bottom && !bottom.children.some((c) => { const t = c as Record<string, unknown>; return t.id === 'activity-log' || t.component === 'activity-log'; })) {
          bottom.children.push({ type: 'tab', name: 'Logger', component: 'activity-log', id: 'activity-log' });
        }
        m = Model.fromJson(json);
      } else {
        m = Model.fromJson(defaultJson);
      }
    } catch {
      m = Model.fromJson(defaultJson);
    }
    return m;
  });

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try { setModel(Model.fromJson(JSON.parse(saved))); } catch { /* ignore */ }
    }
  }, [workspaceId]);

  useEffect(() => {
    const resetHandler = () => {
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      setModel(Model.fromJson(defaultJson));
    };
    const applyHandler = () => {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        try { setModel(Model.fromJson(JSON.parse(saved))); } catch { /* ignore */ }
      }
    };
    window.addEventListener("reset-layout", resetHandler);
    window.addEventListener("apply-layout", applyHandler);
    return () => {
      window.removeEventListener("reset-layout", resetHandler);
      window.removeEventListener("apply-layout", applyHandler);
    };
  }, [workspaceId]);

  useEffect(() => {
    loadEditorState(workspaceId);
    loadChannels(workspaceId);
  }, [workspaceId, loadEditorState, loadChannels]);

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

  // 最近选中的类型：issue / channel，用于 URL 参数互斥同步
  const lastSelectKindRef = useRef<'issue' | 'channel' | null>(null);

  // 点击 issue 时自动切换到 Issue Detail tab
  useEffect(() => {
    if (!activeIssueId || !userInteractedRef.current) return;
    lastSelectKindRef.current = 'issue';
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
    if (!activeChannelId || !userInteractedRef.current) return;
    lastSelectKindRef.current = 'channel';
    if (isMobile) {
      setActivePanel("chat");
    } else {
      const node = model.getNodeById("chat");
      if (node && node instanceof TabNode) {
        model.doAction(Actions.selectTab(node.getId()));
      }
    }
  }, [channelSelectSeq, activeChannelId, model, isMobile, setActivePanel]);

  // 从 URL 恢复 active issue / channel（刷新或外部链接进入时）；二者互斥，channelId 优先
  useEffect(() => {
    const urlIssueId = searchParams.get("issueId");
    const urlChannelId = searchParams.get("channelId");
    if (urlChannelId && urlChannelId !== activeChannelId) {
      setActiveChannel(urlChannelId);
      lastSelectKindRef.current = 'channel';
    } else if (!urlChannelId && urlIssueId && urlIssueId !== activeIssueId) {
      setActiveIssue(urlIssueId);
      lastSelectKindRef.current = 'issue';
    } else {
      return;
    }
    // URL 进入时绕过 userInteracted 限制，直接切到对应 tab
    const tabId = urlChannelId ? "chat" : "issue-detail";
    if (isMobile) {
      setActivePanel(tabId);
    } else {
      const node = model.getNodeById(tabId);
      if (node && node instanceof TabNode) model.doAction(Actions.selectTab(node.getId()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 用户点击 issue / channel 后，把 active id 同步进 URL（issueId / channelId 互斥）
  const lastUrlSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userInteractedRef.current) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("issueId");
    params.delete("channelId");
    const kind = lastSelectKindRef.current;
    if (kind === 'issue' && activeIssueId) params.set("issueId", activeIssueId);
    else if (kind === 'channel' && activeChannelId) params.set("channelId", activeChannelId);
    const qs = params.toString();
    if (qs === lastUrlSyncRef.current) return;
    lastUrlSyncRef.current = qs;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [activeIssueId, activeChannelId, searchParams, pathname, router]);

  // 打开文件时自动切换到 Code Editor tab，关闭最后一个文件时切换回 Workfolder tab
  useEffect(() => {
    if (!userInteractedRef.current) return;
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
    if (!revealPath || !userInteractedRef.current) return;
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
    startActivityLogListeners(workspaceId);
    const notificationStore = useNotificationStore.getState();
    notificationStore.load(workspaceId);
    const unsubs = [
      ws.on('issue.created', (data) => upsertIssue(data as Issue)),
      ws.on('issue.updated', (data) => upsertIssue(data as Issue)),
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
        upsertTask(task);
        const ns = getNativeNotificationConfig();
        if (ns?.native?.androidOngoingTaskNotification) {
          sendAndroidOngoingTaskNotification(formatOngoingTaskNotificationBody(task));
        }
      }),
      ws.on('task.updated', (data) => {
        const task = data as Task;
        upsertTask(task);
        const ns = getNativeNotificationConfig();
        if (ns?.native?.androidOngoingTaskNotification) {
          sendAndroidOngoingTaskNotification(formatOngoingTaskNotificationBody(task));
        }
      }),
      ws.on('task.status_changed', (data) => {
        const activeIssueId = useIssueStore.getState().activeIssueId;
        if (activeIssueId) {
          loadTasks(workspaceId, activeIssueId);
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
        useInspectorHistoryStore.getState().setPendingJump({
          workspaceId,
          path,
          line,
          column: normalizedColumn,
        });
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      stopActivityLogListeners(workspaceId);
    };
  }, [workspaceId, upsertIssue, upsertTask, loadTasks, getNativeNotificationConfig, formatOngoingTaskNotificationBody]);

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
        case "worktree-panel":
          return <WorktreePanel workspaceId={workspaceId} />;
        case "activity-log":
          return <ActivityLogPanel workspaceId={workspaceId} />;
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
      // 持久化布局（含 SELECT_TAB，保留 tab 选中状态）
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(_model.toJson()));
      } catch { /* quota exceeded — ignore */ }

      if (action.type !== Actions.SELECT_TAB) return;
      if (!userInteractedRef.current) return;
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
        <AddFavoriteDialog />
        <SendToChannelDialog />
        <SendToIssueDialog />
        <InspectorActionDialog />
        <ChannelDialog
          open={channelCreateOpen}
          onOpenChange={(open) => { if (!open) setChannelCreateOpen(false); }}
          workspaceId={workspaceId}
          agents={agents}
          onSubmit={(data) => createChannel(workspaceId, data.name, data.type, data.members, data.initialMessage)}
        />
        <CreateIssueDialog
          open={issueCreateOpen}
          onOpenChange={(open) => { if (!open) setIssueCreateOpen(false); }}
          agents={agents}
          onSubmit={(data) => createIssue(workspaceId, data.title, data.description, data.members, data.workflowId)}
        />
      </div>
    );
  }

  return (
    <div className="workspace-flexlayout-shell relative h-full w-full bg-sidebar">
      <Layout model={model} factory={factory} onRenderTab={onRenderTab} onModelChange={onModelChange} />
      <AddFavoriteDialog />
      <SendToChannelDialog />
      <SendToIssueDialog />
      <InspectorActionDialog />
      <ChannelDialog
        open={channelCreateOpen}
        onOpenChange={(open) => { if (!open) setChannelCreateOpen(false); }}
        workspaceId={workspaceId}
        agents={agents}
        onSubmit={(data) => createChannel(workspaceId, data.name, data.type, data.members, data.initialMessage)}
      />
      <CreateIssueDialog
        open={issueCreateOpen}
        onOpenChange={(open) => { if (!open) setIssueCreateOpen(false); }}
        agents={agents}
        onSubmit={(data) => createIssue(workspaceId, data.title, data.description, data.members, data.workflowId)}
      />
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
