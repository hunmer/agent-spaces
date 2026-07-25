import { useCallback, useMemo, useState } from 'react';
import { addEdge, MarkerType } from '@xyflow/react';
import { genId } from '../utils/canvas-id';
import { collectGroupNodeIds, findLeafNodeIds } from '../utils/group-helpers';

/**
 * 分组（WorkflowGroup）数据操作 + overlay 交互。
 * 从 Canvas.jsx 抽出（原 B8 分组数据 ops + B15 overlay 移动/连线）。
 *
 * 分组不是 ReactFlow 节点，是独立 state（与 nodes/edges 平级），
 * 由 WorkflowGroupOverlay 在 ViewportPortal 内按子节点包围盒贴合渲染。
 *
 * @param {object} deps
 * @param {Array} deps.groups
 * @param {Array} deps.nodes
 * @param {Array} deps.edges
 * @param {Function} deps.setGroups
 * @param {Function} deps.setNodes
 * @param {Function} deps.setEdges
 * @param {object} deps.reactFlow  useReactFlow() 返回值（screenToFlowPosition）
 */
export default function useGroupOperations({ groups, nodes, edges, setGroups, setNodes, setEdges, reactFlow }) {
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  // 分组 overlay 的子节点映射（WorkflowGroupOverlay 需要的 childNodes/isSelected）
  const groupOverlayItems = useMemo(() => groups.map((group) => ({
    group,
    childNodes: nodes
      .filter((n) => group.childNodeIds.includes(n.id))
      .map((n) => ({ id: n.id, position: n.position, width: n.width, height: n.height })),
  })), [groups, nodes]);

  // 删除分组（仅删 group 数据，保留其中的图片子节点）
  const deleteGroup = useCallback((groupId) => {
    if (!groupId) return;
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, [setGroups]);

  // 更新分组（重命名/颜色/锁定等，WorkflowGroupOverlay 回调）
  const updateGroup = useCallback((groupId, updates) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...updates } : g)));
  }, [setGroups]);

  // 合并选中节点为一个分组（底部 toolbar 触发）：取当前选中节点 id 建 group 数据，
  // 分组名 = 「分组 N」（N = 当前分组数 + 1）。建完清空选中，避免工具栏持续显示。
  const createGroupFromSelection = useCallback(() => {
    const ids = nodes.filter((n) => n.selected).map((n) => n.id);
    if (ids.length < 2) return;
    const name = `分组 ${groups.length + 1}`;
    setGroups((prev) => [...prev, {
      id: genId('group'),
      name,
      childNodeIds: ids,
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }]);
    // 清空选中（ReactFlow 原生：把所有节点 selected 置 false）
    setNodes((prev) => prev.map((n) => (n.selected ? { ...n, selected: false } : n)));
  }, [nodes, groups.length, setGroups, setNodes]);

  // 拖拽分组时屏幕坐标差 → 画布坐标差（WorkflowGroupOverlay.onMove 需要）
  const screenDeltaToFlowDelta = useCallback((delta) => {
    const a = reactFlow.screenToFlowPosition({ x: 0, y: 0 });
    const b = reactFlow.screenToFlowPosition({ x: delta.x, y: delta.y });
    return { x: b.x - a.x, y: b.y - a.y };
  }, [reactFlow]);

  // 拖拽分组：把整组（含子组）按 delta 平移
  const handleGroupMove = useCallback((groupId, delta) => {
    if (!delta || (delta.x === 0 && delta.y === 0)) return;
    const ids = new Set(collectGroupNodeIds(groups, groupId));
    setNodes((prev) => prev.map((n) => ids.has(n.id)
      ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } }
      : n));
  }, [groups, setNodes]);

  // 分组输出连线：从 group 手柄拖到 targetNodeId 松手时，把组内「末端叶子节点」的输出
  // 连到 targetNodeId。多选增强：一次建多条边（去重，已有连线不重复加）。
  const handleGroupConnect = useCallback((groupId, targetNodeId) => {
    setEdges((prev) => {
      const groupIds = new Set(collectGroupNodeIds(groups, groupId));
      // 目标不能是组内节点（否则自连）
      if (groupIds.has(targetNodeId)) return prev;
      const leafIds = findLeafNodeIds(groups, prev, groupId);
      if (!leafIds.length) return prev;
      const existing = new Set(prev.map((e) => `${e.source}->${e.target}`));
      let next = prev;
      for (const source of leafIds) {
        const key = `${source}->${targetNodeId}`;
        if (existing.has(key)) continue;
        existing.add(key);
        next = addEdge(
          {
            source,
            target: targetNodeId,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          next,
        );
      }
      return next;
    });
  }, [groups, setEdges]);

  return {
    selectedGroupId, setSelectedGroupId,
    groupOverlayItems,
    deleteGroup, updateGroup, createGroupFromSelection,
    screenDeltaToFlowDelta, handleGroupMove, handleGroupConnect,
  };
}
