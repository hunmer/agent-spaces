import { useCallback, useEffect, useState } from 'react';
import { onAnyConfigChanged } from '../utils/storage';
import { loadDefaultPrompts } from '../utils/prompts';

const PROMPT_CONFIG = 'prompt-library.json';

/**
 * 提示词库：默认值（随仓库预置，src/data/prompt-defaults.json）+ 用户库（configs/prompt-library.json）。
 *
 * 合并规则：
 * - 用户库按 id 覆盖默认值（用户编辑过的内置项以用户库为准）
 * - 用户独有新增（默认中无此 id）保留
 * - 默认中独有项（用户库未覆盖）也展示，标记 builtin
 * - 用户库独有项标记 custom
 *
 * 「重置」按钮：调 reset_prompts（默认值覆盖同 id，保留用户独有新增）。
 *
 * 模式同 useGenerationHistory：getConfig + onConfigReady 初始读取，
 * onAnyConfigChanged 多端同步，invokeService 单写者（save_prompt/delete_prompt/reset_prompts）。
 *
 * @returns {{
 *   categories: array,
 *   mergedPrompts: array,       // 合并后的全部提示词（含 builtin/custom 标记）
 *   savePrompt:(item)=>Promise,
 *   deletePrompt:(id)=>Promise,
 *   resetPrompts:()=>Promise,
 *   defaults: array,            // 默认值（只读基准，含 builtin 标记）
 * }}
 */
export default function usePromptLibrary() {
  const [customPrompts, setCustomPrompts] = useState([]);
  const [defaults, setDefaults] = useState([]);

  // 加载默认值（异步 fetch src/data/prompt-defaults.json，同会话缓存）
  useEffect(() => {
    let cancelled = false;
    loadDefaultPrompts().then((data) => {
      if (!cancelled) setDefaults(Array.isArray(data.prompts) ? data.prompts : []);
    });
    return () => { cancelled = true; };
  }, []);

  // 三重读取用户库：getConfig 快照 + onConfigReady 兜底 + onAnyConfigChanged 多端同步
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

  // 合并：用户库按 id 覆盖默认值，default 独有项保留并标记 builtin，user 独有项标记 custom
  const mergedPrompts = (() => {
    const userMap = new Map(customPrompts.map((p) => [p.id, p]));
    const seenIds = new Set(customPrompts.map((p) => p.id));
    const result = [];
    // 用户库项（含对内置的覆盖）在前
    for (const p of customPrompts) {
      const isFromDefault = defaults.some((d) => d.id === p.id);
      result.push({ ...p, custom: true, builtin: isFromDefault });
    }
    // 默认库独有项（用户库未覆盖、未删除）在后
    for (const d of defaults) {
      if (seenIds.has(d.id)) continue;
      result.push({ ...d, custom: false, builtin: true });
    }
    return result;
  })();

  // 分类 id 集合（用于 UI 分类筛选 chip）—— 取合并后所有出现过的 category
  const categories = Array.from(new Set(mergedPrompts.map((p) => p.category).filter(Boolean)));

  const savePrompt = useCallback(async (item) => {
    await window.AgentSpaces?.invokeService?.('save_prompt', { item });
  }, []);

  const deletePrompt = useCallback(async (id) => {
    await window.AgentSpaces?.invokeService?.('delete_prompt', { id });
  }, []);

  // 重置：默认值覆盖同 id，保留用户独有新增。defaults 由前端传入（服务端无法读 src）
  const resetPrompts = useCallback(async () => {
    await window.AgentSpaces?.invokeService?.('reset_prompts', { defaults });
  }, [defaults]);

  return {
    customPrompts,
    defaults,
    mergedPrompts,
    categories,
    savePrompt,
    deletePrompt,
    resetPrompts,
  };
}
