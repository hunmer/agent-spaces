"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { TerminalSquare } from "lucide-react";
import { Actions, DockLocation, Model, type Action as FlexAction, type IJsonModel, type ILayoutApi, type ITabRenderValues, type TabNode } from "flexlayout-react";
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
 * 全局 model 桥：cli-panel 渲染时把当前激活会话的 Model 暴露出来，
 * cli-list 通过它对 tab 做命令式操作（选中/关闭）。
 * 同一时刻只有激活会话的 panel 在挂载，因此单一槽位即可。
 */
const activeModelSlot: { current: { sessionId: string; model: Model } | null } = { current: null };

/** 供 cli-list 调用：选中激活会话中的某个 tab，返回是否成功 */
export function selectActiveSessionTab(tabId: string): boolean {
  const entry = activeModelSlot.current;
  if (!entry) return false;
  try {
    const node = entry.model.getNodeById(tabId);
    if (!node) return false;
    entry.model.doAction(Actions.selectTab(tabId));
    return true;
  } catch {
    return false;
  }
}

/** 供 cli-list 调用：删除激活会话中的某个 tab */
export function closeActiveSessionTab(tabId: string): boolean {
  const entry = activeModelSlot.current;
  if (!entry) return false;
  try {
    const node = entry.model.getNodeById(tabId);
    if (!node) return false;
    entry.model.doAction(Actions.deleteTab(tabId));
    return true;
  } catch {
    return false;
  }
}

/**
 * 供 cli-list 调用：在 panel 挂载后选中某个 tab。
 * 切换 session 时 panel 会以 key={activeId} 重挂，model 短暂不可用；
 * 本函数以 rAF 轮询重试，最多等 500ms。
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

/**
 * CLI Panel（cli-panel tab 内容）。
 *
 * - 读取 cli-sessions store 的 activeId；无激活会话 → 空态
 * - 每个会话对应独立 storageKey 的 FlexLayoutShell（受控模式），由本组件持有 Model；
 *   切换会话时通过 key={activeId} 整体重挂载，布局/终端状态天然隔离
 * - 工具栏「+」添加普通 single-terminal；工具栏右侧 CliLauncher 用于
 *   选中已检测到的 CLI → 新建终端并自动执行其 command
 */
export function CliPanel({ workspaceId, boundDirs }: CliPanelProps) {
  const activeId = useCliSessionsStore((s) => s.activeId);
  const activeSession = useCliSessionsStore((s) =>
    s.activeId ? s.sessions.find((x) => x.id === s.activeId) ?? null : null,
  );
  const touchTabs = useCliSessionsStore((s) => s.touchTabs);
  const t = useTranslations("cli.panel");
  // 每次 layout 变更 touchTabs 会自增，订阅它即可随布局变化重算空状态
  const tabVersion = useCliSessionsStore((s) => s.tabVersion);

  const layoutApiRef = useRef<ILayoutApi | null>(null);

  // 每个会话的默认布局：空 row（用户主动通过 + 或 CLI 创建 terminal）
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

  // 受控 model：从 localStorage 恢复，否则用 defaultLayout。
  // key={activeId} 让本组件整体在切换 session 时重挂，state 自然重置。
  const [model, setModel] = useState<Model>(() => {
    const saved = activeId ? readSavedLayout(activeId) : null;
    return Model.fromJson(saved ?? defaultLayout);
  });

  // 把 model 注册到全局槽位（供 cli-list 命令式调用）
  useEffect(() => {
    if (!activeId) {
      activeModelSlot.current = null;
      return;
    }
    activeModelSlot.current = { sessionId: activeId, model };
    return () => {
      if (activeModelSlot.current?.sessionId === activeId) {
        activeModelSlot.current = null;
      }
    };
  }, [activeId, model]);

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
   * 由终端会话创建完毕后 sendInput 执行；
   * config.cliId 用于 cli-list / tab header 显示对应图标。
   */
  const handlePickCli = useCallback((command: string, label: string, cliId: string) => {
    // 受控模式下直接用 model.doAction 添加；空布局时重建为含 tabset 的布局。
    const m = activeModelSlot.current?.model;
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
        if (activeId) {
          try {
            localStorage.setItem(layoutKey(activeId), JSON.stringify(nextJson));
          } catch { /* ignore */ }
        }
      }
    } catch {
      /* ignore */
    }
  }, [activeId]);

  // layout 变更 → 持久化 + 通知 cli-list 刷新 tab 列表
  // 受控模式下 model 是 mutable 的，不需要 setModel；只持久化 + 通知即可
  const handleModelChange = useCallback(
    (nextModel: Model, _action: FlexAction) => {
      if (!activeId) return;
      try {
        localStorage.setItem(layoutKey(activeId), JSON.stringify(nextModel.toJson()));
      } catch {
        /* ignore */
      }
      notifyCliTabsChanged(activeId);
      touchTabs();
    },
    [activeId, touchTabs],
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

  // 判断当前 model 是否为空（无任何 tab 节点）。
  // tabVersion 变化会重新计算（handleModelChange 已 touchTabs）。
  const isEmpty = useMemo(() => {
    // 触发依赖
    void tabVersion;
    const m = activeModelSlot.current?.sessionId === activeId ? activeModelSlot.current?.model : null;
    if (!m) return true;
    let hasTab = false;
    try {
      // 遍历整棵树寻找 tab 节点
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
      hasTab = visit(m.getRootRow());
    } catch {
      /* ignore */
    }
    return !hasTab;
  }, [activeId, tabVersion, model]);

  if (!activeId || !activeSession) {
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
      <FlexLayoutShell
        key={activeId}
        storageKey={CLI_PANEL_STORAGE_PREFIX + activeId}
        defaultLayout={defaultLayout}
        addableComponents={addableComponents}
        components={components}
        title={t("title", { name: activeSession.name })}
        layoutApiRef={layoutApiRef}
        headerEnd={<CliLauncher onPick={handlePickCli} />}
        model={model}
        onModelChangeExternal={handleModelChange}
        onRenderTab={handleRenderTab}
      />
      {isEmpty && (
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
