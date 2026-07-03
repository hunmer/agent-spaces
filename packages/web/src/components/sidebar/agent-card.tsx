"use client";

import type { ReactNode } from "react";
import { AgentIcon } from "@/components/common/agent-icon";
import { cn } from "@/lib/utils";

export interface AgentCardProps {
  agentId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  className?: string;
  /** 名称旁的额外内容（如角色徽章、模型标识） */
  meta?: ReactNode;
  /** 右侧操作区 */
  actions?: ReactNode;
  /** 整行点击 */
  onClick?: () => void;
  /** 中间内容区点击（与 onClick 独立，用于编辑等场景） */
  onContentClick?: () => void;
  /** 整行置灰（如禁用状态） */
  muted?: boolean;
}

export function AgentCard({
  agentId,
  name,
  description,
  avatarUrl,
  icon,
  apiBase,
  className,
  meta,
  actions,
  onClick,
  onContentClick,
  muted,
}: AgentCardProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors",
        onClick && "cursor-pointer",
        muted && "opacity-50",
        className,
      )}
      onClick={onClick}
    >
      <AgentIcon
        agentId={agentId}
        name={name}
        avatarUrl={avatarUrl}
        icon={icon}
        apiBase={apiBase}
        className="size-8"
      />
      <div
        className={cn(
          "flex-1 min-w-0",
          onContentClick && "cursor-pointer",
        )}
        onClick={onContentClick ? (e) => { e.stopPropagation(); onContentClick(); } : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {meta}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {description}
        </p>
      </div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
