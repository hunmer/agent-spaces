import { useCallback, useMemo, useRef, useState } from 'react';
import { addEdge, MarkerType } from '@xyflow/react';
import { genId } from '../utils/canvas-id';
import {
  collectGroupNodeIds, findLeafNodeIds, findSmallestContainingRectId,
} from '../utils/group-helpers';

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
 * @param {React.RefObject<HTMLElement>} deps.canvasRef 画布根元素（读取分组和节点屏幕矩形）
 */
export default function useGroupOperations({
  groups, nodes, edges, setGroups, setNodes, setEdges, reactFlow, canvasRef,
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [deleteGroupId, setDeleteGroupId] = useState(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState(null);
  const [frozenGroupNode, setFrozenGroupNode] = useState(null);
  const dropTargetGroupIdRef = useRef(null);
  const nodeDragSessionRef = useRef(null);

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
      .map((n) => {
        const displayNode = frozenGroupNode?.id === n.id ? frozenGroupNode : n;
        return {
          id: n.id,
          position: displayNode.position,
          width: displayNode.width,
          height: displayNode.height,
        };
      }),
  })), [frozenGroupNode, groups, nodes]);
  const deleteGroupNodeCount = useMemo(
    () => (deleteGroupId ? collectGroupNodeIds(groups, deleteGroupId).length : 0),
    [deleteGroupId, groups],
  );

  // 请求删除：空分组直接删除；非空分组由键盘 Delete 和 overlay 删除按钮统一打开确认框。
  const requestDeleteGroup = useCallback((groupId) => {
    if (!groupId) return;
    const target = groupsRef.current.find((group) => group.id === groupId);
    const isEmpty = target
      && target.childNodeIds.length === 0
      && target.childGroupIds.length === 0;
    if (isEmpty) {
      setGroups((prev) => prev
        .filter((group) => group.id !== groupId)
        .map((group) => ({
          ...group,
          childGroupIds: group.childGroupIds.filter((id) => id !== groupId),
        })));
      setSelectedGroupId((current) => (current === groupId ? null : current));
      return;
    }
    setDeleteGroupId(groupId);
  }, [setGroups]);

  const cancelDeleteGroup = useCallback(() => setDeleteGroupId(null), []);

  // 删除分组；可选同时删除组内（含子组）的节点及相关连线。
  const confirmDeleteGroup = useCallback((deleteElements = false) => {
    const groupId = deleteGroupId;
    if (!groupId) return;
    const nodeIds = deleteElements
      ? new Set(collectGroupNodeIds(groupsRef.current, groupId))
      : new Set();

    if (nodeIds.size) {
      setNodes((prev) => prev.filter((node) => !nodeIds.has(node.id)));
      setEdges((prev) => prev.filter((edge) => !nodeIds.has(edge.source) && !nodeIds.has(edge.target)));
    }
    setGroups((prev) => prev
      .filter((group) => group.id !== groupId)
      .map((group) => ({
        ...group,
        childNodeIds: nodeIds.size
          ? group.childNodeIds.filter((id) => !nodeIds.has(id))
          : group.childNodeIds,
        childGroupIds: group.childGroupIds.filter((id) => id !== groupId),
      })));
    setSelectedGroupId(null);
    setDeleteGroupId(null);
  }, [deleteGroupId, setEdges, setGroups, setNodes]);

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

  const selectGroupNodes = useCallback((groupId) => {
    const ids = new Set(collectGroupNodeIds(groupsRef.current, groupId));
    setNodes((prev) => prev.map((node) => ({
      ...node,
      selected: ids.has(node.id),
    })));
    setSelectedGroupId(null);
  }, [setNodes]);

  // 拖拽分组时屏幕坐标差 → 画布坐标差（WorkflowGroupOverlay.onMove 需要）
  const screenDeltaToFlowDelta = useCallback((delta) => {
    const a = reactFlow.screenToFlowPosition({ x: 0, y: 0 }, { snapToGrid: false });
    const b = reactFlow.screenToFlowPosition(
      { x: delta.x, y: delta.y },
      { snapToGrid: false },
    );
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

  const clearNodeDragSession = useCallback(() => {
    nodeDragSessionRef.current = null;
    dropTargetGroupIdRef.current = null;
    setDropTargetGroupId(null);
    setFrozenGroupNode(null);
  }, []);

  // 节点分组关系由画布拖拽协调：overlay 只负责展示，不负责修改 childNodeIds。
  const handleNodeDragStart = useCallback((_event, node) => {
    clearNodeDragSession();
    const curNodes = nodesRef.current;
    if (curNodes.filter((item) => item.selected).length > 1) return;

    const curGroups = groupsRef.current;
    const originGroup = curGroups.find((group) => group.childNodeIds.includes(node.id)) ?? null;
    const unlockedGroupIds = new Set(curGroups.filter((group) => !group.locked).map((group) => group.id));
    const groupRects = Array.from(
      canvasRef.current?.querySelectorAll?.('[data-workflow-group-id]') ?? [],
    ).flatMap((element) => {
      const id = element.dataset.workflowGroupId;
      if (!id || !unlockedGroupIds.has(id)) return [];
      const rect = element.getBoundingClientRect();
      return [{ id, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } }];
    });

    nodeDragSessionRef.current = {
      nodeId: node.id,
      originGroupId: originGroup?.id ?? null,
      originGroupLocked: originGroup?.locked ?? false,
      detachOnDrop: false,
      initialNode: {
        id: node.id,
        position: { ...node.position },
        width: node.width,
        height: node.height,
      },
      groupRects,
    };
  }, [canvasRef, clearNodeDragSession]);

  const handleNodeDrag = useCallback((event, node) => {
    const session = nodeDragSessionRef.current;
    if (!session || session.nodeId !== node.id) return;
    const nodeElement = Array.from(
      canvasRef.current?.querySelectorAll?.('.react-flow__node') ?? [],
    ).find((element) => element.dataset.id === node.id);
    if (!nodeElement) return;

    const rect = nodeElement.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const ctrlPressed = 'ctrlKey' in event && event.ctrlKey;
    if (session.originGroupId) {
      const originRect = session.groupRects.find((item) => item.id === session.originGroupId);
      session.detachOnDrop = !session.originGroupLocked
        && ctrlPressed
        && (!originRect || findSmallestContainingRectId(center, [originRect]) === null);
      setFrozenGroupNode(ctrlPressed ? session.initialNode : null);
      return;
    }

    const nextGroupId = findSmallestContainingRectId(center, session.groupRects);
    dropTargetGroupIdRef.current = nextGroupId;
    setDropTargetGroupId((current) => (current === nextGroupId ? current : nextGroupId));
  }, [canvasRef]);

  const handleNodeDragStop = useCallback((event, node) => {
    const session = nodeDragSessionRef.current;
    if (!session || session.nodeId !== node.id) {
      clearNodeDragSession();
      return;
    }

    const targetGroupId = dropTargetGroupIdRef.current;
    if (!session.originGroupId && targetGroupId) {
      setGroups((prev) => prev.map((group) => (
        group.id === targetGroupId && !group.locked && !group.childNodeIds.includes(node.id)
          ? { ...group, childNodeIds: [...group.childNodeIds, node.id] }
          : group
      )));
    } else if (session.originGroupId && !session.originGroupLocked && event.ctrlKey && session.detachOnDrop) {
      setGroups((prev) => prev.map((group) => (
        group.id === session.originGroupId
          ? { ...group, childNodeIds: group.childNodeIds.filter((id) => id !== node.id) }
          : group
      )));
    }
    clearNodeDragSession();
  }, [clearNodeDragSession, setGroups]);

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
    dropTargetGroupId,
    deleteGroupId, deleteGroupNodeCount,
    groupOverlayItems,
    requestDeleteGroup, cancelDeleteGroup, confirmDeleteGroup,
    updateGroup, createGroupFromSelection, selectGroupNodes,
    screenDeltaToFlowDelta, handleGroupMove, handleGroupConnect,
    handleNodeDragStart, handleNodeDrag, handleNodeDragStop,
  };
}
