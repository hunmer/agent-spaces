import { asString } from './helpers.js';

export const ASSET_MAX_PER_CATEGORY = 500;
const ASSET_LIBRARY_FILE = 'asset-library.json';
const WORKSPACES_CONFIG = 'workspaces.json';

export function resolveWorkspaceId(ctx, input) {
  const explicit = asString(input?.workspaceId);
  if (explicit) return explicit;
  const ws = ctx.readConfig(WORKSPACES_CONFIG);
  return asString(ws && typeof ws === 'object' ? ws.activeId : '') || 'default';
}

function assetLibPath(workspaceId) {
  return `workspaces/${workspaceId || 'default'}/${ASSET_LIBRARY_FILE}`;
}

export function readAssetLibrary(ctx, workspaceId) {
  const raw = ctx.readConfig(assetLibPath(workspaceId));
  return raw && Array.isArray(raw.categories) ? raw : { categories: [] };
}

export function writeAssetLibrary(ctx, workspaceId, lib) {
  const path = assetLibPath(workspaceId);
  ctx.writeConfig(path, lib);
  ctx.broadcast('miniApp.configChanged', { path, value: lib });
}

export function findCategory(lib, query) {
  const cats = lib.categories || [];
  if (query?.id) {
    const hit = cats.find((c) => c.id === query.id);
    if (hit) return hit;
  }
  const q = asString(query?.categoryName || query?.name).toLowerCase();
  return q && (cats.find((c) => (c.name || '').toLowerCase() === q)
    || cats.find((c) => (c.name || '').toLowerCase().includes(q))) || null;
}

export function genAssetId() {
  return `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function genCategoryId() {
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
