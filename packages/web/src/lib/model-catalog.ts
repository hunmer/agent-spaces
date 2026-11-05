import type { AgentConfig } from "@agent-spaces/shared";
import type { CatalogProvider, ModelCatalog } from "@/stores/llm";

type ApiMessageType = AgentConfig["modelProvider"] | "";
const HOST_ALIAS: Record<string, string> = {
  "api.minimaxi.com": "api.minimax.io",
};

function normalizeUrl(value?: string): URL | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return HOST_ALIAS[hostname.toLowerCase()] || hostname.toLowerCase();
}

export function findCatalogProviderByApiBase(
  catalog: ModelCatalog | null | undefined,
  apiBase?: string,
): { id: string; provider: CatalogProvider } | null {
  const target = normalizeUrl(apiBase);
  if (!catalog?.providers || !target) return null;
  for (const [id, provider] of Object.entries(catalog.providers)) {
    const providerUrl = normalizeUrl(provider.api);
    if (!providerUrl) continue;
    if (normalizeHostname(providerUrl.hostname) !== normalizeHostname(target.hostname)) continue;
    return { id, provider };
  }
  return null;
}

export function getCatalogProviderById(
  catalog: ModelCatalog | null | undefined,
  providerId?: string,
): CatalogProvider | null {
  if (!catalog?.providers || !providerId) return null;
  return catalog.providers[providerId] ?? null;
}

export function inferApiMessageTypeFromCatalogProvider(provider?: CatalogProvider | null): ApiMessageType {
  const npm = String(provider?.npm ?? "").toLowerCase();
  const api = String(provider?.api ?? "").toLowerCase();
  if (npm === "@ai-sdk/anthropic") return "anthropic-messages";
  if (npm === "@ai-sdk/google") return "gemini-generate-content";
  if (npm === "@ai-sdk/google-vertex") return "gemini-generate-content";
  if (npm === "@ai-sdk/openai-compatible") return "openai-chat-completions";
  if (npm === "@ai-sdk/openai") return "openai-responses";
  if (api.includes("anthropic.com")) return "anthropic-messages";
  if (api.includes("generativelanguage.googleapis.com")) return "gemini-generate-content";
  if (api) return "openai-chat-completions";
  return "";
}

export function inferApiMessageTypeFromApiBase(
  catalog: ModelCatalog | null | undefined,
  apiBase?: string,
): ApiMessageType {
  const fromCatalog = findCatalogProviderByApiBase(catalog, apiBase);
  if (fromCatalog) return inferApiMessageTypeFromCatalogProvider(fromCatalog.provider);
  const normalized = String(apiBase ?? "").toLowerCase();
  if (normalized.includes("anthropic.com")) return "anthropic-messages";
  if (normalized.includes("generativelanguage.googleapis.com")) return "gemini-generate-content";
  if (normalized) return "openai-chat-completions";
  return "";
}

/** 知名头部服务商（默认勾选范围） */
export const TOP_PROVIDER_IDS = new Set([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "xai",
  "moonshotai",
  "zai",
  "minimax",
  "qwen",
]);

/** 前沿模型关键词（小写，匹配 model id / name 包含即视为前沿） */
const FRONTIER_PATTERNS = [
  "gpt-5", "gpt-4.1", "gpt-4o", "o3", "o4-mini",
  "claude-opus-4", "claude-sonnet-4",
  "gemini-3", "gemini-2.5-pro",
  "deepseek-v3", "deepseek-chat", "deepseek-reasoner",
  "grok-4", "grok-3",
  "kimi-k2", "kimi-latest",
  "glm-5", "glm-4.6",
  "minimax-m2",
  "qwen3-max", "qwen3-235b",
];

export function isFrontierModelId(id: string, name?: string): boolean {
  const text = `${id} ${name ?? ""}`.toLowerCase();
  return FRONTIER_PATTERNS.some((p) => text.includes(p));
}

/**
 * 计算刷新后的默认勾选：头部服务商下默认勾选其前沿模型；
 * 非头部服务商默认不勾选。返回 providerId -> modelId[]。
 */
export function getDefaultCatalogSelection(
  catalog: ModelCatalog | null | undefined,
): Record<string, string[]> {
  const selection: Record<string, string[]> = {};
  if (!catalog?.providers) return selection;
  for (const [providerId, provider] of Object.entries(catalog.providers)) {
    if (!TOP_PROVIDER_IDS.has(providerId)) continue;
    const modelIds = Object.keys(provider.models ?? {}).filter((id) => {
      const m = provider.models?.[id];
      return isFrontierModelId(id, m?.name);
    });
    if (modelIds.length > 0) selection[providerId] = modelIds;
  }
  return selection;
}
