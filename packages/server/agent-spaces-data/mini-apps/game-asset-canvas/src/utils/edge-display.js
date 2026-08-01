export const INPUT_EDGE_COLOR = '#2563eb';
export const OUTPUT_EDGE_COLOR = '#16a34a';

export function decorateEdgesForSelection(edges, nodes, pathStyle, lineStyle) {
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  const inputCounts = new Map();
  const outputCounts = new Map();

  return edges.map((edge) => {
    const inputIndex = (inputCounts.get(edge.target) || 0) + 1;
    const outputIndex = (outputCounts.get(edge.source) || 0) + 1;
    inputCounts.set(edge.target, inputIndex);
    outputCounts.set(edge.source, outputIndex);

    const isInput = selectedIds.has(edge.target);
    const isOutput = !isInput && selectedIds.has(edge.source);
    const highlightColor = isInput ? INPUT_EDGE_COLOR : (isOutput ? OUTPUT_EDGE_COLOR : null);

    return {
      ...edge,
      type: 'floating',
      animated: false,
      label: isInput ? `输入${inputIndex}` : (isOutput ? `输出${outputIndex}` : null),
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

function withoutDash(style) {
  if (!style?.strokeDasharray && !style?.['stroke-dasharray']) return style;
  const next = { ...style };
  delete next.strokeDasharray;
  delete next['stroke-dasharray'];
  return next;
}
