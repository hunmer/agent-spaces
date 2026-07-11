import type { WorkflowTemplate } from "@agent-spaces/shared";

export const PANEL_ID_LIST = "team-list";
export const PANEL_ID_CHAT = "team-chat";
export const PANEL_ID_DETAIL = "team-detail";

// 三栏布局持久化（百分比 Layout，见 docs/ui/react-resizable-panels-size-units.md）
export const LAYOUT_KEY = "team-management:layout";
export const DEFAULT_LAYOUT: Record<string, number> = {
  [PANEL_ID_LIST]: 25,
  [PANEL_ID_CHAT]: 40,
  [PANEL_ID_DETAIL]: 35,
};

export function loadSavedLayout(): Record<string, number> {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, number> : null;
    if (!parsed) return DEFAULT_LAYOUT;
    // 合并默认值，避免新增 panel id 时缺字段
    return { ...DEFAULT_LAYOUT, ...parsed };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function extractAgentRunIds(workflow: WorkflowTemplate): string[] {
  const ids: string[] = [];
  for (const node of workflow.nodes ?? []) {
    if (node.type !== "agent" && node.type !== "agent_run") continue;
    const data = node.data ?? {};
    // 兼容两种数据结构：
    // 1. 内联 agent 定义：node.data.agent.id
    // 2. 引用模式：node.data.agentConfigId
    const agentObj = data.agent as { id?: unknown } | undefined;
    const fromAgent = agentObj && typeof agentObj.id === "string" ? agentObj.id.trim() : "";
    const fromConfigId = typeof data.agentConfigId === "string" ? data.agentConfigId.trim() : "";
    const id = fromAgent || fromConfigId;
    if (id) ids.push(id);
  }
  const result = Array.from(new Set(ids));
  // eslint-disable-next-line no-console
  console.log("[extractAgentRunIds]", { workflowName: workflow.name, nodeCount: (workflow.nodes ?? []).length, extractedIds: result });
  return result;
}

export function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
