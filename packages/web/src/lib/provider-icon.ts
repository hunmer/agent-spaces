import { resolveServerAssetUrl } from "@/lib/server";
import type { CatalogProvider, ModelCatalog } from "@/stores/llm";

const PREFIX_FIX: Record<string, string> = {
  tencent: "tencent-cloud",
  meta: "meta",
};

let providerEntityMap: Map<string, { name?: string; apiBase?: string }> | null = null;
let cachedCatalog: ModelCatalog | null = null;
let nameMap: Map<string, string> | null = null;

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

export function setProviderEntities(
  providers: { id: string; name?: string; apiBase?: string }[] | null,
): void {
  if (!providers?.length) {
    providerEntityMap = null;
    return;
  }
  providerEntityMap = new Map(
    providers.map((provider) => [provider.id, { name: provider.name, apiBase: provider.apiBase }]),
  );
}

function resolveProviderEntityToSlug(providerId: string): string {
  if (!providerEntityMap) return "";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId);
  if (!isUuid) return "";
  const entity = providerEntityMap.get(providerId);
  if (!entity) return "";
  return (
    (entity.apiBase && getProviderIdByApiBase(entity.apiBase))
    || (entity.name && getProviderIdByName(entity.name))
    || ""
  );
}

export function setProviderCatalog(catalog: ModelCatalog | null): void {
  cachedCatalog = catalog;
  if (!catalog?.providers) {
    nameMap = null;
    return;
  }
  nameMap = new Map(
    Object.entries(catalog.providers)
      .filter(([, provider]) => Boolean(provider.name))
      .map(([id, provider]) => [String(provider.name).toLowerCase(), id]),
  );
}

export function getCachedProviderCatalog(): ModelCatalog | null {
  return cachedCatalog;
}

export function getCatalogProviderById(providerId?: string): CatalogProvider | null {
  if (!cachedCatalog?.providers || !providerId) return null;
  return cachedCatalog.providers[providerId] ?? null;
}

export function getProviderIdByApiBase(apiBase?: string): string {
  const target = normalizeUrl(apiBase);
  if (!target || !cachedCatalog?.providers) return "";
  const targetPath = normalizePathname(target.pathname);
  for (const [providerId, provider] of Object.entries(cachedCatalog.providers)) {
    const providerUrl = normalizeUrl(provider.api);
    if (!providerUrl) continue;
    if (providerUrl.hostname.toLowerCase() !== target.hostname.toLowerCase()) continue;
    const providerPath = normalizePathname(providerUrl.pathname);
    if (targetPath === providerPath || targetPath.startsWith(`${providerPath}/`) || providerPath === "/") {
      return providerId;
    }
  }
  return "";
}

export function getProviderIdByModelId(modelId?: string): string {
  if (!modelId) return "";
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0) return "";
  const prefix = modelId.slice(0, slashIndex).toLowerCase();
  if (!cachedCatalog?.providers) return PREFIX_FIX[prefix] ?? prefix;
  if (cachedCatalog.providers[prefix]) return prefix;
  const fixed = PREFIX_FIX[prefix];
  return fixed && cachedCatalog.providers[fixed] ? fixed : "";
}

export function getProviderIdByName(name?: string): string {
  if (!name || !nameMap) return "";
  return nameMap.get(name.toLowerCase()) || "";
}

export function getProviderIconUrlById(providerId?: string): string {
  if (!providerId) return "";
  const slug = resolveProviderEntityToSlug(providerId) || providerId;
  return resolveServerAssetUrl(`/static/provider-icons/${slug}.svg`);
}

export function getProviderIconUrl(apiBase?: string): string {
  return getProviderIconUrlById(getProviderIdByApiBase(apiBase));
}
