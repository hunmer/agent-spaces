import { genId } from './canvas-id.js';

export function addNodeIdsToGroup(groups, groupName, nodeIds) {
  if (!groupName || !nodeIds?.length) return groups;
  const index = groups.findIndex((group) => group.name === groupName);
  if (index < 0) {
    return [...groups, {
      id: genId('group'),
      name: groupName,
      childNodeIds: [...new Set(nodeIds)],
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }];
  }

  const next = [...groups];
  next[index] = {
    ...next[index],
    childNodeIds: [...new Set([...(next[index].childNodeIds || []), ...nodeIds])],
  };
  return next;
}

export function removeNodeIdFromGroups(groups, nodeId) {
  return groups.map((group) => ({
    ...group,
    childNodeIds: (group.childNodeIds || []).filter((id) => id !== nodeId),
  }));
}
