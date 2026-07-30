/**
 * 分组（WorkflowGroup）相关纯辅助函数。
 *
 * 从 Canvas.jsx 的 handleGroupMove / handleGroupConnect 抽出去重的递归逻辑。
 * WorkflowGroup 支持嵌套（childGroupIds），遍历时需递归收集所有子孙节点 id。
 */

/**
 * 递归收集一个分组及其所有子分组包含的节点 id（含嵌套）。
 * 防环：用 visited 记录已访问的 group id。
 * @param {Array} groups 所有分组
 * @param {string} groupId 起始分组 id
 * @returns {string[]} 该分组树下所有节点 id（去重）
 */
export function collectGroupNodeIds(groups, groupId) {
  const ids = new Set();
  const collect = (gid, visited = new Set()) => {
    if (visited.has(gid)) return;
    visited.add(gid);
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    g.childNodeIds.forEach((id) => ids.add(id));
    g.childGroupIds.forEach((cg) => collect(cg, visited));
  };
  collect(groupId);
  return [...ids];
}

/**
 * 找出分组树内的「末端叶子节点」：在组范围内没有下游（出边 target 不在组内）的节点。
 * 用于分组输出连线：从组拖到 target 时，把组内叶子节点连到 target。
 * @param {Array} groups 所有分组
 * @param {Array} edges 所有边
 * @param {string} groupId 起始分组 id
 * @returns {string[]} 叶子节点 id 列表
 */
export function findLeafNodeIds(groups, edges, groupId) {
  const groupIds = new Set(collectGroupNodeIds(groups, groupId));
  // 叶子节点：组内节点中，没有出边 target 也在组内的
  const hasInternalDownstream = (nodeId) =>
    edges.some((e) => e.source === nodeId && groupIds.has(e.target));
  return [...groupIds].filter((id) => !hasInternalDownstream(id));
}

/**
 * 返回包含指定屏幕坐标的最小矩形 id，用于嵌套/重叠分组的拖入命中。
 */
export function findSmallestContainingRectId(point, targets) {
  return targets
    .filter(({ rect }) => (
      point.x >= rect.left && point.x <= rect.right
      && point.y >= rect.top && point.y <= rect.bottom
    ))
    .sort((a, b) => (
      (a.rect.right - a.rect.left) * (a.rect.bottom - a.rect.top)
      - (b.rect.right - b.rect.left) * (b.rect.bottom - b.rect.top)
    ))[0]?.id ?? null;
}
