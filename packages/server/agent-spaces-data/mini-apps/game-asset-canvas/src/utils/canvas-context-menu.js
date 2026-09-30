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

/** 将 SearchSelect 的扁平节点选项转换为原生菜单可渲染的有序分组。 */
export function groupContextMenuOptions(options) {
  const groups = new Map();
  for (const option of options || []) {
    const label = option.group || '其他';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(option);
  }
  return Array.from(groups, ([label, items]) => ({ label, items }));
}
