"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { TerminalSquare } from "lucide-react";
import { Actions, DockLocation, Model, type Action as FlexAction, type ILayoutApi, type IJsonModel, type ITabRenderValues, type TabNode } from "flexlayout-react";
import { FlexLayoutShell, type AddableComponent } from "@/components/common/flex-layout-shell";
import { CliLauncher } from "@/components/cli/cli-launcher";
import { CLI_PANEL_STORAGE_PREFIX, useCliSessionsStore } from "@/stores/cli-sessions";
import { notifyCliTabsChanged } from "@/lib/cli-panel-layout";
import { getCliIconUrl } from "@/lib/cli-icons";

// 终端组件异步加载（xterm 仅浏览器端）
function TerminalLoading() {
  const t = useTranslations("cli.panel");
  return <div className="p-4 text-sm text-muted-foreground">{t("loadingTerminal")}</div>;
}
const SingleTerminal = dynamic(
  () => import("@/components/terminal/single-terminal").then((m) => m.SingleTerminal),
  { ssr: false, loading: () => <TerminalLoading /> },
);

interface CliPanelProps {
  workspaceId: string;
  boundDirs: string[];
}

/**
 * 全局 model 桥：保存所有已挂载 session 的 Model，按 sessionId 索引。
 * cli-list 通过它对激活会话的 tab 做命令式操作（选中/关闭）。
 * 多 session 常驻后，多个 Model 同时存在，按 sessionId 精确路由。
 */
const sessionModels: Map<string, Model> = new Map();

/** 供 cli-list 调用：选中激活会话中的某个 tab，返回是否成功 */
export function selectActiveSessionTab(tabId: string): boolean {
  const activeId = useCliSessionsStore.getState().activeId;
  if (!activeId) return false;
  const model = sessionModels.get(activeId);
  if (!model) return false;
  try {
    const node = model.getNodeById(tabId);
    if (!node) return false;
    model.doAction(Actions.selectTab(tabId));
    return true;
  } catch {
    return false;
  }
}

/** 供 cli-list 调用：删除激活会话中的某个 tab */
export function closeActiveSessionTab(tabId: string): boolean {
  const activeId = useCliSessionsStore.getState().activeId;
  if (!activeId) return false;
  const model = sessionModels.get(activeId);
  if (!model) return false;
  try {
    const node = model.getNodeById(tabId);
    if (!node) return false;
    model.doAction(Actions.deleteTab(tabId));
    return true;
  } catch {
    return false;
  }
}

/**
 * 供 cli-list 调用：在 panel 挂载后选中某个 tab。
 * 常驻保活模式下激活会话的 Model 通常已存在，但仍保留 rAF 轮询，
 * 以兼容 session 刚创建、对应 SessionPanel 尚未首次挂载的瞬时窗口。
 */
export function selectActiveSessionTabWhenReady(tabId: string, timeoutMs = 500): void {
  const start = Date.now();
  const tick = () => {
    if (selectActiveSessionTab(tabId)) return;
    if (Date.now() - start >= timeoutMs) return;
    requestAnimationFrame(tick);
  };
  tick();
}

function layoutKey(sessionId: string) {
  return CLI_PANEL_STORAGE_PREFIX + sessionId + ":layout";
}

function readSavedLayout(sessionId: string): IJsonModel | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(layoutKey(sessionId));
    return raw ? (JSON.parse(raw) as IJsonModel) : null;
  } catch {
    return null;
  }
}

/** 判断 model 是否为空（无任何 tab 节点） */
function isModelEmpty(model: Model | null): boolean {
  if (!model) return true;
  try {
    const visit = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = node as any;
      const type = typeof n.getType === "function" ? n.getType() : undefined;
      if (type === "tab") return true;
      const children = typeof n.getChildren === "function" ? n.getChildren() : [];
      for (const c of children) if (visit(c)) return true;
      return false;
    };
    return !visit(model.getRootRow());
  } catch {
    return true;
  }
}

/**
 * CLI Panel（cli-panel tab 内容）。
 *
 * - 多 session 常驻保活：所有 session 同时渲染，激活项正常显示，非激活项用
 *   `hidden` 隐藏（不卸载）。切换 session 不再触发 SingleTerminal 卸载，
 *   terminal 输出与 ws 会话天然保留；同时每个 session 的 model state 完全
 *   独立，杜绝切换/新建时错误复刻上一个 session 的布局。
 * - 每个 SessionPanel 持有各自的 Model 与 layout storageKey，互不干扰。
 */
