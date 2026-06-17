// 参考文案分组：持久化到用户 settings（localStorage，per-project，不跨端），
// 走 window.AgentSpaces.getUserSetting / saveUserSettings，不再写入共享 config。
const KEY = 'referenceGroups';

function normalizeGroup(group) {
  return {
    id: String(group.id || '').trim(),
    name: String(group.name || '').trim(),
    itemIds: Array.isArray(group.itemIds) ? [...new Set(group.itemIds.map(String).filter(Boolean))] : [],
  };
}

export function loadReferenceGroups() {
  let raw;
  try {
    raw = window.AgentSpaces.getUserSetting(KEY, []);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeGroup).filter((group) => group.id && group.name);
}

export function saveReferenceGroups(groups) {
  const normalized = groups.map(normalizeGroup).filter((group) => group.id && group.name);
  try {
    window.AgentSpaces.saveUserSettings({ [KEY]: normalized });
  } catch {
    /* noop */
  }
}

export function makeGroupId() {
  const g = globalThis.crypto;
  return g?.randomUUID?.() || `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
