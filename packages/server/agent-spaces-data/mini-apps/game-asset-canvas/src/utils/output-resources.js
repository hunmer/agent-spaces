function optionalText(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function legacyOutputResourceId(url, index) {
  let hash = 2166136261;
  for (const char of String(url || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `output-${(hash >>> 0).toString(36)}-${index}`;
}

export function createOutputResourceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `output-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createOutputAssetItems(images, resources = []) {
  const urls = Array.isArray(images) ? images : [];
  const sourceResources = Array.isArray(resources) ? resources : [];
  const queues = new Map();
  const used = new Set();

  sourceResources.forEach((resource, index) => {
    if (!resource?.url) return;
    if (!queues.has(resource.url)) queues.set(resource.url, []);
    queues.get(resource.url).push({ resource, index });
  });

  return urls.map((url, index) => {
    let resource = sourceResources[index];
    if (resource?.url === url) {
      used.add(index);
    } else {
      const match = (queues.get(url) || []).find((entry) => !used.has(entry.index));
      resource = match?.resource;
      if (match) used.add(match.index);
    }
    const normalized = resource?.url === url
      ? { ...resource, id: resource.id || legacyOutputResourceId(url, index) }
      : { id: legacyOutputResourceId(url, index), url, thumb: url };
    return {
      index,
      id: normalized.id,
      key: `${index}:${url}`,
      url,
      resource: normalized,
      groupName: optionalText(normalized.groupName),
      label: optionalText(normalized.label),
    };
  });
}

export function groupOutputAssetItems(items) {
  const sections = [];
  const byKey = new Map();

  for (const item of items || []) {
    const key = item.groupName ? `group:${item.groupName}` : 'ungrouped';
    let section = byKey.get(key);
    if (!section) {
      section = { key, groupName: item.groupName, items: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

export function removeOutputAssetItems(images, resources, ids) {
  const removedIds = new Set(
    (Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === 'string' && id),
  );
  const items = createOutputAssetItems(images, resources)
    .filter((item) => !removedIds.has(item.id));
  return {
    images: items.map((item) => item.url),
    resources: items.map((item) => item.resource),
  };
}

export function updateOutputVersion(versions, activeVersion, output) {
  if (!Array.isArray(versions) || !Number.isInteger(activeVersion) || !versions[activeVersion]) {
    return versions;
  }
  return versions.map((version, index) => index === activeVersion
    ? { ...version, output: { ...(version.output || {}), ...output } }
    : version);
}
