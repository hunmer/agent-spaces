// 服务端单写者：工作区清单 + 各工作区隔离的画布/生成记录 + 共享设置/提示词库。
// 工作区数据隔离在 configs/workspaces/<id>/ 子目录；settings/prompt-library 仍共享。
const CANVAS_FILE = 'canvas.json';
const HISTORY_FILE = 'generation-history.json';
const LAST_PARAMS_FILE = 'last-params.json';
const SETTINGS_CONFIG = 'settings.json';
const PROMPT_CONFIG = 'prompt-library.json';
const WORKSPACES_CONFIG = 'workspaces.json';
const ASSET_LIBRARY_FILE = 'asset-library.json';
const SPINE_RESKIN_HISTORY_FILE = 'spine-reskin-history.json';
const HISTORY_MAX = 200;
const SPINE_RESKIN_HISTORY_MAX = 20;
const ASSET_MAX_PER_CATEGORY = 500; // 单分类资产上限，避免无限膨胀

// 素材库文件路径（工作区隔离）
function assetLibPath(workspaceId) {
  return wsPath(workspaceId, ASSET_LIBRARY_FILE);
}

// 读取素材库（兜底返回空结构，保证调用方总有数据）
function readAssetLibrary(ctx, workspaceId) {
  const raw = ctx.readConfig(assetLibPath(workspaceId));
  if (raw && Array.isArray(raw.categories)) return raw;
  return { categories: [] };
}

// 工作区隔离路径（canvas / history 按工作区分目录）
function wsPath(workspaceId, file) {
  const id = workspaceId || 'default';
  return `workspaces/${id}/${file}`;
}

// —— 工作区清单 CRUD ——
// workspaces.json 结构：{ activeId, workspaces: [{id,name,createdAt,directory?}] }
// directory（可选）：宿主机绝对路径，节点产图会额外复制一份到该目录；留空则不保存到本地。

// 读取工作区清单（兜底返回默认工作区，保证调用方总有数据）
function readWorkspaceList(ctx) {
  const raw = ctx.readConfig(WORKSPACES_CONFIG);
  if (raw && Array.isArray(raw.workspaces) && raw.workspaces.length) return raw;
  return {
    activeId: 'default',
    workspaces: [{ id: 'default', name: '默认工作区', createdAt: Date.now() }],
  };
}