export function CliPanel({ workspaceId, boundDirs }: CliPanelProps) {
  const sessions = useCliSessionsStore((s) => s.sessions);
  const activeId = useCliSessionsStore((s) => s.activeId);
  const t = useTranslations("cli.panel");

  if (sessions.length === 0 || !activeId) {
    return (
      <div
        className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
        data-tour-tab="cli-panel"
      >
        <div className="flex flex-col gap-1">
          <TerminalSquare className="mx-auto size-8 opacity-40" />
          <p>{t("noActiveTitle")}</p>
          <p>{t("noActiveHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" data-tour-tab="cli-panel">
      {sessions.map((session) => (
        <SessionPanel
          key={session.id}
          sessionId={session.id}
          sessionName={session.name}
          workspaceId={workspaceId}
          boundDirs={boundDirs}
          active={session.id === activeId}
        />
      ))}
    </div>
  );
}

interface SessionPanelProps {
  sessionId: string;
  sessionName: string;
  workspaceId: string;
  boundDirs: string[];
  active: boolean;
}

function SessionPanel({ sessionId, sessionName, workspaceId, boundDirs, active }: SessionPanelProps) {
  const t = useTranslations("cli.panel");
  const touchTabs = useCliSessionsStore((s) => s.touchTabs);
  // 订阅 tabVersion，确保 layout 变更后 isEmpty 重新计算
  const tabVersion = useCliSessionsStore((s) => s.tabVersion);
  const layoutApiRef = useRef<ILayoutApi | null>(null);

  const defaultLayout = useMemo<IJsonModel>(() => ({
    global: {
      tabSetEnableTabStrip: true,
      borderEnableDrop: true,
      tabEnableClose: true,
      tabEnableRename: true,
      tabSetEnableMaximize: true,
    },
    layout: {
      type: "row",
      children: [],
    },
  }), []);

  // 每个 session 独立的 model state（来自 localStorage 或默认空布局）
  const [model, setModel] = useState<Model>(() => {
    const saved = readSavedLayout(sessionId);
    return Model.fromJson(saved ?? defaultLayout);
  });

  // 注册/注销到全局 model 桥（供 cli-list 命令式调用）
  useEffect(() => {
    sessionModels.set(sessionId, model);
    return () => {
      // 仅当 map 里仍是自己时才移除，避免被后挂的同 sessionId 实例误删
      if (sessionModels.get(sessionId) === model) {
        sessionModels.delete(sessionId);
      }
    };
  }, [sessionId, model]);

  const addableComponents = useMemo<AddableComponent[]>(
    () => [{ key: "single-terminal", name: "Terminal", icon: <TerminalSquare className="size-4" /> }],
    [],
  );

  const components = useMemo(
    () => ({
      "single-terminal": (node: TabNode) => (
        <SingleTerminal workspaceId={workspaceId} boundDirs={boundDirs} node={node} />
      ),
    }),
    [workspaceId, boundDirs],
  );

  /**
   * 选中某个 CLI → 在当前激活 tabset 中追加一个 single-terminal，
   * 通过 node config.pendingCommand 把命令传给 SingleTerminal，
   * 由终端会话创建完毕后 sendInput 执行。
   */
  const handlePickCli = useCallback((command: string, label: string, cliId: string) => {
    const m = sessionModels.get(sessionId);
    if (!m) return;
    try {
      const activeTabset = m.getActiveTabset();
      if (activeTabset) {
        m.doAction(
          Actions.addNode(
            {
              component: "single-terminal",
              name: label,
              config: { pendingCommand: command, cliId },
              enableClose: true,
              enablePopout: true,
            },
            activeTabset.getId(),
            DockLocation.CENTER,
            -1,
            true,
          ),
        );
      } else {
        // 空布局：用新 json 重建（含一个 tabset 包住新 tab）
        const nextJson: IJsonModel = {
          global: {
            tabSetEnableTabStrip: true,
            borderEnableDrop: true,
            tabEnableClose: true,
            tabEnableRename: true,
            tabSetEnableMaximize: true,
          },
          layout: {
            type: "row",
            children: [
              {
                type: "tabset",
                weight: 1,
                children: [
                  {
                    component: "single-terminal",
                    name: label,
                    config: { pendingCommand: command, cliId },
                    enableClose: true,
                    enablePopout: true,
                  },
                ],
              },
            ],
          },
        };
        const next = Model.fromJson(nextJson);
        setModel(next);
        try {
          localStorage.setItem(layoutKey(sessionId), JSON.stringify(nextJson));
        } catch { /* ignore */ }
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  // layout 变更 → 持久化 + 通知 cli-list 刷新 tab 列表
  const handleModelChange = useCallback(
    (nextModel: Model, _action: FlexAction) => {
      try {
        localStorage.setItem(layoutKey(sessionId), JSON.stringify(nextModel.toJson()));
      } catch {
        /* ignore */
      }
      notifyCliTabsChanged(sessionId);
      touchTabs();
    },
    [sessionId, touchTabs],
  );

  // 自定义 tab header：用对应 CLI 图标替换默认 leading 图标
  const handleRenderTab = useCallback((node: TabNode, renderValues: ITabRenderValues) => {
    if (node.getComponent() !== "single-terminal") return;
    const config = (node.getConfig() ?? {}) as { cliId?: string };
    const url = config.cliId ? getCliIconUrl(config.cliId) : null;
    if (url) {
      renderValues.leading = (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mr-1 size-3.5 shrink-0 rounded-sm" />
      );
    } else {
      renderValues.leading = <TerminalSquare className="mr-1 size-3.5 shrink-0 opacity-70" />;
    }
  }, []);

  // 直接用本地 model 判空：初始化即从 localStorage 恢复，paint 前就绪，
  // 不依赖模块级 map（其注册 effect 在 paint 后才执行，会导致首帧误判为空）。
  const isEmpty = useMemo(() => {
    void tabVersion;
    return isModelEmpty(model);
  }, [tabVersion, model]);

  return (
    <div className={`absolute inset-0 ${active ? "" : "hidden"}`}>
      <FlexLayoutShell
        storageKey={CLI_PANEL_STORAGE_PREFIX + sessionId}
        defaultLayout={defaultLayout}
        addableComponents={addableComponents}
        components={components}
        title={t("title", { name: sessionName })}
        layoutApiRef={layoutApiRef}
        headerEnd={<CliLauncher onPick={handlePickCli} />}
        model={model}
        onModelChangeExternal={handleModelChange}
        onRenderTab={handleRenderTab}
      />
      {isEmpty && active && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card/60 px-6 py-8 text-center text-sm text-muted-foreground shadow-sm backdrop-blur-sm">
            <TerminalSquare className="size-8 opacity-40" />
            <p className="font-medium text-foreground">{t("emptyTitle")}</p>
            <p>{t("emptyHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
