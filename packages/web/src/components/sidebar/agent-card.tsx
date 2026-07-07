"use client";

import type { ReactNode } from "react";
import { AgentIcon } from "@/components/common/agent-icon";
import { FeatureCard, type FeatureCardColor } from "@/components/ui/feature-card";
import { cn } from "@/lib/utils";

export interface AgentCardProps {
  agentId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  className?: string;
  /** 卡片渐变色 */
  color?: FeatureCardColor;
  /** 名称旁的额外内容（如角色徽章、模型标识） */
  meta?: ReactNode;
  /** 卡片底部操作区 */
  actions?: ReactNode;
  /** 卡片右上角内容（如开关），绝对定位 */
  corner?: ReactNode;
  /** 整卡点击 */
  onClick?: () => void;
  /** 名称/描述区点击（与 onClick 独立，用于编辑等场景） */
  onContentClick?: () => void;
  /** 整卡置灰（如禁用状态） */
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
  color = "default",
  meta,
  actions,
  corner,
  onClick,
  onContentClick,
  muted,
}: AgentCardProps) {
  return (
    <FeatureCard
      color={color}
      onClick={onClick}
      className={cn("min-h-[176px] p-3", muted && "opacity-50", className)}
    >
      {corner && (
        <div
          className="absolute right-2 top-2 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {corner}
        </div>
      )}
      {/* 图标区：占据上半部分并居中，用文档流布局避免与底部文字重叠 */}
      <div className="flex flex-1 items-center justify-center py-2">
        <AgentIcon
          agentId={agentId}
          name={name}
          avatarUrl={avatarUrl}
          icon={icon}
          apiBase={apiBase}
          className="size-16 transition-transform duration-300 group-hover:scale-125"
        />
      </div>

      {/* 文字区：底部，与图标区天然分离 */}
      <div
        className={cn("text-center", onContentClick && "cursor-pointer")}
        onClick={
          onContentClick
            ? (e) => {
                e.stopPropagation();
                onContentClick();
              }
            : undefined
        }
      >
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{name}</span>
          {meta}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1 min-h-[2rem]">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {actions}
        </div>
      )}
    </FeatureCard>
  );
}
