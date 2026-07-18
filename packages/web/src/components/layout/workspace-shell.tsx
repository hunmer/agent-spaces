"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams, usePathname } from "next/navigation";
import { TerminalSquare, Puzzle } from "lucide-react";
import { Model, TabNode, IJsonModel, Actions, ITabRenderValues, Action } from "flexlayout-react";
import { FlexLayoutShell, type AddableComponent } from "@/components/common/flex-layout-shell";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import {
  LAYOUT_STORAGE_KEY,
  LAYOUT_TEMPLATES_KEY,
  applyLayoutToStorage,
} from "@/lib/layout-templates";
import { useJoyride, STATUS } from "react-joyride";
import type { Status, Step } from "react-joyride";
import { RIGHT_TO_LEFT_TAB_MAP, renderTabIcon } from "./tab-config";

import { getWS } from "@/lib/ws";
import { useIssueStore } from "@/stores/issue";
import { useEditorStore } from "@/stores/editor";
import { useChannelStore } from "@/stores/channel";
import { useGitStore } from "@/stores/git";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { startActivityLogListeners, stopActivityLogListeners } from "@/stores/activity-log";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTerminalStore } from "@/stores/terminal";
import { useAgentStore } from "@/stores/agent";
import { sendNativeNotification } from "@/lib/native-notification";
import { useNotificationStore } from "@/stores/notification";
import { useInspectorHistoryStore } from "@/stores/inspector-history";
import type { Issue, IssueStatusChangedPayload, AppNotification } from "@agent-spaces/shared";
import type { MiniAppProject } from "@agent-spaces/sdk";
import { sdk } from "@/lib/sdk";

const WORKSPACE_TOUR_KEY = "agent-spaces:workspace-tour-completed";
const EMPTY_MINI_APP_IDS: string[] = [];
type LayoutJsonNode = { type?: string; component?: string; name?: string; id?: string; children?: LayoutJsonNode[] };

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
const SingleTerminal = dynamic(() => import("@/components/terminal/single-terminal").then((mod) => mod.SingleTerminal), {
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
const CliSessionList = dynamic(() => import("@/components/cli/cli-session-list").then((mod) => mod.CliSessionList), {
  ssr: false,
  loading: panelLoader,
});
const CliPanel = dynamic(() => import("@/components/cli/cli-panel").then((mod) => mod.CliPanel), {
  ssr: false,
  loading: panelLoader,
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
          { type: "tab", name: "CLI Sessions", component: "cli-list", id: "cli-list" },
        ],
      },
      {
        type: "tabset",
        weight: 0.75,
        children: [
          { type: "tab", name: "Code Editor", component: "code-editor", id: "code-editor" },
          { type: "tab", name: "Chat", component: "chat", id: "chat" },
          { type: "tab", name: "Issue Detail", component: "issue-detail", id: "issue-detail" },
          { type: "tab", name: "CLI", component: "cli-panel", id: "cli-panel" },
        ],
      },
    ],
  },
};

// 工具栏「添加 Tab」可加入的面板清单：单终端（独立 xterm）+ 当前 workspace 选用的 miniApp
const WORKSPACE_STATIC_ADDABLE: AddableComponent[] = [
  { key: "single-terminal", name: "Terminal", icon: <TerminalSquare className="size-4" /> },
];

interface WorkspaceShellProps {
  workspaceId: string;
  boundDirs: string[];
}

