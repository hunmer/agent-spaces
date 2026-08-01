const TRANSIENT_DATA_KEYS = new Set([
  'status', 'statusMsg', 'loading', 'error', 'output', 'versions', 'activeVersion',
]);

export function createCanvasSnapshot(nodes, edges, groups) {
  return { nodes, edges, groups };
}

export function canvasStateSyncSignature(state) {
  return JSON.stringify({
    nodes: state?.nodes || [],
    edges: state?.edges || [],
    groups: state?.groups || [],
    viewport: state?.viewport,
  });
}

export function canvasHistorySignature(snapshot) {
  return JSON.stringify({
    nodes: snapshot.nodes.map((node) => ({ id: node.id, type: node.type, data: node.data })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      data: edge.data,
    })),
  }, (key, value) => (TRANSIENT_DATA_KEYS.has(key) ? undefined : value));
}

export function describeCanvasChange(before, after) {
  const addedNodes = after.nodes.filter((node) => !before.nodes.some((item) => item.id === node.id));
  const removedNodes = before.nodes.filter((node) => !after.nodes.some((item) => item.id === node.id));
  const addedEdges = after.edges.filter((edge) => !before.edges.some((item) => item.id === edge.id));
  const removedEdges = before.edges.filter((edge) => !after.edges.some((item) => item.id === edge.id));

  if (addedNodes.length) return operation(`新增${countText(addedNodes.length)}节点`, 'add-node');
  if (removedNodes.length) return operation(`删除${countText(removedNodes.length)}节点`, 'delete-node');
  if (addedEdges.length) return operation(`新增${countText(addedEdges.length)}连线`, 'add-edge');
  if (removedEdges.length) return operation(`删除${countText(removedEdges.length)}连线`, 'delete-edge');

  const changedIds = after.nodes
    .filter((node) => {
      const previous = before.nodes.find((item) => item.id === node.id);
      return previous && canvasHistorySignature({ nodes: [previous], edges: [] })
        !== canvasHistorySignature({ nodes: [node], edges: [] });
    })
    .map((node) => node.id)
    .sort();
  return operation('修改节点表单', `update-node:${changedIds.join(',')}`);
}

export function restoreHistoryNodes(currentNodes, savedNodes) {
  return savedNodes.map((saved) => {
    const current = currentNodes.find((node) => node.id === saved.id);
    return current ? { ...current, type: saved.type, data: saved.data } : saved;
  });
}

function operation(label, key) {
  return { label, key };
}

function countText(count) {
  return count > 1 ? ` ${count} 个` : '';
}
