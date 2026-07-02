import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentConfig } from "@agent-spaces/shared";
import { ensureDir, getDataDir, readJsonFile, writeJsonFile } from "./json-store.js";

const CATALOG_URL = "https://models.dev/api.json";
const LOGO_URL = (providerId: string) => `https://models.dev/logos/${providerId}.svg`;
const PREFIX_FIX: Record<string, string> = {
  tencent: "tencent-cloud",
};
const HOST_ALIAS: Record<string, string> = {
  "api.minimaxi.com": "api.minimax.io",
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePublicDir(): string {
  const candidates = [
    join(__dirname, "..", "public"),
    join(__dirname, "..", "..", "public"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export interface CatalogModel {
  id: string;
  name?: string;
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
  attachment?: boolean;
  reasoning?: boolean;
  [key: string]: unknown;
}

export interface CatalogProvider {
  id: string;
  name?: string;
  api?: string;
  npm?: string;
  env?: string[];
  doc?: string;
  models?: Record<string, CatalogModel>;
  [key: string]: unknown;
}

export interface Catalog {
  providers: Record<string, CatalogProvider>;
  models: Record<string, CatalogModel>;
}

interface RawCatalogProvider extends Omit<CatalogProvider, "id" | "models"> {
  id?: string;
  models?: Record<string, CatalogModel>;
}

export interface CatalogMeta {
  updatedAt: string | null;
  providers: number;
  models: number;
}

export interface ResolvedAgentIcon {
  kind: "image" | "emoji";
  value: string;
  providerId?: string;
}

function catalogFile(): string {
  return join(getDataDir(), "llm", "catalog.json");
}

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

function normalizeCatalog(raw: Record<string, RawCatalogProvider>): Catalog {
  const providers: Record<string, CatalogProvider> = {};
  const models: Record<string, CatalogModel> = {};

  for (const [providerId, provider] of Object.entries(raw)) {
    const normalizedModels: Record<string, CatalogModel> = {};
    for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
      const normalizedModel = {
        ...model,
        id: model.id ?? modelKey,
        name: model.name ?? model.id ?? modelKey,
      };
      normalizedModels[normalizedModel.id] = normalizedModel;
      models[normalizedModel.id] = normalizedModel;
    }
    providers[providerId] = {
      ...provider,
      id: provider.id ?? providerId,
      name: typeof provider.name === "string" ? provider.name : providerId,
      models: normalizedModels,
    };
  }

  return { providers, models };
}

async function fetchCatalog(): Promise<Catalog> {
  const response = await fetch(CATALOG_URL, {
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`);
  }
  const raw = (await response.json()) as Record<string, RawCatalogProvider>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid catalog payload");
  }
  return normalizeCatalog(raw);
}

export async function getCatalog(): Promise<Catalog> {
  const file = catalogFile();
  const local = readJsonFile<Catalog>(file);
  if (local) return local;
  const fresh = await fetchCatalog();
  ensureDir(dirname(file));
  writeJsonFile(file, fresh);
  return fresh;
}

export async function refreshCatalog(): Promise<Catalog> {
  const fresh = await fetchCatalog();
  ensureDir(dirname(catalogFile()));
  writeJsonFile(catalogFile(), fresh);
  return fresh;
}

export async function getCatalogMeta(): Promise<CatalogMeta> {
  const file = catalogFile();
  let updatedAt: string | null = null;
  if (existsSync(file)) {
    try {
      updatedAt = statSync(file).mtime.toISOString();
    } catch {
      updatedAt = null;
    }
  }
  const catalog = readJsonFile<Catalog>(file);
  return {
    updatedAt,
    providers: catalog?.providers ? Object.keys(catalog.providers).length : 0,
    models: catalog?.models ? Object.keys(catalog.models).length : 0,
  };
}

async function downloadIcon(providerId: string, publicDir: string): Promise<boolean> {
  try {
    const response = await fetch(LOGO_URL(providerId), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return false;
    const text = await response.text();
    if (!text.trim()) return false;
    const iconDir = join(publicDir, "provider-icons");
    if (!existsSync(iconDir)) await mkdir(iconDir, { recursive: true });
    await writeFile(join(iconDir, `${providerId}.svg`), text, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function refreshProviderIcons(): Promise<{
  saved: string[];
  failed: string[];
  removed: string[];
  total: number;
}> {
  const catalog = await getCatalog();
  const providerIds = Object.keys(catalog.providers ?? {});
  const validSet = new Set(providerIds.map((providerId) => `${providerId}.svg`));
  const publicDir = resolvePublicDir();
  const saved: string[] = [];
  const failed: string[] = [];
  const concurrency = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < providerIds.length) {
      const current = providerIds[cursor++];
      const success = await downloadIcon(current, publicDir);
      if (success) saved.push(current);
      else failed.push(current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, providerIds.length) }, worker));

  const removed: string[] = [];
  const iconDir = join(publicDir, "provider-icons");
  if (existsSync(iconDir)) {
    const files = await readdir(iconDir);
    for (const file of files) {
      if (!file.endsWith(".svg")) continue;
      if (validSet.has(file)) continue;
      try {
        await unlink(join(iconDir, file));
        removed.push(file);
      } catch {
        // ignore stale file cleanup failures
      }
    }
  }

  return { saved, failed, removed, total: providerIds.length };
}

export function getCatalogProviderIdByApiBase(catalog: Catalog, apiBase?: string): string {
  const target = normalizeUrl(apiBase);
  if (!target) return "";
  for (const [providerId, provider] of Object.entries(catalog.providers ?? {})) {
    const providerUrl = normalizeUrl(provider.api);
    if (!providerUrl) continue;
    if (normalizeHostname(providerUrl.hostname) !== normalizeHostname(target.hostname)) continue;
    return providerId;
  }
  return "";
}

export function getCatalogProviderIdByModelId(catalog: Catalog, modelId?: string): string {
  if (!modelId) return "";
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0) return "";
  const prefix = modelId.slice(0, slashIndex).toLowerCase();
  if (catalog.providers[prefix]) return prefix;
  const fixed = PREFIX_FIX[prefix];
  return fixed && catalog.providers[fixed] ? fixed : "";
}

export function getCatalogProviderIdByCatalogModel(
  catalog: Catalog,
  modelId?: string,
  apiBase?: string,
): string {
  const targetModel = modelId?.trim().toLowerCase();
  if (!targetModel) return "";
  const targetHost = normalizeHostname(normalizeUrl(apiBase)?.hostname ?? "");
  const hostMatches: string[] = [];
  const matches: string[] = [];

  for (const [providerId, provider] of Object.entries(catalog.providers ?? {})) {
    const modelEntries = Object.values(provider.models ?? {});
    const hit = modelEntries.some((model) => {
      const modelKey = String(model.id ?? "").trim().toLowerCase();
      const modelName = String(model.name ?? "").trim().toLowerCase();
      return modelKey === targetModel || modelName === targetModel;
    });
    if (!hit) continue;
    matches.push(providerId);
    const providerHost = normalizeHostname(normalizeUrl(provider.api)?.hostname ?? "");
    if (targetHost && providerHost === targetHost) {
      hostMatches.push(providerId);
    }
  }

  return hostMatches[0] || matches[0] || "";
}

export function getCatalogProviderIdByName(catalog: Catalog, name?: string): string {
  if (!name) return "";
  const target = name.trim().toLowerCase();
  if (!target) return "";
  for (const [providerId, provider] of Object.entries(catalog.providers ?? {})) {
    if (providerId.toLowerCase() === target) return providerId;
    if (String(provider.name ?? "").trim().toLowerCase() === target) return providerId;
  }
  return "";
}

function isLikelyImageValue(value: string): boolean {
  return /^(https?:)?\/\//.test(value) || value.startsWith("/");
}

export function resolveAgentIcon(
  catalog: Catalog,
  agent: Partial<Pick<AgentConfig, "avatarUrl" | "icon" | "apiBase" | "modelId">> & { providerName?: string },
): ResolvedAgentIcon | null {
  const avatarUrl = agent.avatarUrl?.trim();
  if (avatarUrl) {
    return { kind: "image", value: avatarUrl };
  }

  const icon = agent.icon?.trim();
  if (icon) {
    return {
      kind: isLikelyImageValue(icon) ? "image" : "emoji",
      value: icon,
    };
  }

  const providerId = getCatalogProviderIdByApiBase(catalog, agent.apiBase)
    || getCatalogProviderIdByModelId(catalog, agent.modelId)
    || getCatalogProviderIdByCatalogModel(catalog, agent.modelId, agent.apiBase);
  const fallbackProviderId = providerId || getCatalogProviderIdByName(catalog, agent.providerName);
  if (!fallbackProviderId) return null;
  return {
    kind: "image",
    value: `/static/provider-icons/${fallbackProviderId}.svg`,
    providerId: fallbackProviderId,
  };
}
