function edgeIdBase(edge) {
  const parts = [
    edge?.source,
    edge?.sourceHandle,
    edge?.target,
    edge?.targetHandle,
    edge?.data?.inputTarget,
  ].map((value) => encodeURIComponent(String(value || '')));
  return `edge-${parts.join('-')}`;
}

/** 保留已有唯一 ID，并为缺失或重复 ID 的边生成稳定唯一 ID。 */
export function ensureEdgeIds(edges) {
  if (!Array.isArray(edges) || !edges.length) return Array.isArray(edges) ? edges : [];

  const reserved = new Set();
  for (const edge of edges) {
    if (typeof edge?.id === 'string' && edge.id.trim()) reserved.add(edge.id);
  }

  const seenExisting = new Set();
  const generated = new Set();
  let changed = false;
  const normalized = edges.map((edge) => {
    const existingId = typeof edge?.id === 'string' ? edge.id.trim() : '';
    if (existingId && !seenExisting.has(existingId)) {
      seenExisting.add(existingId);
      return edge;
    }

    changed = true;
    const base = edgeIdBase(edge);
    let id = base;
    let suffix = 2;
    while (reserved.has(id) || generated.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    generated.add(id);
    return { ...edge, id };
  });

  return changed ? normalized : edges;
}