export function WorkspaceShell({ workspaceId, boundDirs }: WorkspaceShellProps) {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // ===== 各 tab 引导介绍 (react-joyride) =====
  const [runTour, setRunTour] = useState(false);
  const tTour = useTranslations("workspaceShell.tour");

  const tourSteps: Step[] = useMemo(() => [
    {
      target: '[data-tour-tab="project-settings"]',
      content: tTour("projectSettings"),
      title: tTour("projectSettingsTitle"),
      placement: "right",
      skipBeacon: true,
    },
    {
      target: '[data-tour-tab="channel-list"]',
      content: tTour("channelList"),
      title: tTour("channelListTitle"),
      placement: "right",
    },
    {
      target: '[data-tour-tab="issue-list"]',
      content: tTour("issueList"),
      title: tTour("issueListTitle"),
      placement: "right",
    },
    {
      target: '[data-tour-tab="workfolder"]',
      content: tTour("workfolder"),
      title: tTour("workfolderTitle"),
      placement: "right",
    },
    {
      target: '[data-tour-tab="code-editor"]',
      content: tTour("codeEditor"),
      title: tTour("codeEditorTitle"),
      placement: "bottom",
    },
    {
      target: '[data-tour-tab="chat"]',
      content: tTour("chat"),
      title: tTour("chatTitle"),
      placement: "bottom",
    },
    {
      target: '[data-tour-tab="issue-detail"]',
      content: tTour("issueDetail"),
      title: tTour("issueDetailTitle"),
      placement: "bottom",
    },
    {
      target: '[data-tour-tab="terminal"]',
      content: tTour("terminal"),
      title: tTour("terminalTitle"),
      placement: "top",
    },
    {
      target: '[data-tour-tab="git-commits"]',
      content: tTour("gitCommits"),
      title: tTour("gitCommitsTitle"),
      placement: "top",
    },
    {
      target: '[data-tour-tab="worktree-panel"]',
      content: tTour("worktree"),
      title: tTour("worktreeTitle"),
      placement: "top",
    },
    {
      target: '[data-tour-tab="activity-log"]',
      content: tTour("activityLog"),
      title: tTour("activityLogTitle"),
      placement: "top",
    },
  ], [tTour]);

  const { Tour } = useJoyride({
    continuous: true,
    run: runTour,
    steps: tourSteps,
    locale: {
      back: tTour("back"),
      close: tTour("close"),
      last: tTour("last"),
      next: tTour("next"),
      skip: tTour("skip"),
    },
    options: {
      showProgress: true,
      buttons: ["back", "close", "primary", "skip"],
    },
    onEvent: (data) => {
      const finished = [STATUS.FINISHED, STATUS.SKIPPED] as readonly Status[];
      if (finished.includes(data.status)) {
        setRunTour(false);
        try { localStorage.setItem(WORKSPACE_TOUR_KEY, "1"); } catch {}
      }
    },
  });

  // 首次进入自动启动，或通过 URL 参数 ?wstour=1 强制启动
  useEffect(() => {
    if (isMobile) return;
    const force = searchParams.get("wstour") === "1";
    try {
      const done = localStorage.getItem(WORKSPACE_TOUR_KEY);
      if (force || !done) {
        const timer = setTimeout(() => setRunTour(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [isMobile, searchParams]);

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
  const issues = useIssueStore((s) => s.issues);
  const agents = useAgentStore((s) => s.agents);
  const createChannel = useChannelStore((s) => s.createChannel);
  const createIssue = useIssueStore((s) => s.createIssue);
  const workspaceMiniAppIds = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.miniAppIds ?? EMPTY_MINI_APP_IDS);
  const [workspaceMiniApps, setWorkspaceMiniApps] = useState<MiniAppProject[]>([]);
  // 工具栏「添加 Tab」下拉项：静态项 + 当前 workspace 选用的 miniApp
  const addableComponents = useMemo<AddableComponent[]>(() => {
    const miniAppItems: AddableComponent[] = workspaceMiniApps.map((project) => {
      const icon = project.icon?.trim();
      return {
        key: `mini-app:${project.id}`,
        name: project.name,
        defaultName: project.name,
        icon: icon ? (
          <span className="text-base leading-none">{icon}</span>
        ) : (
          <Puzzle className="size-4" />
        ),
      };
    });
    return [...WORKSPACE_STATIC_ADDABLE, ...miniAppItems];
  }, [workspaceMiniApps]);
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
        const borders = json.borders as { type: string; location: string; children: unknown[] }[] | undefined;
        const bottom = borders?.find((b) => b.location === 'bottom');
        if (bottom && !bottom.children.some((c) => { const t = c as Record<string, unknown>; return t.id === 'worktree-panel' || t.component === 'worktree-panel'; })) {
          bottom.children.push({ type: 'tab', name: 'Worktrees', component: 'worktree-panel', id: 'worktree-panel' });
        }
        if (bottom && !bottom.children.some((c) => { const t = c as Record<string, unknown>; return t.id === 'activity-log' || t.component === 'activity-log'; })) {
          bottom.children.push({ type: 'tab', name: 'Logger', component: 'activity-log', id: 'activity-log' });
        }
        // 迁移：把 cli-list / cli-panel 注入到对应 tabset（仅当未存在时）
        const tabsets = (json.layout?.children ?? []) as { children?: unknown[] }[];
        const has = (arr: unknown[] | undefined, id: string) =>
          !!arr?.some((c) => { const t = c as Record<string, unknown>; return t.id === id || t.component === id; });
        if (tabsets[0] && !has(tabsets[0].children, 'cli-list')) {
          tabsets[0].children = [...(tabsets[0].children ?? []), { type: 'tab', name: 'CLI Sessions', component: 'cli-list', id: 'cli-list' }];
        }
        if (tabsets[1] && !has(tabsets[1].children, 'cli-panel')) {
          tabsets[1].children = [...(tabsets[1].children ?? []), { type: 'tab', name: 'CLI', component: 'cli-panel', id: 'cli-panel' }];
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
    if (!workspaceMiniAppIds.length) {
      setWorkspaceMiniApps([]);
      return;
    }
    let cancelled = false;
    void sdk.miniApp.list().then((projects) => {
      if (!cancelled) setWorkspaceMiniApps(projects.filter((project) => workspaceMiniAppIds.includes(project.id)));
    });
    return () => { cancelled = true; };
  }, [workspaceMiniAppIds]);

  // 联动移除：workspace 不再选用的 miniApp，其已存在的 tab（含 popout 浮窗）自动删除。
  // 用 Actions.deleteTab 增量操作，避免重建 model 导致其他 tab 内容（iframe/编辑器）重载。
  useEffect(() => {
    const validIds = new Set(workspaceMiniApps.map((p) => `mini-app:${p.id}`));
    const json = model.toJson() as IJsonModel;
    const toDelete: string[] = [];
    const visit = (node: LayoutJsonNode | undefined) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'tab') {
        const comp = String(node.component ?? '');
        if (comp.startsWith('mini-app:') && !validIds.has(comp) && node.id) {
          toDelete.push(node.id);
        }
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    visit(json.layout as unknown as LayoutJsonNode);
    (json.borders ?? []).forEach((b) => (b.children ?? []).forEach(visit));
    if (toDelete.length === 0) return;
    // 逐个删除（deleteTab 每次基于当前 model 状态生效）
    toDelete.forEach((id) => {
      const n = model.getNodeById(id);
      if (n && n instanceof TabNode) model.doAction(Actions.deleteTab(id));
    });
  }, [workspaceMiniApps, model]);

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

  // 点击 issue 时自动切换到 Issue Detail tab
  useEffect(() => {
    if (!activeIssueId || !userInteractedRef.current) return;
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
    } else if (!urlChannelId && urlIssueId && urlIssueId !== activeIssueId) {
      setActiveIssue(urlIssueId);
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
  }, [workspaceId, upsertIssue, getNativeNotificationConfig]);

  const factory = useCallback(
    (node: TabNode) => {
      const comp = node.getComponent();
      if (comp?.startsWith('mini-app:')) {
        const miniAppId = comp.slice('mini-app:'.length);
        return <iframe title={node.getName()} src={`/mini-apps-preview?id=${encodeURIComponent(miniAppId)}&embedded=1`} className="size-full border-0" />;
      }
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
        case "single-terminal":
          return <SingleTerminal workspaceId={workspaceId} boundDirs={boundDirs} node={node} />;
        case "git-commits":
          return <GitCommitsPanel workspaceId={workspaceId} />;
        case "project-settings":
          return <ProjectSettingsPanel workspaceId={workspaceId} />;
        case "worktree-panel":
          return <WorktreePanel workspaceId={workspaceId} />;
        case "activity-log":
          return <ActivityLogPanel workspaceId={workspaceId} />;
        case "cli-list":
          return <CliSessionList />;
        case "cli-panel":
          return <CliPanel workspaceId={workspaceId} boundDirs={boundDirs} />;
        default:
          return <Placeholder name={node.getName()} />;
      }
    },
    [boundDirs, workspaceId],
  );

  const onRenderTab = useCallback((node: TabNode, renderValues: ITabRenderValues) => {
    const comp = node.getComponent();
    if (!comp) return;
    // mini-app tab：显示 manifest 的 icon（emoji），而非 name 文本
    if (comp.startsWith('mini-app:')) {
      const miniAppId = comp.slice('mini-app:'.length);
      const project = workspaceMiniApps.find((p) => p.id === miniAppId);
      const icon = project?.icon?.trim();
      renderValues.content = (
        <span title={node.getName()} className="flex items-center justify-center" data-tour-tab={comp}>
          {icon ? <span className="text-base leading-none">{icon}</span> : node.getName()}
        </span>
      );
      return;
    }
    const content = renderTabIcon(comp, node.getName(), gitStatus, terminalSessions, channelMessages, issues);
    if (content) renderValues.content = content;
  }, [gitStatus, terminalSessions, channelMessages, issues, workspaceMiniApps]);

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

      // 切 tab 时同步 URL：issueId / channelId 互斥
      const params = new URLSearchParams(window.location.search);
      params.delete("issueId");
      params.delete("channelId");
      if (comp === "issue-detail") {
        const id = useIssueStore.getState().activeIssueId;
        if (id) params.set("issueId", id);
      } else if (comp === "chat") {
        const id = useChannelStore.getState().activeChannelId;
        if (id) params.set("channelId", id);
      }
      const qs = params.toString();
      window.history.replaceState(window.history.state, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [workspaceId, pathname],
  );

  if (isMobile) {
    return (
      <div className="relative h-full w-full">
        <MobilePanelRenderer panel={activePanel} workspaceId={workspaceId} boundDirs={boundDirs} />
        <SendToChannelDialog />
        <SendToIssueDialog />
        <InspectorActionDialog />
        <ChannelDialog
          open={channelCreateOpen}
          onOpenChange={(open) => { if (!open) setChannelCreateOpen(false); }}
          workspaceId={workspaceId}
          agents={agents}
          onSubmit={(data) => createChannel(workspaceId, data.name, data.type, data.members, data.initialMessage, data.teamIds)}
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
      <FlexLayoutShell
        storageKey="agent-spaces:workspace"
        templatesStorageKey={LAYOUT_TEMPLATES_KEY}
        headerTitle={<WorkspaceSwitcher workspaceId={workspaceId} />}
        // 受控模式：model / factory / onRenderTab / onModelChange 全部由 workspace-shell 管理
        model={model}
        factory={factory}
        onRenderTab={onRenderTab}
        onModelChangeExternal={onModelChange}
        // 预设复用侧边栏既有的数据源与事件机制
        onApplyLayout={(json) => applyLayoutToStorage(json)}
        onResetLayout={() => window.dispatchEvent(new CustomEvent("reset-layout"))}
        // 可添加的面板
        addableComponents={addableComponents}
      />
      <SendToChannelDialog />
      <SendToIssueDialog />
      <InspectorActionDialog />
      <ChannelDialog
        open={channelCreateOpen}
        onOpenChange={(open) => { if (!open) setChannelCreateOpen(false); }}
        workspaceId={workspaceId}
        agents={agents}
        onSubmit={(data) => createChannel(workspaceId, data.name, data.type, data.members, data.initialMessage, data.teamIds)}
      />
      <CreateIssueDialog
        open={issueCreateOpen}
        onOpenChange={(open) => { if (!open) setIssueCreateOpen(false); }}
        agents={agents}
        onSubmit={(data) => createIssue(workspaceId, data.title, data.description, data.members, data.workflowId)}
      />
      {Tour}
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
    case "cli-list":
      return <CliSessionList />;
    case "cli-panel":
      return <CliPanel workspaceId={workspaceId} boundDirs={boundDirs} />;
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
