"use client";

import { useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { TerminalSquare } from "lucide-react";
import { Actions, type Action as FlexAction, type IJsonModel, type ILayoutApi, type ITabRenderValues, type Model, type TabNode } from "flexlayout-react";
import { FlexLayoutShell, type AddableComponent } from "@/components/common/flex-layout-shell";
import { CliLauncher } from "@/components/cli/cli-launcher";
import { CLI_PANEL_STORAGE_PREFIX, useCliSessionsStore } from "@/stores/cli-sessions";
import { notifyCliTabsChanged } from "@/lib/cli-panel-layout";
import { getCliIconUrl } from "@/lib/cli-icons";

// 终端组件异步加载（xterm 仅浏览器端）
const SingleTerminal = dynamic(
  () => import("@/components/terminal/single-terminal").then((m) => m.SingleTerminal),
  { ssr: false, loading: () => <div className="p-4 text-sm text-muted-foreground">Loading terminal…</div> },
);

interface CliPanelProps {
  workspaceId: string;
  boundDirs: string[];
}

/**
 * 全局 layout API 桥：cli-panel 渲染时把当前激活会话的 ILayoutApi 暴露出来，
 * cli-list 通过它对 tab 做命令式操作（选中）。
 * 同一时刻只有激活会话的 panel 在挂载，因此单一 ref 即可。
 */
const activeLayoutApiRef: { current: { sessionId: string; api: ILayoutApi } | null } = { current: null };

/** 供 cli-list 调用：选中激活会话中的某个 tab */
export function selectActiveSessionTab(tabId: string): boolean {
  const entry = activeLayoutApiRef.current;
  if (!entry) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (entry.api as any).getModel?.() as Model | undefined;
    if (!model) return false;
    const node = model.getNodeById?.(tabId);
    if (!node) return false;
    model.doAction(Actions.selectTab(tabId));
    return true;
  } catch {
    return false;
  }
}

/** 供 cli-list 调用：删除激活会话中的某个 tab */
export function closeActiveSessionTab(tabId: string): boolean {
  const entry = activeLayoutApiRef.current;
  if (!entry) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (entry.api as any).getModel?.() as Model | undefined;
    if (!model) return false;
    const node = model.getNodeById?.(tabId);
    if (!node) return false;
    model.doAction(Actions.deleteTab(tabId));
    return true;
  } catch {
    return false;
  }
}

/**
 * CLI Panel（cli-panel tab 内容）。
 *
 * - 读取 cli-sessions store 的 activeId；无激活会话 → 空态
 * - 每个会话对应独立 storageKey 的 FlexLayoutShell（uncontrolled），
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

  const layoutApiRef = useRef<ILayoutApi | null>(null);

  // 每个会话的默认布局：单个 single-terminal
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
   * config.cliId 用于 cli-list 显示对应图标。
   */
  const handlePickCli = useCallback((command: string, label: string, cliId: string) => {
    layoutApiRef.current?.addTabToActiveTabSet({
      component: "single-terminal",
      name: label,
      config: { pendingCommand: command, cliId },
      enableClose: true,
      enablePopout: true,
    });
  }, []);

  // layout 变更（增删 tab / 选中 / 移动）→ 持久化到 localStorage + 通知 cli-list 刷新。
  // 注意：FlexLayoutShell 在传入 onModelChangeExternal 时会跳过自身的 localStorage 写入，
  // 由本回调负责持久化，否则 cli-list 从 localStorage 读出的 tabs 永远为空。
  const handleModelChange = useCallback(
    (model: Model, _action: FlexAction) => {
      if (!activeId) return;
      try {
        localStorage.setItem(
          CLI_PANEL_STORAGE_PREFIX + activeId + ":layout",
          JSON.stringify(model.toJson()),
        );
      } catch {
        /* ignore */
      }
      notifyCliTabsChanged(activeId);
      touchTabs();
    },
    [activeId, touchTabs],
  );

  // 把 layoutApi 写入全局桥（给 cli-list 命令式调用）
  const handleApiRef = useCallback(
    (api: ILayoutApi | null) => {
      layoutApiRef.current = api;
      if (api && activeId) {
        activeLayoutApiRef.current = { sessionId: activeId, api };
      } else if (!api && activeLayoutApiRef.current?.sessionId === activeId) {
        activeLayoutApiRef.current = null;
      }
    },
    [activeId],
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

  if (!activeId || !activeSession) {
    return (
      <div
        className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
        data-tour-tab="cli-panel"
      >
        <div className="flex flex-col gap-1">
          <TerminalSquare className="mx-auto size-8 opacity-40" />
          <p>No active CLI session.</p>
          <p>Create or select one from the &quot;CLI Sessions&quot; tab on the left.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full" data-tour-tab="cli-panel">
      <FlexLayoutShell
        key={activeId}
        storageKey={CLI_PANEL_STORAGE_PREFIX + activeId}
        defaultLayout={defaultLayout}
        addableComponents={addableComponents}
        components={components}
        title={`CLI · ${activeSession.name}`}
        layoutApiRef={layoutApiRef}
        headerEnd={<CliLauncher onPick={handlePickCli} />}
        onModelChangeExternal={handleModelChange}
        onRenderTab={handleRenderTab}
      />
    </div>
  );
}
