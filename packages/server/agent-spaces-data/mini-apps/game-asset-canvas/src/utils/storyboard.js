import { BUILTIN_PLUGIN } from './constants.js';

export const STORYBOARD_AGENT_SYSTEM_PROMPT = `你是一位专业分镜师。把用户文案拆成可直接用于素材生成的分镜 JSON。
只输出 JSON，不要 markdown 或解释。结构必须是：
{"characters":[{"name":"角色名","prompt":"角色视觉描述"}],"scenes":[{"index":1,"narration":"旁白或台词","visualPrompt":"场景、主体、构图、光线和风格","animationPrompt":"运镜、动作和节奏","characterNames":["角色名"]}]}
角色名必须前后一致；无角色时 characters 和 characterNames 使用空数组。`;
export const STORYBOARD_AGENT_INIT_NAME = '分镜创作师';

export function storyboardId(prefix = 'story') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createStoryboardScene(index) {
  return {
    id: storyboardId('scene'),
    index,
    narration: '',
    visualPrompt: '',
    animationPrompt: '',
    characterIds: [],
    images: [],
    videos: [],
    audios: [],
  };
}

export function parseStoryboardJson(value) {
  let raw = String(value || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function runStoryboardAgent(text, agentConfigId) {
  const presetId = String(agentConfigId || '').trim();
  if (!presetId) throw new Error('请先在画布设置中配置分镜创作 Agent');
  const ret = await window.AgentSpaces.callPluginTool(
    BUILTIN_PLUGIN,
    'agent_run',
    {
      prompt: `请将以下文案转换为分镜 JSON：\n\n${text}`,
      agentConfigId: presetId,
      permissionMode: 'bypassPermissions',
    },
    { meta: { mode: 'storyboard', label: '文案拆分分镜' } },
  );
  const raw = ret?.result?.result ?? ret?.result ?? ret?.output ?? ret;
  const parsed = parseStoryboardJson(raw);
  if (!parsed) throw new Error(`AI 未返回有效分镜 JSON：${String(raw || '').slice(0, 160)}`);
  return parsed;
}

export function normalizeImportedStoryboard(parsed, currentCharacters = []) {
  const characters = currentCharacters.map((item) => ({ ...item, images: [...(item.images || [])] }));
  const byName = new Map(characters.map((item) => [String(item.name || '').trim(), item]));
  for (const item of parsed?.characters || []) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const existing = byName.get(name);
    if (existing) {
      if (!existing.prompt && item.prompt) existing.prompt = item.prompt;
    } else {
      const created = { id: storyboardId('char'), name, prompt: item.prompt || '', images: [] };
      characters.push(created);
      byName.set(name, created);
    }
  }
  const scenes = (parsed?.scenes || []).map((item, index) => ({
    ...createStoryboardScene(Number(item?.index) || index + 1),
    narration: item?.narration || '',
    visualPrompt: item?.visualPrompt || '',
    animationPrompt: item?.animationPrompt || '',
    characterIds: (item?.characterNames || []).map((name) => byName.get(String(name).trim())?.id).filter(Boolean),
  }));
  return { characters, scenes };
}

export function reorderStoryboardScenes(scenes, sourceId, targetId) {
  const list = Array.isArray(scenes) ? scenes : [];
  const from = list.findIndex((scene) => scene.id === sourceId);
  const to = list.findIndex((scene) => scene.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((scene, index) => ({ ...scene, index: index + 1 }));
}
