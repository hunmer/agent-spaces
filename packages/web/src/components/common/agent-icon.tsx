'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { resolveServerAssetUrl } from '@/lib/server';
import { useAgentStore } from '@/stores/agent';
import { getProviderIconUrl } from '@/lib/provider-icon';

export interface AgentIconProps {
  agentId?: string;
  name?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  className?: string;
  onClick?: () => void;
  bordered?: boolean;
  rounded?: string;
  /** Override emoji / initial text size (default: "text-sm" / "text-xs") */
  textSize?: string;
}

export function AgentIcon({ agentId, name, avatarUrl, icon, apiBase, className, onClick, bordered = true, rounded: roundedClass = 'rounded-lg', textSize }: AgentIconProps) {
  const agents = useAgentStore((s) => s.agents);
  const [avatarError, setAvatarError] = useState(false);
  const [providerError, setProviderError] = useState(false);

  const agent = agentId ? agents.find((a) => a.id === agentId) : undefined;
  const displayName = name || agent?.name || agentId || '?';
  const resolvedAvatarUrl = avatarUrl ?? agent?.avatarUrl;
  const resolvedIcon = icon ?? agent?.icon;
  const resolvedApiBase = apiBase ?? agent?.apiBase;

  const avatarSrc = !avatarError && resolveServerAssetUrl(resolvedAvatarUrl);
  const providerSrc = !providerError ? getProviderIconUrl(resolvedApiBase) : '';
  const showEmoji = !avatarSrc && !!resolvedIcon;

  // 优先级：avatar > icon (emoji) > provider icon > name initial
  const src = avatarSrc || (!showEmoji && providerSrc);

  useEffect(() => {
    setAvatarError(false);
    setProviderError(false);
  }, [resolvedAvatarUrl, resolvedApiBase]);

  const initial = displayName.charAt(0).toUpperCase();

  const handleError = () => {
    if (!avatarError && resolvedAvatarUrl) {
      setAvatarError(true);
    } else {
      setProviderError(true);
    }
  };

  return (
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
}
