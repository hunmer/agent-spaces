"use client";

import type { AgentConfig } from "@agent-spaces/shared";
import { Loader2, Trash2, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AgentIcon } from "@/components/common/agent-icon";

export type TeamMemberRole = "owner" | "admin" | "member" | "observer";

/** 通用 agent 渲染所需的最小数据（来自 AgentConfig） */
export interface MemberAgent {
  id: string;
  name?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  modelId?: string;
  providerId?: string;
  modelProvider?: string;
}

export interface TeamMemberRowProps {
  agent?: MemberAgent;
  /** 显示名（已解析，优先于 agent.name） */
  name?: string;
  /** 角色徽章，不传则不显示 */
  role?: TeamMemberRole;
  /** 选择模式：渲染 checkbox，点击行触发 onToggle */
  selected?: boolean;
  /** 选中切换回调（选择模式） */
  onToggle?: () => void;
  /** 移除回调（展示模式），传入则显示移除按钮 */
  onRemove?: () => void;
  /** 该行处于 loading（如删除中） */
  busy?: boolean;
  /** 交互变体：select = 列表内可选（checkbox + hover）；display = 仅展示 + 移除按钮 */
  variant?: "select" | "display";
}

function roleBadgeClass(role: TeamMemberRole): string {
  switch (role) {
    case "owner":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600";
    case "admin":
      return "border-blue-500/40 bg-blue-500/10 text-blue-600";
    default:
      return "";
  }
}

function resolveAgent(agent: MemberAgent | undefined, fallbackId: string): MemberAgent {
  return agent ?? { id: fallbackId };
}

/**
 * 通用团队成员行：头像 + 名称 + 角色 Badge + 选择/移除控件。
 * 被 TeamMemberList（展示模式）与 CreateTeamDialog（选择模式）共用。
 */
export function TeamMemberRow({
  agent,
  name,
  role,
  selected = false,
  onToggle,
  onRemove,
  busy = false,
  variant = "display",
}: TeamMemberRowProps) {
  const a = resolveAgent(agent, name ?? "");
  const displayName = name ?? a.name ?? a.id;
  const isOwner = role === "owner";

  const inner = (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
      <AgentIcon
        agentId={a.id}
        name={displayName}
        avatarUrl={a.avatarUrl}
        icon={a.icon}
        apiBase={a.apiBase}
        modelId={a.modelId}
        providerId={a.providerId}
        modelProvider={a.modelProvider}
        className="size-6 shrink-0"
        bordered={false}
        hoverCard
      />
      <span className="min-w-0 flex-1 truncate text-sm">{displayName}</span>
      {role ? (
        <Badge variant="outline" className={`gap-1 px-1.5 py-0 text-xs ${roleBadgeClass(role)}`}>
          {isOwner && <Crown className="size-3" />}
          {role}
        </Badge>
      ) : null}
      {variant === "select" ? (
        <Checkbox
          checked={selected}
          tabIndex={-1}
          aria-hidden
          className="shrink-0 pointer-events-none"
        />
      ) : null}
      {variant === "display" && onRemove ? (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      ) : null}
    </div>
  );

  if (variant === "select") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle?.();
          }
        }}
        className="block w-full cursor-pointer text-left"
      >
        {inner}
      </div>
    );
  }
  return inner;
}

/** 从 AgentConfig 列表构建 MemberAgent 映射，便于按 id 查找 */
export function buildAgentMap(agents: Array<Pick<AgentConfig, "id" | "name" | "avatarUrl" | "icon" | "apiBase" | "modelId" | "providerId" | "modelProvider">>) {
  return new Map(agents.map((a) => [a.id, a as MemberAgent]));
}
