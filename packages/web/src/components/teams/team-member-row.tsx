"use client";

import type { AgentConfig } from "@agent-spaces/shared";
import { Loader2, Trash2, Crown, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AgentIcon } from "@/components/common/agent-icon";
import { MemberHoverCard } from "@/components/chat/member-hover-card";

export type TeamMemberRole = "owner" | "admin" | "member" | "observer";

export interface MemberAgent {
  id: string;
  name?: string;
  role?: string;
  description?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  modelId?: string;
  providerId?: AgentConfig["providerId"];
  modelProvider?: AgentConfig["modelProvider"];
  runtimeKind?: AgentConfig["runtimeKind"];
  systemPrompt?: string;
  backgroundUrl?: string;
  tools?: AgentConfig["tools"];
  skills?: string[];
  mcps?: Record<string, unknown>;
}

export interface TeamMemberRowProps {
  agent?: MemberAgent;
  name?: string;
  role?: TeamMemberRole;
  selected?: boolean;
  onToggle?: () => void;
  onConfigure?: () => void;
  onRemove?: () => void;
  onInboxOpen?: () => void;
  busy?: boolean;
  variant?: "select" | "display";
  unreadCount?: number;
  runtimeStatus?: "idle" | "running" | "completed" | "error";
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

export function TeamMemberRow({
  agent,
  name,
  role,
  selected = false,
  onToggle,
  onConfigure,
  onRemove,
  onInboxOpen,
  busy = false,
  variant = "display",
  unreadCount = 0,
  runtimeStatus = "idle",
}: TeamMemberRowProps) {
  const a = resolveAgent(agent, name ?? "");
  const displayName = name ?? a.name ?? a.id;
  const isOwner = role === "owner";
  // display 变体下，传入 onInboxOpen 即整行可点：打开未读消息对话框并选中该成员
  const rowClickable = variant === "display" && Boolean(onInboxOpen);

  const inner = (
    <div
      onClick={rowClickable ? onInboxOpen : undefined}
      role={rowClickable ? "button" : undefined}
      tabIndex={rowClickable ? 0 : undefined}
      onKeyDown={
        rowClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onInboxOpen?.();
              }
            }
          : undefined
      }
      className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 ${rowClickable ? "cursor-pointer" : ""}`}
    >
      <MemberHoverCard
        agentId={a.id}
        displayName={displayName}
        side="top"
        align="start"
        agent={a}
        onConfigure={onConfigure}
      >
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
        />
      </MemberHoverCard>
      <span className="min-w-0 flex-1 truncate text-sm">{displayName}</span>
      {runtimeStatus === "running" ? (
        <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-xs text-emerald-600">
          <Loader2 className="size-3 animate-spin" />
          running
        </Badge>
      ) : null}
      {unreadCount > 0 ? (
        onInboxOpen ? (
          <button
            type="button"
            tabIndex={-1}
            title="查看消息"
            onClick={(e) => {
              e.stopPropagation();
              onInboxOpen();
            }}
            className="shrink-0 cursor-pointer rounded-full transition-transform hover:scale-110"
          >
            <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-500/10 px-1.5 py-0 text-xs text-orange-600">
              <Mail className="size-3" />
              {unreadCount}
            </Badge>
          </button>
        ) : (
          <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-500/10 px-1.5 py-0 text-xs text-orange-600">
            <Mail className="size-3" />
            {unreadCount}
          </Badge>
        )
      ) : null}
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

export function buildAgentMap(
  agents: Array<
    Pick<
      AgentConfig,
      | "id"
      | "name"
      | "role"
      | "description"
      | "avatarUrl"
      | "icon"
      | "apiBase"
      | "modelId"
      | "providerId"
      | "modelProvider"
      | "runtimeKind"
      | "systemPrompt"
      | "backgroundUrl"
      | "tools"
      | "skills"
      | "mcps"
    >
  >,
) {
  return new Map(agents.map((a) => [a.id, a as MemberAgent]));
}
