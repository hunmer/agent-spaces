import type { AgentConfig } from "@agent-spaces/shared";
import type { CatalogProvider, ModelCatalog } from "@/stores/llm";

type ApiMessageType = AgentConfig["modelProvider"] | "";

function normalizeUrl(value?: string): URL | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function findCatalogProviderByApiBase(
  catalog: ModelCatalog | null | undefined,
  apiBase?: string,
): { id: string; provider: CatalogProvider } | null {
  const target = normalizeUrl(apiBase);
  if (!catalog?.providers || !target) return null;
  const targetPath = normalizePathname(target.pathname);
  for (const [id, provider] of Object.entries(catalog.providers)) {
    const providerUrl = normalizeUrl(provider.api);
    if (!providerUrl) continue;
    if (providerUrl.hostname.toLowerCase() !== target.hostname.toLowerCase()) continue;
    const providerPath = normalizePathname(providerUrl.pathname);
    if (targetPath === providerPath || targetPath.startsWith(`${providerPath}/`) || providerPath === "/") {
      return { id, provider };
    }
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
