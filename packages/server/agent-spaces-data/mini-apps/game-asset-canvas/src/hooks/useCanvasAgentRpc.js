import { useEffect, useRef } from 'react';
import { addEdge, MarkerType } from '@xyflow/react';
import { NODE_META, NODE_TYPES, WORKFLOWS, VOICE_PROVIDER_OPTIONS, DEFAULT_VIDEO_MODEL, VIDEO_ASPECT_OPTIONS, VIDEO_QUALITY_OPTIONS, VIDEO_DURATION_OPTIONS, DEFAULT_MODEL, modelValuesToOptions } from '../utils/constants';
import { DEFAULT_SIZE, initialData, NODE_PARAMS_SCHEMA } from '../utils/canvas-constants';
import { CONNECTION_INPUT_TYPES, getConnectionTargets } from '../utils/connection-targets';
import { computeInputTexts } from '../utils/input-images';
import { genId } from '../utils/canvas-id';
import { autoLayoutSubset, findFreePositions } from '../utils/layout';
import { addNodeIdsToGroup, removeNodeIdFromGroups } from '../utils/agent-rpc-groups';
import { ensureEdgeIds } from '../utils/canvas-edges';
import { promptToText } from '../utils/workflow';

/** 新增节点后按最新分组成员重新布局。 */
function arrangeGroupAfterAdd(setNodes, edges, groups, groupName, addedNodeIds, layout) {
  if (!layout || !groupName || !addedNodeIds?.length) return [];
  const existingGroup = groups.find((group) => group.name === groupName);
  const nodeIds = [...new Set([...(existingGroup?.childNodeIds || []), ...addedNodeIds])];
  const options = {
    nodeIds,
    direction: layout.direction === 'TB' ? 'TB' : 'LR',
  };
  if (layout.grid) {
    options.grid = {
      rows: Math.max(1, Math.min(nodeIds.length, Number(layout.grid.rows) || 1)),
      columns: Math.max(1, Math.min(nodeIds.length, Number(layout.grid.columns) || 1)),
      horizontalGap: Math.max(0, Number(layout.grid.horizontalGap) || 0),
      verticalGap: Math.max(0, Number(layout.grid.verticalGap) || 0),
    };
  }
  setNodes((prev) => autoLayoutSubset(prev, edges, options));
  return nodeIds;
}

function resolveRpcConnection(sourceNode, targetNode, requestedTarget) {
  const { inputType, targets } = getConnectionTargets(
    sourceNode?.type,
    targetNode?.type,
    NODE_PARAMS_SCHEMA[targetNode?.type] || [],
  );
  if (!targets.length) {
    return { ok: false, message: '目标节点没有兼容的输入字段' };
  }
  const requested = typeof requestedTarget === 'string' ? requestedTarget.trim() : '';
  if (requested && !targets.some((target) => target.id === requested)) {
    return { ok: false, message: `inputTarget 无效，可用：${targets.map((target) => target.id).join(', ')}` };
  }
  if (!requested && inputType === CONNECTION_INPUT_TYPES.text && targets.length > 1) {
    return { ok: false, message: `目标节点有多个文本输入字段，请指定 inputTarget：${targets.map((target) => target.id).join(', ')}` };
  }
  return {
    ok: true,
    data: { inputType, inputTarget: requested || targets[0].id },
  };
}

function prepareBatchEdges(nodes, edges, specs) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const existingEdges = new Set(edges.map((edge) => `${edge.source}->${edge.target}`));
  const toAdd = [];
  let skipped = 0;
  let invalid = 0;
  for (const spec of specs) {
    const sourceNode = nodeMap.get(spec.sourceId);
    const targetNode = nodeMap.get(spec.targetId);
    if (!sourceNode || !targetNode) { invalid++; continue; }
    const edgeKey = `${spec.sourceId}->${spec.targetId}`;
    if (existingEdges.has(edgeKey)) { skipped++; continue; }
    const resolved = resolveRpcConnection(sourceNode, targetNode, spec.inputTarget);
    if (!resolved.ok) { invalid++; continue; }
    existingEdges.add(edgeKey);
    toAdd.push({
      source: spec.sourceId,
      target: spec.targetId,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true,
      data: resolved.data,
    });
  }
  const normalized = ensureEdgeIds([...edges, ...toAdd]);
  return { toAdd: normalized.slice(edges.length), skipped, invalid };
}

