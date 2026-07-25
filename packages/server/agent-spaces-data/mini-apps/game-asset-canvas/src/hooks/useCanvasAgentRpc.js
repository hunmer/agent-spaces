import { useEffect, useRef } from 'react';
import { addEdge, MarkerType } from '@xyflow/react';
import { NODE_META } from '../utils/constants';
import { DEFAULT_SIZE, initialData } from '../utils/canvas-constants';
import { genId, autoPosition } from '../utils/canvas-id';

/**
 * Agent RPC 入口：服务端 src/api.js 的画布操作 tool 通过 ctx.requestClient 发来
 * miniApp.clientRequest 事件，这里按 type 分流到节点/边操作方法，
 * 再用 window.AgentSpaces.respondClientRequest 把结果回给服务端（Promise resolve）。
 *
 * 从 Canvas.jsx 抽出（原 B11）。**关键优化**：用 ref 持有最新的 nodes/edges/callbacks，
 * effect 只订阅一次 WS（deps=[]），避免原实现每次 nodes/edges 变都重新订阅导致的潜在抖动。
 *
 * @param {object} deps
 * @param {Array} deps.nodes
 * @param {Array} deps.edges
 * @param {Function} deps.createNodeAt
 * @param {Function} deps.updateNodeData
 * @param {Function} deps.handleDeleteNode
 * @param {Function} deps.focusNode
 * @param {Function} deps.setNodes
 * @param {Function} deps.setEdges
 */
