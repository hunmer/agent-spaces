export function getContextMenuGroupId(target) {
  return target?.closest?.('[data-workflow-group-id]')?.dataset?.workflowGroupId || null;
}

export function addNodeToContextGroup(groups, groupId, nodeId) {
  if (!groupId || !nodeId) return groups;
  return groups.map((group) => (
    group.id === groupId && !group.childNodeIds?.includes(nodeId)
      ? { ...group, childNodeIds: [...(group.childNodeIds || []), nodeId] }
      : group
  ));
}

export function selectContextMenuNode(options, value, onClose) {
  const option = options.find((item) => item.value === value);
  if (!option) return;
  option.onSelect?.();
  onClose();
}

