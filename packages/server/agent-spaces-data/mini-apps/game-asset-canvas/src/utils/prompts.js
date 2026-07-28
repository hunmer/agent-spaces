/**
 * 提示词库：默认值（只读基准）从 src/data/prompt-defaults.json 加载，
 * 用户库持久化到 configs/prompt-library.json（增删改 + 重置回默认）。
 *
 * 数据结构：{ id, category, title, desc, prompt, scene, aspect?, references? }
 * - category: 分组（见 PROMPT_CATEGORIES）
 * - scene:    适用场景 'text'(文生图) | 'edit'(编辑图片) | 'both'(两者皆可)
 * - aspect?:  建议比例（选填）。选中该条目时联动设置表单的比例下拉。
 * - references?: 参考图相对 src 目录的路径数组（如 ['assets/references/<id>/ref1.png']）
 *
 * 提示词正文多为英文（图生模型对英文提示词响应更好），title/desc 为中文便于检索。
 */

// 分类常量同步导出：UI 下拉框（PromptEditor/PromptPickerDialog）需要同步可用，
// 不依赖异步加载。默认值 json 里的 categories 与此处保持一致（构建时同步生成）。
export const PROMPT_CATEGORIES = [
  { id: 'character', label: '角色生成', icon: '🧙' },
  { id: 'icon', label: '画风 Icon', icon: '🎨' },
  { id: 'portrait', label: '画风人物立绘', icon: '🖼️' },
  { id: 'sprite', label: '精灵图动画', icon: '🎞️' },
  { id: 'background', label: '背景场景', icon: '🏞️' },
  { id: 'convert', label: '图像转换', icon: '🔄' },
];

// 默认值 json 的 src 相对路径（走 window.AgentSpaces.srcFileUrl 解析为 http URL）
const DEFAULTS_PATH = 'data/prompt-defaults.json';

// 内存缓存：同会话内默认值只 fetch 一次（json 随仓库分发，内容稳定）
let defaultsCache = null;

/**
 * 异步加载默认提示词库（含 categories + prompts）。
 * 走 window.AgentSpaces.srcFileUrl + fetch，fetch 失败/无数据时回落空结构。
 * 结果在内存缓存，避免重复网络请求。
 *
 * @returns {Promise<{ categories: array, prompts: array }>}
 */
export async function loadDefaultPrompts() {
  if (defaultsCache) return defaultsCache;
  const srcFileUrl = window?.AgentSpaces?.srcFileUrl;
  const fallback = { categories: PROMPT_CATEGORIES, prompts: [] };
  if (typeof srcFileUrl !== 'function') {
    defaultsCache = fallback;
    return defaultsCache;
  }
  try {
    const url = srcFileUrl(DEFAULTS_PATH);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`load default prompts failed: ${resp.status}`);
    const data = await resp.json();
    defaultsCache = {
      categories: Array.isArray(data?.categories) && data.categories.length ? data.categories : PROMPT_CATEGORIES,
      prompts: Array.isArray(data?.prompts) ? data.prompts : [],
    };
  } catch (err) {
    console.error('loadDefaultPrompts failed:', err);
    defaultsCache = fallback;
  }
  return defaultsCache;
}

/** 按适用场景过滤提示词（'text' 文生图 / 'edit' 编辑图片）。'both' 两边都返回。 */
export function getPromptsByScene(prompts, scene) {
  if (!Array.isArray(prompts)) return [];
  return prompts.filter((p) => p.scene === scene || p.scene === 'both');
}

/**
 * 判断表单是否有有效提示词：pickedPrompt（提示词库选中）或 prompt（输入框）任一非空即可。
 * 节点提交按钮的 disabled 条件统一用此 helper，避免两处（文生图/编辑图片）逻辑漂移。
 * @param {{ pickedPrompt?: string, prompt?: string }} params
 * @returns {boolean}
 */
export function hasPrompt(params) {
  const { pickedPrompt, prompt } = params || {};
  return Boolean((pickedPrompt || '').trim()) || Boolean((prompt || '').trim());
}
