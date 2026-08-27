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

/** 为目标节点收集直接文本上游的 output 属性，供 {{node.key}} 候选使用。 */
export function computeTextOutputSuggestions(nodes, edges) {
  const byId = new Map((nodes || []).map((node) => [node.id, node]));
  const result = new Map();
  (edges || []).forEach((edge) => {
    if (edge?.data?.inputType !== 'text' || !edge.target) return;
    const source = byId.get(edge.source);
    const output = source?.data?.output;
    if (!source || !output || typeof output !== 'object') return;
    const nodeLabel = source.data?.title || source.data?.label || source.type || source.id;
    const list = result.get(edge.target) || [];
    Object.entries(output).forEach(([key, raw]) => {
      if (raw === null || raw === undefined || typeof raw === 'object') return;
      const value = typeof raw === 'string' ? htmlToPlainText(raw) : String(raw);
      if (!list.some((item) => item.nodeId === source.id && item.key === key)) {
        list.push({ nodeId: source.id, nodeLabel, key, value });
      }
    });
    result.set(edge.target, list);
  });
  return result;
}
