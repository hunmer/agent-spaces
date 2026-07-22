import { useCallback, useEffect, useState } from 'react';
import { onAnyConfigChanged } from '../utils/storage';

const PROMPT_CONFIG = 'prompt-library.json';

/**
 * 自定义提示词库：用户增删的提示词持久化到 configs/prompt-library.json。
 * 内置提示词（utils/prompts.js PROMPT_LIBRARY）不在此管理，前端展示时合并。
 *
 * 模式同 useGenerationHistory：getConfig + onConfigReady 初始读取，
 * onAnyConfigChanged 多端同步，invokeService 单写者（save_prompt/delete_prompt）。
 *
 * @returns {{ customPrompts: array, savePrompt:(item)=>Promise, deletePrompt:(id)=>Promise }}
 */
export default function usePromptLibrary() {
  const [customPrompts, setCustomPrompts] = useState([]);

  useEffect(() => {
    const as = window.AgentSpaces;
    const apply = (value) => setCustomPrompts(Array.isArray(value) ? value : []);
    const snapshot = as?.getConfig?.(PROMPT_CONFIG);
    if (Array.isArray(snapshot)) apply(snapshot);
    const unsubReady = as?.onConfigReady?.((configs) => {
      apply(configs?.[PROMPT_CONFIG]);
    });
    const unsub = onAnyConfigChanged((path, value) => {
      if (path !== PROMPT_CONFIG) return;
      apply(value);
    });
    return () => {
      try { unsub(); } catch {}
      try { unsubReady?.(); } catch {}
    };
  }, []);

  const savePrompt = useCallback(async (item) => {
    await window.AgentSpaces?.invokeService?.('save_prompt', { item });
  }, []);

  const deletePrompt = useCallback(async (id) => {
    await window.AgentSpaces?.invokeService?.('delete_prompt', { id });
  }, []);

  return { customPrompts, savePrompt, deletePrompt };
}
