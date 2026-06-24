// 文案转分镜 · 数据编排 Hook
// 封装 service 调用 + configs/data.json 订阅，对外暴露当前项目与 actions
import { useState, useEffect, useCallback } from 'react';
import { DATA_PATH, createEmptyProject } from '../utils/constants.js';

export function useStore() {
  const AS = window.AgentSpaces;

  const [data, setData] = useState(() => {
    const initial = AS.getConfig?.(DATA_PATH);
    return initial && typeof initial === 'object' ? initial : null;
  });

  useEffect(() => {
    // 首次无数据时让服务端初始化默认结构
    if (!AS.getConfig?.(DATA_PATH)) {
      AS.invokeService?.('ensure_data')
        .then((res) => { if (res?.data) setData(res.data); })
        .catch(() => {});
    }
    // 订阅变更（多端同步兜底）
    const off = AS.onConfigChanged?.((path, value) => {
      if (path === DATA_PATH && value && typeof value === 'object') setData(value);
    });
    return () => off?.();
  }, []);

  const projectId = data?.activeProjectId || '';
  const project = (data?.projects || []).find((p) => p.id === projectId) || null;
  const settings = data?.settings || null;
  const projects = data?.projects || [];

  // 带 projectId 的 service 调用（针对当前项目）
  const call = useCallback(async (name, payload) => {
    const res = await AS.invokeService(name, { ...payload, projectId });
    if (res?.data) setData(res.data);
    return res;
  }, [projectId]);

  // 不带 projectId 的 service 调用（项目级 / 设置级）
  const callRaw = useCallback(async (name, payload) => {
    const res = await AS.invokeService(name, payload);
    if (res?.data) setData(res.data);
    return res;
  }, []);

  const actions = {
    newProject: (name) => {
      const proj = createEmptyProject(name);
      return callRaw('save_project', { project: proj })
        .then(() => callRaw('set_active_project', { id: proj.id }));
    },
    renameProject: (id, name) => callRaw('save_project', { project: { id, name } }),
    deleteProject: (id) => callRaw('delete_project', { id }),
    setActiveProject: (id) => callRaw('set_active_project', { id }),
    saveCharacter: (character) => call('save_character', { character }),
    deleteCharacter: (characterId) => call('delete_character', { characterId }),
    selectCharacterImage: (characterId, imageId) => call('select_character_image', { characterId, imageId }),
    saveScene: (scene) => call('save_scene', { scene }),
    deleteScene: (sceneId) => call('delete_scene', { sceneId }),
    reorderScenes: (sceneIds) => call('reorder_scenes', { sceneIds }),
    addSceneMedia: (sceneId, kind, urls) => call('add_scene_media', { sceneId, kind, urls }),
    clearSceneMedia: (sceneId, kind) => call('clear_scene_media', { sceneId, kind }),
    importStoryboard: (payload) => call('import_storyboard', payload),
    saveSettings: (patch) => callRaw('save_settings', { settings: patch }),
  };

  return { data, projects, project, projectId, settings, actions };
}
