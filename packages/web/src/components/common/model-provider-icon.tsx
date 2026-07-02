"use client";

import { cn } from "@/lib/utils";
import { resolveServerAssetUrl } from "@/lib/server";
import { getProviderIconUrlById } from "@/lib/provider-icon";
import { useResolvedAgentIcon } from "@/hooks/use-resolved-agent-icon";

export function ModelProviderIcon({
  modelId,
  className,
  fallbackClassName,
}: {
  modelId?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const { remoteResolved, localProviderId } = useResolvedAgentIcon({ modelId });
  const iconUrl = remoteResolved?.kind === "image"
    ? resolveServerAssetUrl(remoteResolved.value)
    : localProviderId
      ? getProviderIconUrlById(localProviderId)
      : "";

  if (iconUrl) {
    return <img src={iconUrl} alt="" className={cn("size-4 shrink-0 rounded-sm object-contain", className)} />;
  }

  return (
    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold", fallbackClassName)}>
      {modelId?.charAt(0).toUpperCase() ?? "?"}
    </span>
  );
}
