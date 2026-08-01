export function hasNodeOutput(node) {
  const output = node?.data?.output;
  if (!output || typeof output !== 'object') return false;
  return Object.values(output).some((value) => {
    if (Array.isArray(value)) return value.some(Boolean);
    if (typeof value === 'string') return value.trim().length > 0;
    return value != null && value !== false;
  });
}

export function countNodesWithOutput(nodes) {
  return (nodes || []).filter(hasNodeOutput).length;
}
