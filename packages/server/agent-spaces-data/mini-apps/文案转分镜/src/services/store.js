// 文案转分镜 · 服务端单一写入方
// 所有 configs/data.json 的写入都经此处的 ctx.updateConfig / ctx.writeConfig，原子读改写，多端同步
// 注意：handler 内不可 import 外部模块，常量在此重新声明

const DATA_PATH = 'data.json';

const DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID = 'd88dcb7c-7f5f-47c8-962c-89217a2c0ad6';
const DEFAULT_EDIT_IMAGE_WORKFLOW_ID = '19f5f8a9-305d-43a6-9b05-584597213a8f';
const DEFAULT_VIDEO_WORKFLOW_ID = '5130958f-a78e-4c36-8f03-1f2f733b87d7';

function defaultData() {
  return {
    version: 1,
    activeProjectId: '',
    projects: [],
    settings: {
      imageWorkflowId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
      imageWorkflowName: 'edit_image',
      textToImageWorkflowId: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID,
      textToImageWorkflowName: 'text_to_image',
      editImageWorkflowId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
      editImageWorkflowName: 'edit_image',
      videoWorkflowId: DEFAULT_VIDEO_WORKFLOW_ID,
      videoWorkflowName: 'video_generator',
      provider: 'keling',
      model: 'kling/kling-v3-image-generation',
      aspect: '16:9',
      size: '1k',
      quality: '720',
      duration: '5',
    },
  };
}

// 兜底：保证数据结构完整
function normalizeData(prev) {
  const base = defaultData();
  if (!prev || typeof prev !== 'object') return base;
  return {
    ...base,
    ...prev,
    projects: Array.isArray(prev.projects) ? prev.projects.map(normalizeProject) : [],
    settings: { ...base.settings, ...(prev.settings && typeof prev.settings === 'object' ? prev.settings : {}) },
  };
}

function normalizeProject(p) {
  return {
    id: p?.id || `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof p?.name === 'string' ? p.name : '未命名项目',
    createdAt: p?.createdAt || new Date().toISOString(),
    updatedAt: p?.updatedAt || new Date().toISOString(),
    characters: Array.isArray(p?.characters) ? p.characters.map(normalizeCharacter) : [],
    scenes: Array.isArray(p?.scenes) ? p.scenes.map(normalizeScene) : [],
  };
}

function normalizeCharacter(c) {
  return {
    id: c?.id || `char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof c?.name === 'string' ? c.name : '',
    prompt: typeof c?.prompt === 'string' ? c.prompt : '',
    images: Array.isArray(c?.images) ? c.images : [],
  };
}

