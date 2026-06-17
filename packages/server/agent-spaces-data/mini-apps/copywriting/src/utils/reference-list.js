const KEY = 'copywriting-reference-groups.json';

function normalizeGroup(group) {
  return {
    id: String(group.id || '').trim(),
    name: String(group.name || '').trim(),
    itemIds: Array.isArray(group.itemIds) ? [...new Set(group.itemIds.map(String).filter(Boolean))] : [],
  };
}

export async function loadReferenceGroups() {
  const value = await window.AgentSpacesUI.readConfigJson(KEY);
  if (!value || typeof value !== 'object' || !Array.isArray(value.groups)) return [];
  return value.groups.map(normalizeGroup).filter((group) => group.id && group.name);
}

export async function saveReferenceGroups(groups) {
  await window.AgentSpacesUI.writeConfigJson(KEY, { groups: groups.map(normalizeGroup) });
}

export function makeGroupId() {
  const g = globalThis.crypto;
  return g?.randomUUID?.() || `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
