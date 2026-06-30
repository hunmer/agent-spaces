'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { resolveServerAssetUrl } from '@/lib/server';
import { useAgentStore } from '@/stores/agent';
import { getProviderIdByApiBase, getProviderIdByModelId, getProviderIdByName, getProviderIconUrlById } from '@/lib/provider-icon';
import { MemberHoverCard } from '@/components/chat/member-hover-card';

export interface AgentIconProps {
  agentId?: string;
  name?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  /** 模型/供应商信息，用于在无 avatar/emoji 时展示 provider 图标 */
  modelId?: string;
  providerId?: string;
  modelProvider?: string;
  className?: string;
  onClick?: () => void;
  bordered?: boolean;
  rounded?: string;
  /** Override emoji / initial text size (default: "text-sm" / "text-xs") */
  textSize?: string;
  /** 启用后悬浮展示 agent 详情卡（需要 agentId 指向真实 agent） */
  hoverCard?: boolean;
  /** hover card 出现方位，默认 "top" */
  hoverSide?: "top" | "bottom" | "left" | "right";
}

// 基于字符串生成稳定的随机色（HSL）
export function colorFromName(value: string, saturation = 65, lightness = 50): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function AgentIcon({ agentId, name, avatarUrl, icon, apiBase, modelId, providerId, modelProvider, className, onClick, bordered = true, rounded: roundedClass = 'rounded-lg', textSize, hoverCard = false, hoverSide = "top" }: AgentIconProps) {
  const agents = useAgentStore((s) => s.agents);
  const [avatarError, setAvatarError] = useState(false);
  const [providerError, setProviderError] = useState(false);

  const agent = agentId ? agents.find((a) => a.id === agentId) : undefined;
  const displayName = name || agent?.name || agentId || '?';
  const resolvedAvatarUrl = avatarUrl ?? agent?.avatarUrl;
  const resolvedIcon = icon ?? agent?.icon;
  const resolvedApiBase = apiBase ?? agent?.apiBase;

  const avatarSrc = !avatarError && resolveServerAssetUrl(resolvedAvatarUrl);
  // 解析 provider 图标：优先显式 providerId，其次 apiBase → modelId → modelProvider
  const resolvedProviderId =
    providerId ||
    getProviderIdByApiBase(resolvedApiBase) ||
    getProviderIdByModelId(modelId) ||
    getProviderIdByName(modelProvider);
  const providerSrc = resolvedProviderId && !providerError ? getProviderIconUrlById(resolvedProviderId) : '';
  const showEmoji = !avatarSrc && !!resolvedIcon;

  // 优先级：avatar > icon (emoji) > provider icon > name initial
  const src = avatarSrc || (!showEmoji && providerSrc);

  useEffect(() => {
    setAvatarError(false);
    setProviderError(false);
  }, [resolvedAvatarUrl, resolvedApiBase, resolvedProviderId]);

  const initial = displayName.charAt(0).toUpperCase();

  const handleError = () => {
    if (!avatarError && resolvedAvatarUrl) {
      setAvatarError(true);
    } else {
      setProviderError(true);
    }
  };

  const iconEl = (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center justify-center overflow-hidden bg-muted shrink-0',
        roundedClass,
        (src || showEmoji) && 'bg-transparent',
        bordered && 'border border-border',
        !onClick && 'pointer-events-none',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className,
      )}
    >
      {src ? (
        <img src={src} alt={displayName} className="size-full object-cover" onError={handleError} />
      ) : showEmoji ? (
        <span className={cn("select-none leading-none", textSize ?? "text-sm")}>{resolvedIcon}</span>
      ) : (
        <span className={cn("font-semibold select-none", textSize ?? "text-xs")}>{initial}</span>
      )}
    </div>
  );

  if (hoverCard && agentId) {
    return (
      <MemberHoverCard agentId={agentId} displayName={displayName} side={hoverSide} align="start">
        {iconEl}
      </MemberHoverCard>
    );
  }

  return iconEl;
}
