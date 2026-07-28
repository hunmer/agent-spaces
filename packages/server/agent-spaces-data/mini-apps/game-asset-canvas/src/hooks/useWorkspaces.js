import { useCallback, useEffect, useState } from 'react';
import { onAnyConfigChanged } from '../utils/storage';
import { WORKSPACES_CONFIG, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from '../utils/constants';

// 兜底清单：首次无 workspaces.json 时，保证有一个默认工作区可用
const FALLBACK = {
  activeId: DEFAULT_WORKSPACE_ID,
  workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME, createdAt: Date.now() }],
};

/**
 * 多工作区管理：
 * - workspaces：工作区列表（id/name/createdAt）
 * - activeId：当前激活工作区 id
 * - create/rename/switch/remove：调服务端单写者，写回 workspaces.json 并广播
 *
 * 切换工作区由调用方（Canvas）通过 activeId 变化触发 useCanvasState/useGenerationHistory 重载。
 */
export default function useWorkspaces() {
  const [manifest, setManifest] = useState(FALLBACK);

  useEffect(() => {
    const as = window.AgentSpaces;
    const apply = (value) => {
      if (value && Array.isArray(value.workspaces) && value.workspaces.length) {
        setManifest(value);
      }
    };
    // 初始快照 + onConfigReady 兜底（config 可能未 ready）
    apply(as?.getConfig?.(WORKSPACES_CONFIG));
    const unsubReady = as?.onConfigReady?.((configs) => apply(configs?.[WORKSPACES_CONFIG]));
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === WORKSPACES_CONFIG) apply(value);
    });
    return () => {
      try { unsub(); } catch {}
      try { unsubReady?.(); } catch {}
    };
  }, []);

  const createWorkspace = useCallback(async (name, directory) => {
    const res = await window.AgentSpaces?.invokeService?.('create_workspace', { name, directory });
    return res;
  }, []);

  const renameWorkspace = useCallback(async (id, name, directory) => {
    const res = await window.AgentSpaces?.invokeService?.('rename_workspace', { id, name, directory });
    return res;
  }, []);

  const switchWorkspace = useCallback(async (id) => {
    const res = await window.AgentSpaces?.invokeService?.('switch_workspace', { id });
    return res;
  }, []);

  const deleteWorkspace = useCallback(async (id) => {
    const res = await window.AgentSpaces?.invokeService?.('delete_workspace', { id });
    return res;
  }, []);

  return {
    workspaces: manifest.workspaces,
    activeId: manifest.activeId || manifest.workspaces[0]?.id,
    createWorkspace,
    renameWorkspace,
    switchWorkspace,
    deleteWorkspace,
  };
}
