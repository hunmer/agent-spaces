import { useCallback, useMemo, useRef, useState } from 'react';
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
 * createGroupFromSelection/handleGroupMove/handleGroupConnect 只需读 nodes/groups 当前值，
 * 不需响应式重建，故用 ref 持有最新值，deps 去掉 nodes/groups → 稳定 callback。
 * groupOverlayItems 是派生展示数据，仍需 useMemo 响应 groups/nodes 变化重算。
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

  // nodes/groups 的 ref 镜像：让「读最新值」的 callback 去掉对 nodes/groups 的依赖
  const nodesRef = useRef(nodes);
  const groupsRef = useRef(groups);
  nodesRef.current = nodes;
  groupsRef.current = groups;

  // 分组 overlay 的子节点映射（WorkflowGroupOverlay 需要的 childNodes/isSelected）。
  // 这是派生展示数据，必须响应 groups/nodes 变化重算（不能 ref）。
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
  // 用 nodesRef/groupsRef 读最新值，deps 不含 nodes/groups → 稳定 callback。
  const createGroupFromSelection = useCallback(() => {
    const curNodes = nodesRef.current;
    const curGroups = groupsRef.current;
    const ids = curNodes.filter((n) => n.selected).map((n) => n.id);
    if (ids.length < 2) return;
    const name = `分组 ${curGroups.length + 1}`;
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
  }, [setGroups, setNodes]);

  // 拖拽分组时屏幕坐标差 → 画布坐标差（WorkflowGroupOverlay.onMove 需要）
  const screenDeltaToFlowDelta = useCallback((delta) => {
    const a = reactFlow.screenToFlowPosition({ x: 0, y: 0 });
    const b = reactFlow.screenToFlowPosition({ x: delta.x, y: delta.y });
    return { x: b.x - a.x, y: b.y - a.y };
  }, [reactFlow]);

  // 拖拽分组：把整组（含子组）按 delta 平移。用 groupsRef 读最新值。
  const handleGroupMove = useCallback((groupId, delta) => {
    if (!delta || (delta.x === 0 && delta.y === 0)) return;
    const ids = new Set(collectGroupNodeIds(groupsRef.current, groupId));
    setNodes((prev) => prev.map((n) => ids.has(n.id)
      ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } }
      : n));
  }, [setNodes]);

  // 分组输出连线：从 group 手柄拖到 targetNodeId 松手时，把组内「末端叶子节点」的输出
  // 连到 targetNodeId。多选增强：一次建多条边（去重，已有连线不重复加）。
  // 用 groupsRef 读最新值。
  const handleGroupConnect = useCallback((groupId, targetNodeId) => {
    setEdges((prev) => {
      const curGroups = groupsRef.current;
      const groupIds = new Set(collectGroupNodeIds(curGroups, groupId));
      // 目标不能是组内节点（否则自连）
      if (groupIds.has(targetNodeId)) return prev;
      const leafIds = findLeafNodeIds(curGroups, prev, groupId);
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
  }, [setEdges]);

  return {
    selectedGroupId, setSelectedGroupId,
    groupOverlayItems,
    deleteGroup, updateGroup, createGroupFromSelection,
    screenDeltaToFlowDelta, handleGroupMove, handleGroupConnect,
  };
}