function normalizeScene(s) {
  return {
    id: s?.id || `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    index: typeof s?.index === 'number' ? s.index : 0,
    narration: typeof s?.narration === 'string' ? s.narration : '',
    visualPrompt: typeof s?.visualPrompt === 'string' ? s.visualPrompt : '',
    animationPrompt: typeof s?.animationPrompt === 'string' ? s.animationPrompt : '',
    characterIds: Array.isArray(s?.characterIds) ? s.characterIds : [],
    images: Array.isArray(s?.images) ? s.images : [],
    video: typeof s?.video === 'string' ? s.video : '',
  };
}

function touch(p) { p.updatedAt = new Date().toISOString(); return p; }

// 在数据上定位项目，找不到返回 null
function findProject(data, projectId) {
  return (data.projects || []).find((p) => p.id === projectId) || null;
}

export default {
  // 读取/初始化（前端首次 getConfig 为空时调用兜底）
  ensure_data: (_payload, ctx) => {
    const next = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      if (!cur.activeProjectId && cur.projects.length) cur.activeProjectId = cur.projects[0].id;
      return cur;
    });
    return { ok: true, data: next };
  },

  // 新增或更新项目元数据（character/scene 不在此改）
  save_project: ({ project }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const incoming = normalizeProject(project);
      const idx = cur.projects.findIndex((p) => p.id === incoming.id);
      if (idx >= 0) {
        const merged = { ...cur.projects[idx], name: incoming.name };
        touch(merged);
        cur.projects[idx] = merged;
      } else {
        cur.projects.push(incoming);
      }
      if (!cur.activeProjectId) cur.activeProjectId = incoming.id;
      return cur;
    });
    return { ok: true, data };
  },

  delete_project: ({ id }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      cur.projects = cur.projects.filter((p) => p.id !== id);
      if (cur.activeProjectId === id) {
        cur.activeProjectId = cur.projects[0]?.id || '';
      }
      return cur;
    });
    return { ok: true, data };
  },

  set_active_project: ({ id }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      if (cur.projects.some((p) => p.id === id)) cur.activeProjectId = id;
      return cur;
    });
    return { ok: true, data };
  },

  // 角色 CRUD
  save_character: ({ projectId, character }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      const incoming = normalizeCharacter(character);
      const idx = p.characters.findIndex((c) => c.id === incoming.id);
      // 单选：保证只有一个 image.selected
      ensureSingleSelected(incoming);
      if (idx >= 0) p.characters[idx] = incoming;
      else p.characters.push(incoming);
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  delete_character: ({ projectId, characterId }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      p.characters = p.characters.filter((c) => c.id !== characterId);
      // 同步从分镜的 characterIds 里移除
      (p.scenes || []).forEach((s) => {
        if (Array.isArray(s.characterIds)) {
          s.characterIds = s.characterIds.filter((cid) => cid !== characterId);
        }
      });
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  // 切换角色选中图（单选）
  select_character_image: ({ projectId, characterId, imageId }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      const c = p.characters.find((x) => x.id === characterId);
      if (!c) return cur;
      (c.images || []).forEach((img) => { img.selected = img.id === imageId; });
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  // 分镜 CRUD
  save_scene: ({ projectId, scene }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      const incoming = normalizeScene(scene);
      const idx = p.scenes.findIndex((s) => s.id === incoming.id);
      if (idx >= 0) p.scenes[idx] = incoming;
      else p.scenes.push(incoming);
      // 重排 index
      reindexScenes(p);
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  delete_scene: ({ projectId, sceneId }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      p.scenes = p.scenes.filter((s) => s.id !== sceneId);
      reindexScenes(p);
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  reorder_scenes: ({ projectId, sceneIds }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      const map = new Map((p.scenes || []).map((s) => [s.id, s]));
      const next = (Array.isArray(sceneIds) ? sceneIds : [])
        .map((id) => map.get(id))
        .filter(Boolean);
      // 未能覆盖到的尾巴追加
      (p.scenes || []).forEach((s) => { if (!sceneIds.includes(s.id)) next.push(s); });
      p.scenes = next;
      reindexScenes(p);
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  // 工作流结果回填：kind = image | video
  add_scene_media: ({ projectId, sceneId, kind, urls }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      const s = (p.scenes || []).find((x) => x.id === sceneId);
      if (!s) return cur;
      const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
      if (kind === 'video') {
        s.video = list[list.length - 1] || s.video || '';
      } else {
        s.images = [...(s.images || []), ...list];
      }
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  clear_scene_media: ({ projectId, sceneId, kind }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      const s = (p.scenes || []).find((x) => x.id === sceneId);
      if (!s) return cur;
      if (kind === 'video') s.video = '';
      else s.images = [];
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  // Agent 文案导入：mode = replace | merge
  import_storyboard: ({ projectId, characters, scenes, mode }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      const p = findProject(cur, projectId);
      if (!p) return cur;
      const normChars = (Array.isArray(characters) ? characters : []).map(normalizeCharacter);
      const rawScenes = Array.isArray(scenes) ? scenes : [];
      // 角色按 name 建映射，用于把 scene.characterNames 解析为 characterIds
      const nameToId = new Map();

      if (mode === 'replace') {
        p.characters = [];
        p.scenes = [];
      }

      // 导入角色：同 name 合并（沿用已有 id 与图片），否则新增
      normChars.forEach((c) => {
        const existed = p.characters.find((x) => x.name && x.name === c.name);
        if (existed) {
          existed.prompt = c.prompt || existed.prompt;
          nameToId.set(c.name, existed.id);
        } else {
          p.characters.push(c);
          nameToId.set(c.name, c.id);
        }
      });

      // 导入分镜：把 characterNames 映射为 characterIds（角色已导入，nameToId 完整）
      const normScenes = rawScenes.map((s) => {
        const fromNames = (Array.isArray(s.characterNames) ? s.characterNames : [])
          .map((n) => nameToId.get(n))
          .filter(Boolean);
        const fromIds = Array.isArray(s.characterIds) ? s.characterIds : [];
        return normalizeScene({ ...s, characterIds: [...new Set([...fromIds, ...fromNames])] });
      });

      // merge 模式按 index 去重（同 index 覆盖）
      normScenes.forEach((s) => {
        s.characterIds = (s.characterIds || []).filter(Boolean);
        if (mode !== 'replace') {
          const existed = p.scenes.find((x) => x.index === s.index);
          if (existed) {
            existed.narration = s.narration || existed.narration;
            existed.visualPrompt = s.visualPrompt || existed.visualPrompt;
            existed.animationPrompt = s.animationPrompt || existed.animationPrompt;
            if (s.characterIds.length) existed.characterIds = s.characterIds;
            return;
          }
        }
        p.scenes.push(s);
      });

      reindexScenes(p);
      touch(p);
      return cur;
    });
    return { ok: true, data };
  },

  save_settings: ({ settings }, ctx) => {
    const data = ctx.updateConfig(DATA_PATH, (prev) => {
      const cur = normalizeData(prev);
      cur.settings = { ...cur.settings, ...(settings && typeof settings === 'object' ? settings : {}) };
      return cur;
    });
    return { ok: true, data };
  },
};

// 保证角色图片只有一个 selected
function ensureSingleSelected(character) {
  const imgs = Array.isArray(character.images) ? character.images : [];
  const selected = imgs.find((i) => i.selected);
  if (selected) imgs.forEach((i) => { i.selected = i.id === selected.id; });
}

// 按 scenes 数组顺序重排 index（1 起）
function reindexScenes(project) {
  (project.scenes || []).forEach((s, i) => { s.index = i + 1; });
}
