"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentConfig } from "@agent-spaces/shared";
import { sdk } from "@/lib/sdk";
import { getProviderIdByApiBase, getProviderIdByModelId, getProviderIdByName } from "@/lib/provider-icon";

export type ResolvedAgentIcon = {
  kind: "image" | "emoji";
  value: string;
  providerId?: string;
} | null;

export interface ResolvedAgentIconInput {
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  modelId?: string;
  providerId?: string;
  modelProvider?: AgentConfig["modelProvider"];
}

const iconCache = new Map<string, ResolvedAgentIcon>();

function buildCacheKey(input: ResolvedAgentIconInput): string {
  return JSON.stringify([
    input.avatarUrl ?? "",
    input.icon ?? "",
    input.apiBase ?? "",
    input.modelId ?? "",
    input.providerId ?? "",
    input.modelProvider ?? "",
  ]);
}

export function useResolvedAgentIcon(input: ResolvedAgentIconInput) {
  const [remoteResolved, setRemoteResolved] = useState<ResolvedAgentIcon>(null);
  const {
    avatarUrl,
    icon,
    apiBase,
    modelId,
    providerId,
    modelProvider,
  } = input;
  const hasExplicitVisual = Boolean(avatarUrl || icon);
  const remoteCacheKey = useMemo(() => buildCacheKey({
    avatarUrl,
    icon,
    apiBase,
    modelId,
    providerId,
    modelProvider,
  }), [apiBase, avatarUrl, icon, modelId, modelProvider, providerId]);

  useEffect(() => {
    if (hasExplicitVisual) {
      setRemoteResolved(null);
      return;
    }
    if (!apiBase && !modelId && !providerId && !modelProvider) {
      setRemoteResolved(null);
      return;
    }
    const cached = iconCache.get(remoteCacheKey);
    if (cached !== undefined) {
      setRemoteResolved(cached);
      return;
    }

    let cancelled = false;
    sdk.llm.getAgentIcon({ avatarUrl, icon, apiBase, modelId, providerId, modelProvider })
      .then((result) => {
        if (cancelled) return;
        iconCache.set(remoteCacheKey, result);
        setRemoteResolved(result);
      })
      .catch(() => {
        if (cancelled) return;
        iconCache.set(remoteCacheKey, null);
        setRemoteResolved(null);
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, avatarUrl, hasExplicitVisual, icon, modelId, modelProvider, providerId, remoteCacheKey]);

  const localProviderId = providerId
    || getProviderIdByApiBase(apiBase)
    || getProviderIdByModelId(modelId)
    || getProviderIdByName(modelProvider);

  return {
    remoteResolved,
    localProviderId,
  };
}
