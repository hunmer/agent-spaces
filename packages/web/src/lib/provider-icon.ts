/**
 * Provider 图标统一工具（基于 models.dev catalog 的 provider id 体系）
 *
 * 图标文件命名：packages/server/public/provider-icons/{providerId}.svg
 * 由「设置 → 模型 → 更新提供商图标」从 https://models.dev/logos/{providerId}.svg 下载。
 *
 * 三种查找入口：
 * - apiBase → providerId：用 catalog.providers[*].api 的域名匹配
 * - modelId → providerId：用 model.id 的前缀（如 "xai/grok-4" → "xai"）
 * - providerName → providerId：catalog.providers[*].name 反查
 */
import { resolveServerAssetUrl } from "@/lib/server";
import type { ModelCatalog, CatalogProvider } from "@/stores/llm";

// model.id 前缀非标准 providerId 时的修正映射
const PREFIX_FIX: Record<string, string> = {
  tencent: "tencent-cloud",
  meta: "meta",
};

let cachedCatalog: ModelCatalog | null = null;
let apiBaseMap: Map<string, string> | null = null; // host -> providerId
let nameMap: Map<string, string> | null = null; // providerName(lower) -> providerId

/** 注入 catalog 并构建查找索引（由 app 启动 / 设置页更新后调用） */
export function setProviderCatalog(catalog: ModelCatalog | null): void {
  cachedCatalog = catalog;
  if (!catalog?.providers) {
    apiBaseMap = null;
    nameMap = null;
    return;
  }
  const apiMap = new Map<string, string>();
  const nmMap = new Map<string, string>();
  for (const pid of Object.keys(catalog.providers)) {
    const p: CatalogProvider = catalog.providers[pid];
    if (p.name) nmMap.set(p.name.toLowerCase(), pid);
    if (p.api) {
      try {
        const host = new URL(p.api).hostname.toLowerCase();
        if (host && !apiMap.has(host)) apiMap.set(host, pid);
      } catch { /* invalid api url */ }
    }
  }
  apiBaseMap = apiMap;
  nameMap = nmMap;
}

export function getCachedProviderCatalog(): ModelCatalog | null {
  return cachedCatalog;
}

/** 由 apiBase 解析 providerId（域名匹配） */
export function getProviderIdByApiBase(apiBase?: string): string {
  if (!apiBase || !apiBaseMap) return "";
  try {
    const host = new URL(apiBase.includes("://") ? apiBase : `http://${apiBase}`).hostname.toLowerCase();
    return apiBaseMap.get(host) || "";
  } catch {
    return "";
  }
}

/** 由 modelId 解析 providerId（取 "xxx/yyy" 的 xxx 前缀） */
export function getProviderIdByModelId(modelId?: string): string {
  if (!modelId) return "";
  const slash = modelId.indexOf("/");
  if (slash <= 0) return "";
  const prefix = modelId.slice(0, slash).toLowerCase();
  // 前缀必须是 catalog 中已存在的 provider（避免误判）
  if (cachedCatalog?.providers && !cachedCatalog.providers[prefix]) {
    return PREFIX_FIX[prefix] && cachedCatalog.providers[PREFIX_FIX[prefix]] ? PREFIX_FIX[prefix] : "";
  }
  return prefix;
}

/** 由 provider 显示名解析 providerId */
export function getProviderIdByName(name?: string): string {
  if (!name || !nameMap) return "";
  return nameMap.get(name.toLowerCase()) || "";
}

/** 由 providerId 取图标 URL */
export function getProviderIconUrlById(providerId?: string): string {
  if (!providerId) return "";
  return resolveServerAssetUrl(`/static/provider-icons/${providerId}.svg`);
}

/** 兼容旧入口：apiBase → providerId → 图标 URL */
export function getProviderIconUrl(apiBase?: string): string {
  return getProviderIconUrlById(getProviderIdByApiBase(apiBase));
}
