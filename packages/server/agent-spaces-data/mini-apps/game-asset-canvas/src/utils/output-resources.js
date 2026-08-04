function optionalText(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
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
    const normalized = resource?.url === url ? resource : { url, thumb: url };
    return {
      index,
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