export default function useCanvasAgentRpc({ nodes, edges, createNodeAt, updateNodeData, handleDeleteNode, focusNode, setNodes, setEdges }) {
  // ref 持有最新值，effect 只订阅一次
  const ctxRef = useRef({ nodes, edges, createNodeAt, updateNodeData, handleDeleteNode, focusNode, setNodes, setEdges });
  ctxRef.current = { nodes, edges, createNodeAt, updateNodeData, handleDeleteNode, focusNode, setNodes, setEdges };

  useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS?.onTaskEvent) return;
    const respond = (requestId, result, ok = true, error) => {
      try { AS.respondClientRequest?.(requestId, result, ok, error); }
      catch (e) { console.error('respondClientRequest failed:', e); }
    };

    const unsubscribe = AS.onTaskEvent((event, data) => {
      if (event !== 'miniApp.clientRequest') return;
      const requestId = data?.requestId;
      const type = data?.type;
      const payload = data?.payload || {};
      if (!requestId || !type) return;

      // 每次回调读最新闭包（ref）
      const { nodes: curNodes, edges: curEdges, createNodeAt: createFn, updateNodeData: updateFn, handleDeleteNode: deleteFn, focusNode: focusFn, setNodes: setNodesFn, setEdges: setEdgesFn } = ctxRef.current;

      try {
        let result;
        switch (type) {
          case 'canvas.addNode': {
            const id = createFn(payload.type, payload.position || null, payload.data);
            if (payload.focus !== false) {
              setTimeout(() => focusFn(id), 0);
            }
            result = { ok: true, nodeId: id, position: payload.position || null };
            break;
          }
          case 'canvas.addNodes': {
            const specs = Array.isArray(payload.nodes) ? payload.nodes : [];
            if (!specs.length) throw new Error('nodes 不能为空');
            const ids = specs.map(() => genId('node'));
            setNodesFn((prev) => {
              const base = prev.length;
              const additions = specs.map((spec, i) => {
                const type = spec.type;
                const meta = NODE_META[type] || {};
                const size = DEFAULT_SIZE[type] || DEFAULT_SIZE.default;
                return {
                  id: ids[i],
                  type,
                  position: spec.position || autoPosition(base + i),
                  width: size.w,
                  height: size.h,
                  style: { width: size.w, height: size.h },
                  data: { ...initialData(type), label: meta.label, ...(spec.data || {}) },
                };
              });
              return [...prev, ...additions];
            });
            if (payload.focusFirst !== false && ids.length) {
              setTimeout(() => focusFn(ids[0]), 0);
            }
            result = { ok: true, nodeIds: ids };
            break;
          }
          case 'canvas.updateNodeData': {
            if (!payload.nodeId) throw new Error('nodeId 必填');
            updateFn(payload.nodeId, payload.data || {});
            result = { ok: true };
            break;
          }
          case 'canvas.deleteNode': {
            if (!payload.nodeId) throw new Error('nodeId 必填');
            if (!curNodes.some((n) => n.id === payload.nodeId)) {
              result = { ok: false, message: `节点不存在：${payload.nodeId}` };
            } else {
              deleteFn(payload.nodeId);
              result = { ok: true };
            }
            break;
          }
          case 'canvas.connectNodes': {
            const { sourceId, targetId } = payload;
            if (!sourceId || !targetId) throw new Error('sourceId 和 targetId 必填');
            const exists = curEdges.some((e) => e.source === sourceId && e.target === targetId);
            if (exists) {
              result = { ok: true, alreadyExists: true, message: '已存在连线' };
              break;
            }
            if (!curNodes.some((n) => n.id === sourceId)) {
              result = { ok: false, message: `源节点不存在：${sourceId}` };
              break;
            }
            if (!curNodes.some((n) => n.id === targetId)) {
              result = { ok: false, message: `目标节点不存在：${targetId}` };
              break;
            }
            setEdgesFn((prev) => addEdge(
              { source: sourceId, target: targetId, markerEnd: { type: MarkerType.ArrowClosed }, animated: true },
              prev,
            ));
            result = { ok: true, edgeId: `${sourceId}->${targetId}` };
            break;
          }
          case 'canvas.connectBatch': {
            const specs = Array.isArray(payload.edges) ? payload.edges : [];
            if (!specs.length) throw new Error('edges 不能为空');
            const existingIds = new Set(curNodes.map((n) => n.id));
            const existingEdges = new Set(curEdges.map((e) => `${e.source}->${e.target}`));
            const toAdd = [];
            let skipped = 0;
            let invalid = 0;
            for (const spec of specs) {
              const { sourceId, targetId } = spec;
              if (!existingIds.has(sourceId) || !existingIds.has(targetId)) { invalid++; continue; }
              if (existingEdges.has(`${sourceId}->${targetId}`)) { skipped++; continue; }
              existingEdges.add(`${sourceId}->${targetId}`);
              toAdd.push({ source: sourceId, target: targetId, markerEnd: { type: MarkerType.ArrowClosed }, animated: true });
            }
            if (toAdd.length) setEdgesFn((prev) => [...prev, ...toAdd]);
            result = {
              ok: true, created: toAdd.length, skipped, invalid,
              summary: `批量连线：新增 ${toAdd.length}，已存在 ${skipped}，无效 ${invalid}`,
            };
            break;
          }
          case 'canvas.getSelection': {
            const sel = curNodes.filter((n) => n.selected);
            result = {
              ok: true, count: sel.length,
              items: sel.map((n) => ({
                id: n.id, type: n.type,
                typeLabel: (NODE_META[n.type] && NODE_META[n.type].label) || n.type,
                label: n.data?.label || '',
              })),
            };
            break;
          }
          case 'canvas.deleteEdge': {
            const { sourceId, targetId } = payload;
            const before = curEdges.length;
            setEdgesFn((prev) => prev.filter((e) => !(e.source === sourceId && e.target === targetId)));
            result = { ok: true, removed: curEdges.some((e) => e.source === sourceId && e.target === targetId), before };
            break;
          }
          case 'canvas.getCanvas': {
            result = {
              ok: true,
              nodes: curNodes.map((n) => ({ id: n.id, type: n.type, label: n.data?.label || '', position: n.position })),
              edges: curEdges.map((e) => ({ source: e.source, target: e.target })),
            };
            break;
          }
          default:
            throw new Error(`未知 canvas RPC 类型: ${type}`);
        }
        respond(requestId, result);
      } catch (err) {
        console.error('canvas RPC error:', err);
        respond(requestId, null, false, err?.message || String(err));
      }
    });

    return () => { try { unsubscribe(); } catch {} };
  }, []); // 只订阅一次，靠 ref 读最新值
}