export default {
  // —— 画布（按工作区隔离）——

  // 保存整张画布（节点 + 连线 + 分组 + 视口）
  save_canvas: ({ workspaceId, state }, ctx) => {
    const payload = state || {};
    ctx.writeConfig(wsPath(workspaceId, CANVAS_FILE), {
      nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
      edges: Array.isArray(payload.edges) ? payload.edges : [],
      groups: Array.isArray(payload.groups) ? payload.groups : [],
      ...(isViewport(payload.viewport) ? { viewport: payload.viewport } : {}),
      savedAt: Date.now(),
    });
    return { ok: true };
  },

  // 读取画布状态
  load_canvas: ({ workspaceId }, ctx) => ctx.readConfig(wsPath(workspaceId, CANVAS_FILE)) || null,

  // 清空画布
  clear_canvas: ({ workspaceId }, ctx) => {
    ctx.writeConfig(wsPath(workspaceId, CANVAS_FILE), {
      nodes: [], edges: [], groups: [], savedAt: Date.now(),
    });
    return { ok: true };
  },

  // —— 生成记录（按工作区隔离）——

  // 新增一条生成记录（原子追加，最新在前，限制总量）
  add_history: ({ workspaceId, item }, ctx) => {
    if (!item) return { ok: false };
    ctx.updateConfig(wsPath(workspaceId, HISTORY_FILE), (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const next = [item, ...list];
      return next.slice(0, HISTORY_MAX);
    });
    return { ok: true };
  },

  // 删除指定生成记录
  remove_history: ({ workspaceId, id }, ctx) => {
    ctx.updateConfig(wsPath(workspaceId, HISTORY_FILE), (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((it) => it.id !== id);
    });
    return { ok: true };
  },

  // 清空生成记录
  clear_history: ({ workspaceId }, ctx) => {
    ctx.writeConfig(wsPath(workspaceId, HISTORY_FILE), []);
    return { ok: true };
  },

  // —— Spine 换肤生成记录（按 Spine 资源签名隔离，项目级共享）——

  save_spine_reskin_history: ({ assetSignature, item }, ctx) => {
    if (!assetSignature || !item?.id) return { ok: false };
    ctx.updateConfig(SPINE_RESKIN_HISTORY_FILE, (prev) => {
      const map = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
      const list = Array.isArray(map[assetSignature]) ? map[assetSignature] : [];
      const next = [item, ...list.filter((entry) => (
        entry.id !== item.id && entry.name !== item.name
      ))].slice(0, SPINE_RESKIN_HISTORY_MAX);
      return { ...map, [assetSignature]: next };
    });
    return { ok: true };
  },

  delete_spine_reskin_history: ({ assetSignature, id }, ctx) => {
    if (!assetSignature || !id) return { ok: false };
    ctx.updateConfig(SPINE_RESKIN_HISTORY_FILE, (prev) => {
      const map = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
      const list = Array.isArray(map[assetSignature]) ? map[assetSignature] : [];
      return { ...map, [assetSignature]: list.filter((entry) => entry.id !== id) };
    });
    return { ok: true };
  },

  // —— 上次提交参数（按工作区隔离，KV: { [nodeType]: paramsSubset }）——
  // 新增/更新某节点类型的上次提交参数（原子 upsert：覆盖该 nodeType，其余保留）
  save_last_params: ({ workspaceId, nodeType, params }, ctx) => {
    if (!nodeType) return { ok: false };
    ctx.updateConfig(wsPath(workspaceId, LAST_PARAMS_FILE), (prev) => {
      const map = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : {};
      return { ...map, [nodeType]: params };
    });
    return { ok: true };
  },

  // —— 设置（全局共享，不按工作区隔离）——

  // 保存设置（整体覆盖；前端已 merge 默认值）
  save_settings: ({ settings }, ctx) => {
    ctx.writeConfig(SETTINGS_CONFIG, settings || {});
    return { ok: true };
  },

  // —— 自定义提示词库（全局共享）——

  // 新增/更新一条自定义提示词（upsert：同 id 覆盖，否则追加到最前）
  save_prompt: ({ item }, ctx) => {
    if (!item || !item.id) return { ok: false };
    ctx.updateConfig(PROMPT_CONFIG, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return [item, ...list.filter((it) => it.id !== item.id)];
    });
    return { ok: true };
  },

  // 删除一条自定义提示词（按 id）
  delete_prompt: ({ id }, ctx) => {
    ctx.updateConfig(PROMPT_CONFIG, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((it) => it.id !== id);
    });
    return { ok: true };
  },

  // 重置提示词库：用默认值覆盖同 id 项，保留用户独有新增（默认中不存在该 id 的）。
  // defaults 由前端传入（src/data/prompt-defaults.json 内容），服务端只读 configs/ 无法访问 src。
  // 语义：默认 id 全部恢复默认值（含用户删除/编辑过的），用户新增 id 原样保留。
  reset_prompts: ({ defaults }, ctx) => {
    const defaultList = Array.isArray(defaults) ? defaults : [];
    const defaultIds = new Set(defaultList.map((p) => p.id).filter(Boolean));
    ctx.updateConfig(PROMPT_CONFIG, (prev) => {
      const userList = Array.isArray(prev) ? prev : [];
      const userNew = userList.filter((p) => p.id && !defaultIds.has(p.id));
      return [...defaultList, ...userNew];
    });
    return { ok: true };
  },

  // —— 工作区管理 ——

  // 列出全部工作区 + 当前激活 id
  list_workspaces: (_payload, ctx) => readWorkspaceList(ctx),

  // 创建工作区（name/directory 可选，默认「新建工作区 N」）。directory 留空则不存该键。返回新清单（activeId 不变）。
  create_workspace: ({ name, directory }, ctx) => {
    const cur = readWorkspaceList(ctx);
    const id = `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const trimmedDir = (directory || '').trim();
    const ws = { id, name: (name || '').trim() || `新建工作区 ${cur.workspaces.length + 1}`, createdAt: Date.now() };
    if (trimmedDir) ws.directory = trimmedDir;
    const next = { ...cur, workspaces: [...cur.workspaces, ws] };
    ctx.writeConfig(WORKSPACES_CONFIG, next);
    return next;
  },

  // 重命名工作区（name 必填；directory 可选，传则更新/清空，不传则保留原值）
  rename_workspace: ({ id, name, directory }, ctx) => {
    const cur = readWorkspaceList(ctx);
    const trimmed = (name || '').trim() || '未命名工作区';
    const next = {
      ...cur,
      workspaces: cur.workspaces.map((ws) => {
        if (ws.id !== id) return ws;
        const updated = { ...ws, name: trimmed };
        if (directory !== undefined) {
          const trimmedDir = (directory || '').trim();
          if (trimmedDir) updated.directory = trimmedDir;
          else delete updated.directory;
        }
        return updated;
      }),
    };
    ctx.writeConfig(WORKSPACES_CONFIG, next);
    return next;
  },

  // 切换激活工作区（仅改 activeId）
  switch_workspace: ({ id }, ctx) => {
    const cur = readWorkspaceList(ctx);
    if (!cur.workspaces.some((ws) => ws.id === id)) return cur;
    const next = { ...cur, activeId: id };
    ctx.writeConfig(WORKSPACES_CONFIG, next);
    return next;
  },

  // 删除工作区（不允许删最后一个）。删除当前激活则 activeId 回退到第一个。
  // 工作区隔离的 canvas/history 文件一并清空（写空数据，保留目录结构）。
  delete_workspace: ({ id }, ctx) => {
    const cur = readWorkspaceList(ctx);
    if (cur.workspaces.length <= 1) return cur; // 至少保留一个工作区
    const remaining = cur.workspaces.filter((ws) => ws.id !== id);
    if (remaining.length === cur.workspaces.length) return cur; // 没匹配到
    const activeId = cur.activeId === id ? remaining[0].id : cur.activeId;
    const next = { activeId, workspaces: remaining };
    ctx.writeConfig(WORKSPACES_CONFIG, next);
    // 清空被删工作区的内容数据（目录可保留，避免广播时前端读到旧值）
    ctx.writeConfig(wsPath(id, CANVAS_FILE), { nodes: [], edges: [], savedAt: Date.now() });
    ctx.writeConfig(wsPath(id, HISTORY_FILE), []);
    ctx.writeConfig(assetLibPath(id), { categories: [] });
    return next;
  },

  // —— 素材库（按工作区隔离）——
  // 数据结构：{ categories: [{ id, name, createdAt, assets: [{ id, url, name, size, uploadedAt }] }] }

  // 列出素材库（兜底空 categories）
  list_assets: ({ workspaceId }, ctx) => readAssetLibrary(ctx, workspaceId),

  // 创建分类（name 可选，默认「新建分类 N」）
  create_category: ({ workspaceId, name }, ctx) => {
    const lib = readAssetLibrary(ctx, workspaceId);
    const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const cat = {
      id,
      name: (name || '').trim() || `新建分类 ${lib.categories.length + 1}`,
      createdAt: Date.now(),
      assets: [],
    };
    const next = { categories: [...lib.categories, cat] };
    ctx.writeConfig(assetLibPath(workspaceId), next);
    return next;
  },

  // 重命名分类
  rename_category: ({ workspaceId, id, name }, ctx) => {
    const trimmed = (name || '').trim() || '未命名分类';
    const lib = readAssetLibrary(ctx, workspaceId);
    const next = {
      categories: lib.categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
    };
    ctx.writeConfig(assetLibPath(workspaceId), next);
    return next;
  },

  // 删除分类
  delete_category: ({ workspaceId, id }, ctx) => {
    const lib = readAssetLibrary(ctx, workspaceId);
    const next = { categories: lib.categories.filter((c) => c.id !== id) };
    ctx.writeConfig(assetLibPath(workspaceId), next);
    return next;
  },

  // 新增资产到指定分类（原子追加到分类 assets 头部，限制单分类上限）
  // 去重：同分类下 url 已存在则跳过，返回 { ok:false, duplicated:true }
  add_asset: ({ workspaceId, categoryId, asset }, ctx) => {
    if (!asset || !asset.url) return { ok: false };
    const lib = readAssetLibrary(ctx, workspaceId);
    const next = {
      categories: lib.categories.map((c) => {
        if (c.id !== categoryId) return c;
        const assets = c.assets || [];
        if (assets.some((a) => a.url === asset.url)) return c; // url 已存在，跳过
        return { ...c, assets: [asset, ...assets].slice(0, ASSET_MAX_PER_CATEGORY) };
      }),
    };
    ctx.writeConfig(assetLibPath(workspaceId), next);
    return next;
  },

  // 删除分类下的指定资产
  remove_asset: ({ workspaceId, categoryId, assetId }, ctx) => {
    const lib = readAssetLibrary(ctx, workspaceId);
    const next = {
      categories: lib.categories.map((c) =>
        c.id === categoryId
          ? { ...c, assets: (c.assets || []).filter((a) => a.id !== assetId) }
          : c,
      ),
    };
    ctx.writeConfig(assetLibPath(workspaceId), next);
    return next;
  },

  // 更新资产字段（title / name / url）。categoryId 可选，不传则全库按 assetId 查找
  update_asset: ({ workspaceId, categoryId, assetId, patch }, ctx) => {
    if (!assetId || !patch) return readAssetLibrary(ctx, workspaceId);
    const lib = readAssetLibrary(ctx, workspaceId);
    const next = {
      categories: lib.categories.map((c) => {
        if (categoryId && c.id !== categoryId) return c;
        let changed = false;
        const assets = (c.assets || []).map((a) => {
          if (a.id === assetId) { changed = true; return { ...a, ...patch }; }
          return a;
        });
        return changed ? { ...c, assets } : c;
      }),
    };
    ctx.writeConfig(assetLibPath(workspaceId), next);
    return next;
  },

  // 移动资产到另一分类（原子：源分类删除 + 目标分类追加，目标已存在同 url 则仅删源）
  move_asset: ({ workspaceId, fromCategoryId, assetId, toCategoryId }, ctx) => {
    if (!fromCategoryId || !toCategoryId || fromCategoryId === toCategoryId) return readAssetLibrary(ctx, workspaceId);
    const lib = readAssetLibrary(ctx, workspaceId);
    let moved = null;
    const without = lib.categories.map((c) => {
      if (c.id !== fromCategoryId) return c;
      const assets = c.assets || [];
      moved = assets.find((a) => a.id === assetId) || null;
      return { ...c, assets: assets.filter((a) => a.id !== assetId) };
    });
    if (!moved) {
      ctx.writeConfig(assetLibPath(workspaceId), { categories: without });
      return { categories: without };
    }
    const next = {
      categories: without.map((c) => {
        if (c.id !== toCategoryId) return c;
        const assets = c.assets || [];
        if (assets.some((a) => a.url === moved.url)) return c; // 目标已存在同 url，跳过
        return { ...c, assets: [moved, ...assets].slice(0, ASSET_MAX_PER_CATEGORY) };
      }),
    };
    ctx.writeConfig(assetLibPath(workspaceId), next);
    return next;
  },
};

function isViewport(viewport) {
  return Boolean(viewport)
    && Number.isFinite(viewport.x)
    && Number.isFinite(viewport.y)
    && Number.isFinite(viewport.zoom)
    && viewport.zoom > 0;
}
