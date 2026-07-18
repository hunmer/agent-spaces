/**
 * CLI panel layout 读取/订阅/选中工具。
 *
 * 每个 session 的 flex-layout json 存放在
 * `agent-spaces:cli-panel:<sessionId>:layout`（由 FlexLayoutShell 持久化）。
 * 本模块只读+订阅，供 cli-list 展示 tabs。
 */
import type { IJsonModel } from "flexlayout-react";

export interface CliTabInfo {
  /** flexlayout tab 节点 id（命令式 API 使用） */
  id: string;
  /** 显示名（tab.name） */
  name: string;
  /** 组件 key，目前固定 "single-terminal" */
  component: string;
  /** 若由 CLI 启动器创建，记录对应 CLI id，用于匹配图标 */
  cliId?: string;
}

interface JsonTabNode {
  type?: string;
  id?: string;
  name?: string;
  component?: string;
  config?: { cliId?: string; pendingCommand?: string } & Record<string, unknown>;
}

/** 递归遍历所有 tab 节点（含 layout 树 + borders） */
function collectTabs(json: IJsonModel): CliTabInfo[] {
  const out: CliTabInfo[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as JsonTabNode;
    if (n.type === "tab" && typeof n.id === "string" && typeof n.component === "string") {
      out.push({
        id: n.id,
        name: n.name ?? "Tab",
        component: n.component,
        cliId: n.config?.cliId,
      });
    }
    const children = (node as { children?: unknown[] }).children;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(json.layout);
  (json.borders ?? []).forEach((b) => (b.children ?? []).forEach(visit));
  return out;
}

/**
 * 读取指定 session 的 tab 列表。localStorage 无数据/解析失败时返回空数组。
 */
export function readCliTabs(sessionId: string): CliTabInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`agent-spaces:cli-panel:${sessionId}:layout`);
    if (!raw) return [];
    const json = JSON.parse(raw) as IJsonModel;
    return collectTabs(json);
  } catch {
    return [];
  }
}

/** 订阅指定 session 的 layout 变更（同/跨组件）。返回取消函数。 */
export function subscribeCliTabs(sessionId: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const storageHandler = (e: StorageEvent) => {
    if (e.key === `agent-spaces:cli-panel:${sessionId}:layout`) cb();
  };
  const customHandler = () => cb();
  window.addEventListener("storage", storageHandler);
  window.addEventListener(`cli-tabs-changed:${sessionId}`, customHandler);
  return () => {
    window.removeEventListener("storage", storageHandler);
    window.removeEventListener(`cli-tabs-changed:${sessionId}`, customHandler);
  };
}

/** 通知某 session 的 tab 列表已变更（cli-panel 写入后调用） */
export function notifyCliTabsChanged(sessionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(`cli-tabs-changed:${sessionId}`));
}

/** 当前激活 tab 节点 id：在 active tabset 中取第一个选中 tab */
export function readActiveTabId(sessionId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`agent-spaces:cli-panel:${sessionId}:layout`);
    if (!raw) return null;
    const json = JSON.parse(raw) as IJsonModel;
    return findActiveTabId(json);
  } catch {
    return null;
  }
}

function findActiveTabId(json: IJsonModel): string | null {
  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const n = node as { type?: string; active?: boolean; id?: string; children?: unknown[] };
    if (n.type === "tabset" && n.active === true && n.id) {
      // active tabset 的 id 与其中 active tab 的 id 一致（flexlayout-react 约定）
      return n.id;
    }
    const children = n.children;
    if (Array.isArray(children)) {
      for (const c of children) {
        const r = visit(c);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(json.layout);
}
