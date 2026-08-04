import { getEdgeColor } from './edge-display.js';
import { htmlToPlainText } from './input-images.js';

/**
 * 把文本变量边整理成节点编辑器可消费的字段绑定。
 * Map<nodeId, { [field]: { [variable]: Array<{edgeId,color,label,sourceId}> } }>
 */
export function computeTextVariableBindings(nodes, edges) {
  const nodeById = new Map((nodes || []).map((node) => [node.id, node]));
  const bindings = new Map();

  (edges || []).forEach((edge, edgeIndex) => {
    const field = edge?.data?.inputTarget;
    const variable = edge?.data?.inputVariable;
    if (edge?.data?.inputType !== 'text' || !field || !variable || !edge.target) return;
    if (!bindings.has(edge.target)) bindings.set(edge.target, {});
    const fields = bindings.get(edge.target);
    if (!fields[field]) fields[field] = {};
    if (!fields[field][variable]) fields[field][variable] = [];
    const source = nodeById.get(edge.source);
    fields[field][variable].push({
      edgeId: edge.id,
      sourceId: edge.source,
      color: getEdgeColor(edge, edgeIndex),
      label: source?.data?.title || source?.data?.label || source?.type || edge.source,
      value: htmlToPlainText(source?.data?.output?.text || ''),
    });
  });

  return bindings;
}
