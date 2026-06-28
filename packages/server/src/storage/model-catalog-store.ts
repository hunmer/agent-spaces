import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';
import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js';

/**
 * models.dev 模型目录存储
 *
 * 数据来源：https://models.dev/catalog.json （含 providers + models）
 * 落盘位置：<dataDir>/llm/catalog.json
 * 首次访问若文件不存在，自动下载并保存（满足「首次默认保存」）。
 */

const CATALOG_URL = 'https://models.dev/catalog.json';
const LOGO_URL = (providerId: string) => `https://models.dev/logos/${providerId}.svg`;

// 找到运行时 public 目录（与 app.ts 中 resolveRuntimeDir 同逻辑）
const __dirname = dirname(fileURLToPath(import.meta.url));
function resolvePublicDir(): string {
  // storage/ 编译后在 dist/storage/，public 在 dist/public（生产）或 ../public（开发 src/ 下）
  const candidates = [
    join(__dirname, '..', 'public'), // dist/public 或 src/../public
    join(__dirname, '..', '..', 'public'), // 开发：src/storage -> ../../public
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // 兜底：返回第一个候选（后续 mkdir 兜底创建）
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
  [k: string]: unknown;
}

export interface CatalogProvider {
  id: string;
  name?: string;
  api?: string;
  [k: string]: unknown;
  models?: Record<string, CatalogModel>;
}

export interface Catalog {
  providers: Record<string, CatalogProvider>;
  models: Record<string, CatalogModel>;
}

export interface CatalogMeta {
  updatedAt: string | null;
  providers: number;
  models: number;
}

function catalogFile() {
  return join(getDataDir(), 'llm', 'catalog.json');
}

/** 拉取远端 catalog.json */
async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch(CATALOG_URL, {
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch catalog: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as Catalog;
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid catalog payload');
  }
  return data;
}

/** 读取本地 catalog；首次不存在则自动下载保存 */
export async function getCatalog(): Promise<Catalog> {
  const file = catalogFile();
  const local = readJsonFile<Catalog>(file);
  if (local) return local;
  // 首次：下载并默认保存
  const fresh = await fetchCatalog();
  ensureDir(dirname(file));
  writeJsonFile(file, fresh);
  return fresh;
}

/** 强制刷新（重新请求远端） */
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
    try { updatedAt = statSync(file).mtime.toISOString(); } catch { updatedAt = null; }
  }
  const catalog = readJsonFile<Catalog>(file);
  return {
    updatedAt,
    providers: catalog?.providers ? Object.keys(catalog.providers).length : 0,
    models: catalog?.models ? Object.keys(catalog.models).length : 0,
  };
}

/** 下载一个 provider 图标，成功返回 true */
async function downloadIcon(providerId: string, publicDir: string): Promise<boolean> {
  try {
    const res = await fetch(LOGO_URL(providerId), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const text = await res.text();
    if (!text || !text.trim()) return false;
    const dir = join(publicDir, 'provider-icons');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${providerId}.svg`), text, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** 一键更新所有 provider 图标到 packages/server/public/provider-icons/ */
export async function refreshProviderIcons(): Promise<{
  saved: string[];
  failed: string[];
  removed: string[];
  total: number;
}> {
  const catalog = await getCatalog();
  const ids = catalog.providers ? Object.keys(catalog.providers) : [];
  const validSet = new Set(ids.map(id => `${id}.svg`));
  const publicDir = resolvePublicDir();

  const saved: string[] = [];
  const failed: string[] = [];

  // 限制并发为 8
  const CONCURRENCY = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const i = cursor++;
      const ok = await downloadIcon(ids[i], publicDir);
      if (ok) saved.push(ids[i]);
      else failed.push(ids[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

  // 清理目录中不属于当前 catalog 的旧图标（统一为 provider id 体系）
  const removed: string[] = [];
  const iconDir = join(publicDir, 'provider-icons');
  if (existsSync(iconDir)) {
    const files = await readdir(iconDir);
    for (const f of files) {
      if (!f.endsWith('.svg')) continue;
      if (validSet.has(f)) continue;
      try { await unlink(join(iconDir, f)); removed.push(f); } catch { /* ignore */ }
    }
  }

  return { saved, failed, removed, total: ids.length };
}
