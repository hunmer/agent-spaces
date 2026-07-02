'use client';

import { useEffect, useState } from 'react';
import type { AgentConfig } from '@agent-spaces/shared';
import { cn } from '@/lib/utils';
import { resolveServerAssetUrl } from '@/lib/server';
import { useAgentStore } from '@/stores/agent';
import { getProviderIconUrlById } from '@/lib/provider-icon';
import { useResolvedAgentIcon } from '@/hooks/use-resolved-agent-icon';
import { MemberHoverCard } from '@/components/chat/member-hover-card';

export interface AgentIconProps {
  agentId?: string;
  name?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  modelId?: string;
  providerId?: string;
  modelProvider?: string;
  className?: string;
  onClick?: () => void;
  bordered?: boolean;
  rounded?: string;
  textSize?: string;
  hoverCard?: boolean;
  hoverSide?: "top" | "bottom" | "left" | "right";
}

export function colorFromName(value: string, saturation = 65, lightness = 50): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function AgentIcon({
  agentId,
  name,
  avatarUrl,
  icon,
  apiBase,
  modelId,
  providerId,
  modelProvider,
  className,
  onClick,
  bordered = true,
  rounded: roundedClass = 'rounded-lg',
  textSize,
  hoverCard = false,
  hoverSide = "top",
}: AgentIconProps) {
  const agents = useAgentStore((state) => state.agents);
  const [avatarError, setAvatarError] = useState(false);
  const [providerError, setProviderError] = useState(false);

  const agent = agentId ? agents.find((item) => item.id === agentId) : undefined;
  const displayName = name || agent?.name || agentId || '?';
  const resolvedAvatarUrl = avatarUrl ?? agent?.avatarUrl;
  const resolvedIcon = icon ?? agent?.icon;
  const resolvedApiBase = apiBase ?? agent?.apiBase;
  const resolvedModelId = modelId ?? agent?.modelId;
  const resolvedProviderId = providerId ?? agent?.providerId;
  const resolvedModelProvider = (modelProvider ?? agent?.modelProvider) as AgentConfig["modelProvider"] | undefined;
  const { remoteResolved, localProviderId } = useResolvedAgentIcon({
    avatarUrl: resolvedAvatarUrl,
    icon: resolvedIcon,
    apiBase: resolvedApiBase,
    modelId: resolvedModelId,
    providerId: resolvedProviderId,
    modelProvider: resolvedModelProvider,
  });

  useEffect(() => {
    setAvatarError(false);
    setProviderError(false);
  }, [resolvedAvatarUrl, resolvedIcon, resolvedApiBase, resolvedModelId, resolvedProviderId, resolvedModelProvider]);

  const avatarSrc = !avatarError && resolvedAvatarUrl ? resolveServerAssetUrl(resolvedAvatarUrl) : '';
  const remoteImageSrc = !providerError && remoteResolved?.kind === "image"
    ? resolveServerAssetUrl(remoteResolved.value)
    : '';
  const localProviderSrc = localProviderId && !providerError ? getProviderIconUrlById(localProviderId) : '';
  const providerSrc = remoteImageSrc || (!remoteResolved && localProviderSrc);
  const showEmoji = !avatarSrc && (
    Boolean(resolvedIcon) ||
    (remoteResolved?.kind === "emoji" && Boolean(remoteResolved.value))
  );
  const emojiValue = resolvedIcon || (remoteResolved?.kind === "emoji" ? remoteResolved.value : "");
  const src = avatarSrc || (!showEmoji && providerSrc);
  const initial = displayName.charAt(0).toUpperCase();

  const handleError = () => {
    if (!avatarError && resolvedAvatarUrl) {
      setAvatarError(true);
      return;
    }
    setProviderError(true);
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
        <span className={cn("select-none leading-none", textSize ?? "text-sm")}>{emojiValue}</span>
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