function mergeNodeData(current, incoming) {
  const merged = { ...incoming };
  for (const key of Object.keys(incoming)) {
    if (
      incoming[key] && typeof incoming[key] === 'object' && !Array.isArray(incoming[key])
      && current?.[key] && typeof current[key] === 'object' && !Array.isArray(current[key])
    ) {
      merged[key] = { ...current[key], ...incoming[key] };
    }
  }
  return merged;
}

/**
 * 生成类节点的「最低可执行条件」检查 + input 组装。
 * 复刻各节点 handleRun 的合并/默认逻辑（提示词合并、count/concurrency 兜底）。
 * 返回 null 表示不满足执行条件（如缺提示词/缺输入图），调用方据此返回 ok:false。
 *
 * @param {object} node 节点对象（含 data.params / data.uploadedImages / data.images）
 * @returns {{kind:'image'|'audio'|'video', workflowId:string, input:object} | null}
 */
export function buildNodeExecution(node, textInputValues) {
  if (!node || !node.data) return null;
  const type = node.type;
  const params = { ...(node.data.params || {}), ...(textInputValues || {}) };
  const pickedPrompt = (params.pickedPrompt || '').toString().trim();
  const userPrompt = (params.prompt || '').toString().trim();
  const mergedPrompt = [pickedPrompt, userPrompt].filter(Boolean).join('\n');
  const count = Math.max(1, Number(params.count) || 1);
  const concurrency = Math.max(1, Math.min(count, Number(params.concurrency) || 1));

  if (type === NODE_TYPES.textToImage) {
    if (!mergedPrompt) return null;
    return {
      kind: 'image',
      workflowId: WORKFLOWS.text_to_image,
      input: {
        prompt: mergedPrompt,
        model: params.model || DEFAULT_MODEL,
        aspect: params.aspect || '1:1',
        size: params.size || '1k',
        count, concurrency,
      },
    };
  }
  if (type === NODE_TYPES.editImage) {
    const editPrompt = [pickedPrompt, promptToText(userPrompt)].filter(Boolean).join('\n');
    if (!editPrompt) return null;
    // 输入图：uploadedImages + 上游连线 images（合并去重，与 EditImageNode 一致）
    const uploaded = Array.isArray(node.data.uploadedImages) ? node.data.uploadedImages : [];
    const upstream = Array.isArray(node.data.images) ? node.data.images : [];
    const refImages = Array.isArray(params.referenceImages) ? params.referenceImages : [];
    const seen = new Set();
    const allInput = [];
    for (const url of [...refImages, ...uploaded, ...upstream]) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      allInput.push(url);
    }
    if (!allInput.length) return null; // editImage 必须有输入图
    return {
      kind: 'image',
      workflowId: WORKFLOWS.edit_image,
      input: {
        images: allInput.map((u) => (typeof u === 'string' && u.startsWith('http') ? u : `${window.location.origin}${u.startsWith('/') ? '' : '/'}${u}`)),
        prompt: editPrompt,
        model: params.model || DEFAULT_MODEL,
        aspect: params.aspect || '1:1',
        size: params.size || '1k',
        count, concurrency,
      },
    };
  }
  if (type === NODE_TYPES.textToVoice) {
    if (!mergedPrompt) return null;
    return {
      kind: 'audio',
      workflowId: WORKFLOWS.text_to_voice,
      input: {
        prompt: mergedPrompt,
        model: params.model || VOICE_PROVIDER_OPTIONS[0]?.value || 'fish-audio',
        ...(params.voiceId ? { voiceId: params.voiceId } : {}),
        count, concurrency,
      },
    };
  }
  if (type === NODE_TYPES.videoGenerator) {
    if (!mergedPrompt) return null;
    const uploaded = Array.isArray(node.data.uploadedImages) ? node.data.uploadedImages : [];
    const upstream = Array.isArray(node.data.images) ? node.data.images : [];
    const seen = new Set();
    const images = [];
    for (const url of [...uploaded, ...upstream]) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      images.push(url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`);
    }
    return {
      kind: 'video',
      workflowId: WORKFLOWS.video_generator,
      input: {
        prompt: mergedPrompt,
        model: params.model || DEFAULT_VIDEO_MODEL,
        aspect: params.aspect || VIDEO_ASPECT_OPTIONS[0],
        quality: params.quality || VIDEO_QUALITY_OPTIONS[0],
        duration: params.duration || VIDEO_DURATION_OPTIONS[0],
        images,
        count, concurrency,
      },
    };
  }
  return null; // 非生成类节点
}

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
 * @param {Array} deps.groups
 * @param {Function} deps.createNodeAt
 * @param {Function} deps.updateNodeData
 * @param {Function} deps.handleDeleteNode
 * @param {Function} deps.focusNode
 * @param {Function} deps.focusNodes                   聚焦一组节点的新位置
 * @param {Function} deps.setNodes
 * @param {Function} deps.setEdges
 * @param {Function} deps.setGroups                    分组数据 setState（用于 groupName 归组）
 * @param {Function} deps.onGenerate                   文生图/编辑图片执行回调（handleGenerate）
 * @param {Function} deps.onGenerateMedia              配音/视频执行回调（handleGenerateMedia）
 */
export default function useCanvasAgentRpc({ nodes, edges, groups = [], createNodeAt, updateNodeData, handleDeleteNode, focusNode, focusNodes, setNodes, setEdges, setGroups, onGenerate, onGenerateMedia, settings }) {
  // ref 持有最新值，effect 只订阅一次
  const ctxRef = useRef({ nodes, edges, groups, createNodeAt, updateNodeData, handleDeleteNode, focusNode, focusNodes, setNodes, setEdges, setGroups, onGenerate, onGenerateMedia });
  ctxRef.current = { nodes, edges, groups, createNodeAt, updateNodeData, handleDeleteNode, focusNode, focusNodes, setNodes, setEdges, setGroups, onGenerate, onGenerateMedia, settings };

  useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS?.onTaskEvent) return;
    const respond = (requestId, result, ok = true, error) => {
      try { AS.respondClientRequest?.(requestId, result, ok, error); }
      catch (e) { console.error('respondClientRequest failed:', e); }
    };

    const unsubscribe = AS.onTaskEvent(async (event, data) => {
      if (event !== 'miniApp.clientRequest') return;
      const requestId = data?.requestId;
      const type = data?.type;
      const payload = data?.payload || {};
      if (!requestId || !type) return;

      // 每次回调读最新闭包（ref）
      const { nodes: curNodes, edges: curEdges, groups: curGroups, createNodeAt: createFn, updateNodeData: updateFn, handleDeleteNode: deleteFn, focusNode: focusFn, focusNodes: focusNodesFn, setNodes: setNodesFn, setEdges: setEdgesFn, setGroups: setGroupsFn, onGenerate, onGenerateMedia } = ctxRef.current;

      try {
        let result;
        switch (type) {
          case 'canvas.addNode': {
            const size = DEFAULT_SIZE[payload.type] || DEFAULT_SIZE.default;
            const position = payload.position || findFreePositions(
              { x: 120, y: 120 },
              size.w,
              size.h,
              1,
              curNodes,
              { gap: 40, direction: 'right', cols: 3 },
            )[0];
            const id = createFn(payload.type, position, payload.data);
            ctxRef.current.nodes = [...curNodes, {
              id,
              type: payload.type,
              position,
              width: size.w,
              height: size.h,
              style: { width: size.w, height: size.h },
              data: payload.data || {},
            }];
            if (payload.focus !== false) {
              setTimeout(() => focusFn(id), 0);
            }
            // 可选：归入同名分组
            if (payload.groupName && typeof payload.groupName === 'string') {
              const nextGroups = addNodeIdsToGroup(curGroups, payload.groupName, [id]);
              ctxRef.current.groups = nextGroups;
              setGroupsFn(nextGroups);
              const arrangedNodeIds = arrangeGroupAfterAdd(setNodesFn, curEdges, nextGroups, payload.groupName, [id], payload.groupLayout);
              if (arrangedNodeIds.length) focusNodesFn?.(arrangedNodeIds);
            }
            result = { ok: true, nodeId: id, position };
            break;
          }
          case 'canvas.addNodes': {
            const specs = Array.isArray(payload.nodes) ? payload.nodes : [];
            if (!specs.length) throw new Error('nodes 不能为空');
            const ids = specs.map(() => genId('node'));
            // 同步构造快照，让并发到达的下一次 RPC 能立即看到本批节点。
            const additions = specs.map((spec, i) => {
              const type = spec.type;
              const meta = NODE_META[type] || {};
              const size = DEFAULT_SIZE[type] || DEFAULT_SIZE.default;
              return {
                id: ids[i],
                type,
                position: spec.position || null,
                width: size.w,
                height: size.h,
                style: { width: size.w, height: size.h },
                data: { ...initialData(type), label: meta.label, ...(spec.data || {}) },
              };
            });
            const obstacles = [...curNodes, ...additions.filter((node) => node.position)];
            for (const node of additions) {
              if (node.position) continue;
              node.position = findFreePositions(
                { x: 120, y: 120 },
                node.width,
                node.height,
                1,
                obstacles,
                { gap: 40, direction: 'right', cols: 3 },
              )[0];
              obstacles.push(node);
            }
            const futureNodes = [...curNodes, ...additions];
            ctxRef.current.nodes = futureNodes;
            setNodesFn((prev) => [...prev, ...additions]);
            if (payload.focusFirst !== false && ids.length) {
              setTimeout(() => focusFn(ids[0]), 0);
            }
            // 可选：本批节点一起归入同名分组
            if (payload.groupName && typeof payload.groupName === 'string') {
              const nextGroups = addNodeIdsToGroup(curGroups, payload.groupName, ids);
              ctxRef.current.groups = nextGroups;
              setGroupsFn(nextGroups);
              const arrangedNodeIds = arrangeGroupAfterAdd(setNodesFn, curEdges, nextGroups, payload.groupName, ids, payload.groupLayout);
              if (arrangedNodeIds.length) focusNodesFn?.(arrangedNodeIds);
            }
            const edgeSpecs = (Array.isArray(payload.edges) ? payload.edges : []).map((edge) => ({
              sourceId: edge.sourceIndex !== undefined ? ids[edge.sourceIndex] : edge.sourceId,
              targetId: edge.targetIndex !== undefined ? ids[edge.targetIndex] : edge.targetId,
              inputTarget: edge.inputTarget,
            }));
            const preparedEdges = prepareBatchEdges(futureNodes, curEdges, edgeSpecs);
            if (preparedEdges.toAdd.length) setEdgesFn((prev) => [...prev, ...preparedEdges.toAdd]);
            if (payload.autoLayout && typeof payload.autoLayout === 'object') {
              const layout = payload.autoLayout;
              const options = {
                nodeIds: ids,
                direction: layout.direction === 'TB' ? 'TB' : 'LR',
              };
              if (layout.grid) {
                options.grid = {
                  rows: Math.max(1, Math.min(ids.length, Number(layout.grid.rows) || 1)),
                  columns: Math.max(1, Math.min(ids.length, Number(layout.grid.columns) || 1)),
                  horizontalGap: Math.max(0, Number(layout.grid.horizontalGap) || 0),
                  verticalGap: Math.max(0, Number(layout.grid.verticalGap) || 0),
                };
              }
              const arranged = autoLayoutSubset(futureNodes, [...curEdges, ...preparedEdges.toAdd], options);
              const positionById = new Map(arranged.map((node) => [node.id, node.position]));
              setNodesFn((prev) => prev.map((node) => positionById.has(node.id)
                ? { ...node, position: positionById.get(node.id) }
                : node));
            }
            result = {
              ok: true,
              nodeIds: ids,
              edges: { created: preparedEdges.toAdd.length, skipped: preparedEdges.skipped, invalid: preparedEdges.invalid },
            };
            break;
          }
          case 'canvas.updateNodeData': {
            if (!payload.nodeId) throw new Error('nodeId 必填');
            const incoming = payload.data || {};
            // agent 调 update_node 通常只传「要改的字段」（如 {params:{model}}），
            // 期望的是深合并：保留原 params.prompt/aspect/size，只改 model。
            // 但 useCanvasState.updateNodeData 对 data 做浅合并，data.params 整个替换会丢其他字段。
            // 这里读当前节点 data，对「对象型字段」做一层合并，其余字段保持浅合并语义。
            updateFn(payload.nodeId, (current) => mergeNodeData(current || {}, incoming));
            result = { ok: true };
            break;
          }
          case 'canvas.updateNodes': {
            const updates = Array.isArray(payload.nodes) ? payload.nodes : [];
            const missingIds = updates.map((item) => item.nodeId)
              .filter((nodeId) => !curNodes.some((node) => node.id === nodeId));
            if (missingIds.length) {
              result = { ok: false, message: `节点不存在：${missingIds.join(', ')}` };
              break;
            }
            // 每个节点通过统一 updateNodeData 入口独立提交，避免批量快照覆盖并发中的其他输出。
            updates.forEach((update) => {
              updateFn(update.nodeId, (current) => mergeNodeData(current || {}, update.data || {}));
            });
            const preparedEdges = prepareBatchEdges(curNodes, curEdges, Array.isArray(payload.edges) ? payload.edges : []);
            if (preparedEdges.toAdd.length) setEdgesFn((prev) => [...prev, ...preparedEdges.toAdd]);
            result = {
              ok: true,
              updated: updates.length,
              edges: { created: preparedEdges.toAdd.length, skipped: preparedEdges.skipped, invalid: preparedEdges.invalid },
            };
            break;
          }
          case 'canvas.deleteNode': {
            if (!payload.nodeId) throw new Error('nodeId 必填');
            if (!curNodes.some((n) => n.id === payload.nodeId)) {
              result = { ok: false, message: `节点不存在：${payload.nodeId}` };
            } else {
              deleteFn(payload.nodeId);
              const nextGroups = removeNodeIdFromGroups(curGroups, payload.nodeId);
              ctxRef.current.groups = nextGroups;
              setGroupsFn(nextGroups);
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
            const sourceNode = curNodes.find((n) => n.id === sourceId);
            if (!sourceNode) {
              result = { ok: false, message: `源节点不存在：${sourceId}` };
              break;
            }
            const targetNode = curNodes.find((n) => n.id === targetId);
            if (!targetNode) {
              result = { ok: false, message: `目标节点不存在：${targetId}` };
              break;
            }
            const resolved = resolveRpcConnection(sourceNode, targetNode, payload.inputTarget);
            if (!resolved.ok) {
              result = resolved;
              break;
            }
            setEdgesFn((prev) => addEdge(
              {
                source: sourceId,
                target: targetId,
                markerEnd: { type: MarkerType.ArrowClosed },
                animated: true,
                data: resolved.data,
              },
              prev,
            ));
            result = { ok: true, edgeId: `${sourceId}->${targetId}` };
            break;
          }
          case 'canvas.connectBatch': {
            const specs = Array.isArray(payload.edges) ? payload.edges : [];
            if (!specs.length) throw new Error('edges 不能为空');
            const prepared = prepareBatchEdges(curNodes, curEdges, specs);
            if (prepared.toAdd.length) setEdgesFn((prev) => [...prev, ...prepared.toAdd]);
            result = {
              ok: true, created: prepared.toAdd.length, skipped: prepared.skipped, invalid: prepared.invalid,
              summary: `批量连线：新增 ${prepared.toAdd.length}，已存在 ${prepared.skipped}，无效 ${prepared.invalid}`,
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
                title: n.data?.title || n.data?.label || (NODE_META[n.type] && NODE_META[n.type].label) || n.type,
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
              nodes: curNodes.map((n) => ({
                id: n.id,
                type: n.type,
                title: n.data?.title || n.data?.label || (NODE_META[n.type] && NODE_META[n.type].label) || n.type,
                label: n.data?.label || '',
                position: n.position,
              })),
              edges: curEdges.map((e) => ({
                source: e.source,
                target: e.target,
                inputType: e.data?.inputType,
                inputTarget: e.data?.inputTarget,
              })),
              groups: curGroups.map((group) => ({
                id: group.id,
                name: group.name,
                nodeIds: group.childNodeIds,
              })),
            };
            break;
          }
          case 'canvas.getCanvasSnapshot': {
            result = {
              ok: true,
              nodes: curNodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...(node.data || {}) } })),
              edges: curEdges.map((edge) => ({ ...edge, data: edge.data ? { ...edge.data } : edge.data })),
              groups: curGroups.map((group) => ({ ...group })),
            };
            break;
          }
          case 'canvas.restoreCanvas': {
            const restoredNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
            const restoredEdges = Array.isArray(payload.edges) ? payload.edges : [];
            const restoredGroups = Array.isArray(payload.groups) ? payload.groups : [];
            ctxRef.current.nodes = restoredNodes;
            ctxRef.current.edges = restoredEdges;
            ctxRef.current.groups = restoredGroups;
            setNodesFn(restoredNodes);
            setEdgesFn(restoredEdges);
            setGroupsFn(restoredGroups);
            focusNodesFn?.(restoredNodes.map((node) => node.id).filter(Boolean));
            result = { ok: true, nodeCount: restoredNodes.length, edgeCount: restoredEdges.length, groupCount: restoredGroups.length };
            break;
          }
          case 'canvas.arrangeGroup': {
            const groupId = typeof payload.groupId === 'string' ? payload.groupId.trim() : '';
            const groupName = typeof payload.groupName === 'string' ? payload.groupName.trim() : '';
            const group = (groupId && curGroups.find((item) => item.id === groupId))
              || (groupName && curGroups.find((item) => item.name === groupName));
            if (!group) {
              result = { ok: false, message: `分组不存在：${groupId || groupName || '(空)'}` };
              break;
            }
            const existingIds = new Set(curNodes.map((node) => node.id));
            const nodeIds = group.childNodeIds.filter((id) => existingIds.has(id));
            const options = { nodeIds, direction: payload.direction === 'TB' ? 'TB' : 'LR' };
            if (payload.grid) {
              options.grid = {
                rows: Math.max(1, Math.min(nodeIds.length || 1, Number(payload.grid.rows) || 1)),
                columns: Math.max(1, Math.min(nodeIds.length || 1, Number(payload.grid.columns) || 1)),
                horizontalGap: Math.max(0, Number(payload.grid.horizontalGap) || 0),
                verticalGap: Math.max(0, Number(payload.grid.verticalGap) || 0),
              };
            }
            const arranged = autoLayoutSubset(curNodes, curEdges, options);
            const positions = new Map(arranged
              .filter((node) => nodeIds.includes(node.id))
              .map((node) => [node.id, node.position]));
            setNodesFn((prev) => prev.map((node) => positions.has(node.id)
              ? { ...node, position: positions.get(node.id) }
              : node));
            focusNodesFn?.(nodeIds);
            result = {
              ok: true,
              groupId: group.id,
              groupName: group.name,
              arrangedCount: nodeIds.length,
              positions: nodeIds.map((nodeId) => ({ nodeId, position: positions.get(nodeId) })),
              message: nodeIds.length < 2
                ? `分组「${group.name}」仅有 ${nodeIds.length} 个节点，无需调整`
                : `已编排分组「${group.name}」中的 ${nodeIds.length} 个节点`,
            };
            break;
          }
          case 'canvas.executeNode': {
            const { nodeId } = payload;
            if (!nodeId) throw new Error('nodeId 必填');
            const node = curNodes.find((n) => n.id === nodeId);
            if (!node) {
              result = { ok: false, message: `节点不存在：${nodeId}` };
              break;
            }
            // 仅生成类节点可执行（textToImage/editImage/textToVoice/videoGenerator）
            const GENERATABLE = new Set([
              NODE_TYPES.textToImage, NODE_TYPES.editImage,
              NODE_TYPES.textToVoice, NODE_TYPES.videoGenerator,
            ]);
            if (!GENERATABLE.has(node.type)) {
              const label = (NODE_META[node.type] && NODE_META[node.type].label) || node.type;
              result = {
                ok: false,
                message: `节点 ${nodeId}（${label}）不支持执行：仅生成类节点（文字生成图片/编辑图片/生成配音/生成视频）可执行`,
              };
              break;
            }
            // 组装 input + 校验最低执行条件（缺提示词/缺输入图返回 ok:false）
            const textInputValues = computeInputTexts(curNodes, curEdges).get(nodeId);
            const spec = buildNodeExecution(node, textInputValues);
            if (!spec) {
              const label = (NODE_META[node.type] && NODE_META[node.type].label) || node.type;
              const reason = node.type === NODE_TYPES.editImage
                ? '节点缺少输入图或提示词（编辑图片需要至少一张输入图 + 编辑指令）'
                : '节点缺少提示词（请先用 update_node 写入 data.params.prompt）';
              result = { ok: false, message: `节点 ${nodeId}（${label}）${reason}` };
              break;
            }
            // 分流到对应执行回调（与节点 handleRun 完全等价的入口）
            const execFn = spec.kind === 'image' ? onGenerate : onGenerateMedia;
            if (typeof execFn !== 'function') {
              result = { ok: false, message: '执行回调未注入（画布初始化中）' };
              break;
            }
            if (spec.kind === 'image') {
              execFn(nodeId, node.type, { workflowId: spec.workflowId, input: spec.input });
            } else {
              // onGenerateMedia(nodeId, nodeType, kind, {workflowId, input})
              execFn(nodeId, node.type, spec.kind, { workflowId: spec.workflowId, input: spec.input });
            }
            const label = (NODE_META[node.type] && NODE_META[node.type].label) || node.type;
            result = {
              ok: true,
              nodeId,
              nodeType: node.type,
              message: `已触发「${label}」节点 ${nodeId} 执行，生成中…产出会异步写入节点产出区与生成记录`,
            };
            break;
          }
          case 'canvas.getNodeParams': {
            // 返回某类节点支持的参数 schema（含 required/default/options/description）。
            // schema 定义在各节点组件的 PARAMS_SCHEMA，经 canvas-constants 聚合为 NODE_PARAMS_SCHEMA。
            // 单一数据源：节点即文档，options 直接引用 constants 的 OPTIONS。
            // model 字段的 options 用 settings 动态覆盖（用户可在设置页自定义模型列表）。
            const { type } = payload;
            if (!type) throw new Error('type 必填');
            const baseSchema = NODE_PARAMS_SCHEMA[type];
            if (!baseSchema) {
              const label = (NODE_META[type] && NODE_META[type].label) || type;
              result = {
                ok: true,
                type,
                params: [],
                message: `「${label}」没有 agent 可调的枚举参数（这类节点的输入由画布交互设置，如上传图/拉框等）`,
              };
              break;
            }
            const curSettings = ctxRef.current.settings || {};
            const params = baseSchema.map((p) => {
              if (p.key !== 'model') return p;
              const values = type === NODE_TYPES.editImage ? curSettings.editImageModels : curSettings.textToImageModels;
              const dynOpts = modelValuesToOptions(values);
              return { ...p, options: dynOpts };
            });
            result = { ok: true, type, params };
            break;
          }
          case 'canvas.waitNodeResult': {
            // 等待节点执行完成：轮询 ctxRef.current.nodes 读最新 status。
            // 用于 execute_node(waitForResult:true) 的等待阶段。
            // status: idle/running/done/error/cancelled；done→resolve 成功+产出，error/cancelled→resolve 失败，超时→resolve timeout。
            const { nodeId, timeoutMs: waitTimeout } = payload;
            if (!nodeId) throw new Error('nodeId 必填');
            const totalMs = Math.max(1000, Number(waitTimeout) || 180000);
            const deadline = Date.now() + totalMs;
            result = await new Promise((resolve) => {
              const poll = () => {
                const cur = ctxRef.current.nodes;
                const node = cur.find((n) => n.id === nodeId);
                if (!node) {
                  resolve({ ok: false, status: 'not_found', error: `节点不存在：${nodeId}` });
                  return;
                }
                const status = node.data?.status || 'idle';
                if (status === 'done') {
                  const outs = node.data?.output || {};
                  const outputs = [
                    ...(outs.images || []),
                    ...(outs.audios || []),
                    ...(outs.videos || []),
                    ...(outs.audio ? [outs.audio] : []),
                    ...(outs.video ? [outs.video] : []),
                  ].filter(Boolean);
                  resolve({ ok: true, status: 'done', outputs });
                  return;
                }
                if (status === 'error' || status === 'cancelled') {
                  resolve({ ok: false, status, error: node.data?.error || (status === 'cancelled' ? '已取消' : '执行失败') });
                  return;
                }
                if (Date.now() >= deadline) {
                  resolve({ ok: false, status: 'timeout', error: `等待超时（${Math.round(totalMs / 1000)}s 仍在运行）` });
                  return;
                }
                setTimeout(poll, 400);
              };
              poll();
            });
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
