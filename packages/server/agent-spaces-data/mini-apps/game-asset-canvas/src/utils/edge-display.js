import { getConnectionTargets } from './connection-targets.js';

export const INPUT_EDGE_COLOR = '#2563eb';
export const OUTPUT_EDGE_COLOR = '#16a34a';
export const SELECTED_EDGE_COLOR = '#6366f1';

export const EDGE_COLOR_PALETTE = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ea580c',
  '#a16207', '#db2777', '#4f46e5', '#0d9488', '#65a30d', '#c026d3',
];

/** 同一 edges 顺序下稳定分配颜色；edge.data.edgeColor 可覆盖自动颜色。 */
export function getEdgeColor(edge, index = 0) {
  if (edge?.data?.edgeColor) return edge.data.edgeColor;
  if (index < EDGE_COLOR_PALETTE.length) return EDGE_COLOR_PALETTE[index];
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue} 68% 42%)`;
}

export function decorateEdgesForSelection(
  edges, nodes, pathStyle, lineStyle, nodeParamsSchema = {}, hoveredNodeId = null,
) {
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const inputCounts = new Map();
  const outputCounts = new Map();

  return edges.map((edge, edgeIndex) => {
    const inputIndex = (inputCounts.get(edge.target) || 0) + 1;
    const outputIndex = (outputCounts.get(edge.source) || 0) + 1;
    inputCounts.set(edge.target, inputIndex);
    outputCounts.set(edge.source, outputIndex);

    const isInput = selectedIds.has(edge.target);
    const isOutput = !isInput && selectedIds.has(edge.source);
    // 选中态只控制边强调；标签跟随节点 hover，避免点击后常驻遮挡画布。
    const isHoveredInput = hoveredNodeId === edge.target;
    const isHoveredOutput = !isHoveredInput && hoveredNodeId === edge.source;
    const highlightColor = getEdgeColor(edge, edgeIndex);
    const targetLabel = isHoveredInput || isHoveredOutput
      ? getEdgeTargetLabel(edge, nodeMap, nodeParamsSchema)
      : null;

    return {
      ...edge,
      type: 'floating',
      animated: false,
      label: isHoveredInput
        ? (targetLabel || `输入${inputIndex}`)
        : (isHoveredOutput ? (targetLabel || `输出${outputIndex}`) : null),
      data: {
        ...(edge.data || {}), pathStyle, lineStyle, highlightColor,
        selected: edge.selected === true,
        source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle,
      },
      markerEnd: { ...(edge.markerEnd || { type: 'arrowclosed' }), color: highlightColor },
      style: {
        ...(withoutDash(edge.style) || {}),
        stroke: highlightColor,
        strokeWidth: edge.selected ? 3 : (isInput || isOutput ? 2.5 : 1.75),
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
    edge.data?.inputType,
  );
  const targetId = edge.data?.inputTarget;
  const targetLabel = (targets.find((target) => target.id === targetId) || targets[0])?.label || targetId || null;
  const inputVariable = edge.data?.inputVariable;
  return targetLabel && inputVariable ? `${targetLabel} · {${inputVariable}}` : targetLabel;
}

function withoutDash(style) {
  if (!style?.strokeDasharray && !style?.['stroke-dasharray']) return style;
  const next = { ...style };
  delete next.strokeDasharray;
  delete next['stroke-dasharray'];
  return next;
}
