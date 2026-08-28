const TARGET_COLLECTIONS = {
  node: 'nodes',
  group: 'groups',
};

const UPDATE_METHODS = new Set(['merge', 'replace', 'update', 'append', 'remove']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function setAtPath(target, path, value, method) {
  if (!path.length) return resolveUpdate(target, value, method);
  const [head, ...tail] = path;
  const base = isRecord(target) || Array.isArray(target) ? target : {};
  const next = Array.isArray(base) ? [...base] : { ...base };
  next[head] = setAtPath(base[head], tail, value, method);
  return next;
}

function removeKeys(target, value) {
  if (Array.isArray(target)) {
    const removeSet = new Set(Array.isArray(value) ? value : [value]);
    return target.filter((_item, index) => !removeSet.has(index));
  }
  if (!isRecord(target)) return target;
  const keys = Array.isArray(value) ? value : [value];
  const next = { ...target };
  keys.filter((key) => typeof key === 'string').forEach((key) => delete next[key]);
  return next;
}

function resolveUpdate(current, value, method) {
  if (method === 'update') {
    if (typeof value !== 'function') throw new TypeError('update method requires a function value');
    return cloneValue(value(current));
  }
  if (method === 'replace') return cloneValue(value);
  if (method === 'append') {
    const additions = typeof value === 'function' ? value(current) : value;
    return [...(Array.isArray(current) ? current : []), ...(Array.isArray(additions) ? additions : [additions])]
      .map(cloneValue);
  }
  if (method === 'remove') return removeKeys(current, value);

  const patch = typeof value === 'function' ? value(current) : value;
  if (isRecord(current) && isRecord(patch)) return { ...current, ...cloneValue(patch) };
  return cloneValue(patch);
}

/**
 * Apply one targeted canvas data update without replacing unrelated entities.
 * Requests must identify the source, target entity, key, value and method.
 */
export function applyCanvasCollectionUpdate(collection, request) {
  const {
    source,
    targetType = 'node',
    targetId,
    key,
    value,
    method = 'merge',
  } = request || {};
  if (typeof source !== 'string' || !source.trim()) return collection;
  if (!TARGET_COLLECTIONS[targetType] || typeof targetId !== 'string' || !targetId) return collection;
  if (typeof key !== 'string' || !key.trim() || !UPDATE_METHODS.has(method)) return collection;
  if (!Array.isArray(collection)) return collection;

  let changed = false;
  const path = key === '$' ? [] : key.split('.').filter(Boolean);
  const next = collection.map((entity) => {
    if (entity?.id !== targetId) return entity;
    const current = path.length === 1 ? entity[path[0]] : path.reduce(
      (result, segment) => result?.[segment], entity,
    );
    const updated = setAtPath(entity, path, value, method);
    if (Object.is(updated, current) || JSON.stringify(updated) === JSON.stringify(entity)) return entity;
    changed = true;
    return updated;
  });
  return changed ? next : collection;
}

export function summarizeCanvasUpdateValue(value) {
  if (typeof value === 'function') return '(function)';
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (isRecord(value)) {
    return {
      type: 'object',
      keys: Object.keys(value).slice(0, 12),
      imageCount: Array.isArray(value.images) ? value.images.length : undefined,
      runCount: Array.isArray(value.runs) ? value.runs.length : undefined,
      versionCount: Array.isArray(value.versions) ? value.versions.length : undefined,
    };
  }
  return value;
}

export { UPDATE_METHODS };
