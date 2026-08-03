import { getConnectionTargets } from './connection-targets.js';

export const INPUT_EDGE_COLOR = '#2563eb';
export const OUTPUT_EDGE_COLOR = '#16a34a';
export const SELECTED_EDGE_COLOR = '#6366f1';

export function decorateEdgesForSelection(
  edges, nodes, pathStyle, lineStyle, nodeParamsSchema = {},
) {
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const inputCounts = new Map();
  const outputCounts = new Map();

  return edges.map((edge) => {
    const inputIndex = (inputCounts.get(edge.target) || 0) + 1;
    const outputIndex = (outputCounts.get(edge.source) || 0) + 1;
    inputCounts.set(edge.target, inputIndex);
    outputCounts.set(edge.source, outputIndex);

    const isInput = selectedIds.has(edge.target);
    const isOutput = !isInput && selectedIds.has(edge.source);
    const highlightColor = edge.selected
      ? SELECTED_EDGE_COLOR
      : (isInput ? INPUT_EDGE_COLOR : (isOutput ? OUTPUT_EDGE_COLOR : null));
    const targetLabel = isInput || isOutput
      ? getEdgeTargetLabel(edge, nodeMap, nodeParamsSchema)
      : null;

    return {
      ...edge,
      type: 'floating',
      animated: false,
      label: isInput
        ? (targetLabel || `输入${inputIndex}`)
        : (isOutput ? (targetLabel || `输出${outputIndex}`) : null),
      data: { ...(edge.data || {}), pathStyle, lineStyle, highlightColor },
      markerEnd: highlightColor
        ? { ...(edge.markerEnd || { type: 'arrowclosed' }), color: highlightColor }
        : edge.markerEnd,
      style: {
        ...(withoutDash(edge.style) || {}),
        ...(highlightColor ? { stroke: highlightColor, strokeWidth: 2.5 } : {}),
      },
    };
  });
}

function getEdgeTargetLabel(edge, nodeMap, nodeParamsSchema) {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);
  if (!sourceNode || !targetNode) return null;

  const { targets } = getConnectionTargets(
    sourceNode.type,
    targetNode.type,
    nodeParamsSchema[targetNode.type] || [],
  );
  const targetId = edge.data?.inputTarget;
  return (targets.find((target) => target.id === targetId) || targets[0])?.label || targetId || null;
}

function withoutDash(style) {
  if (!style?.strokeDasharray && !style?.['stroke-dasharray']) return style;
  const next = { ...style };
  delete next.strokeDasharray;
  delete next['stroke-dasharray'];
  return next;
}
