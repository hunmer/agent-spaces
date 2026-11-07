import type { Workflow, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { createWorkflowNodesForDefinition } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../../adapters/agent-runtime-types.js';
import * as workflowService from '../../workflow.js';
import {
  asRecord,
  clone,
  cloneWorkflow,
  createWorkflowNodeId,
  objectInputResult,
  schema,
  stringInput,
  stringInputAny,
} from './helpers.js';
import { countPositionChanges, layoutNodes } from './layout.js';
import { defaultData, validateNodeDataPatch } from './node-types.js';
import { mergeOutputFields, outputFieldsInput } from './output-fields.js';
import {
  findReusableInsertNode,
  getInsertScopeNode,
  nextNodePosition,
  replaceConflictingScopedEdges,
  resolveScopeNode,
} from './scope.js';
import type { OutputField } from '@agent-spaces/shared';
import type { ToolDeps } from './types.js';

const createNodeTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'create_node',
  description: '在工作流中创建新节点。需要指定有效节点 type，可选 label、data。调用前先用 search_node_usage 确认节点字段；data 只能包含该节点真实参数，输入字段必须写为 inputFields 数组，禁止写 inputs 或包成 { item: [...] }。要创建到 loop_body 等作用域内，传 scopeNodeId/scope_node_id，或传 source/sourceHandle 让工具从 loop-body 句柄推断。',
  inputSchema: schema({
    type: { type: 'string', description: '节点类型标识。' },
    label: { type: 'string', description: '节点显示名称。' },
    data: { type: ['object', 'string'], description: '节点参数数据。可传对象或 JSON 字符串；agent_run.data.agent 也可传 JSON 字符串。', properties: {} },
    scopeNodeId: { type: 'string', description: '可选，作用域容器节点 ID，例如 loop_body 节点 ID。' },
    scope_node_id: { type: 'string', description: '可选，作用域容器节点 ID，兼容蛇形命名。' },
    parentId: { type: 'string', description: '兼容参数，等同 scopeNodeId。' },
    parent_id: { type: 'string', description: '兼容参数，等同 scope_node_id。' },
    source: { type: 'string', description: '可选，前置节点 ID；当 sourceHandle=loop-body 时自动创建到对应 loop_body。' },
    sourceHandle: { type: 'string', description: '可选，前置节点连接点。' },
    source_handle: { type: 'string', description: '可选，前置节点连接点，兼容蛇形命名。' },
  }, ['type']),
  execute: async (input) => {
    const { draft, definitionByType, ctx, commit } = deps;
    const record = asRecord(input);
    const type = stringInput(record, 'type');
    if (!type) return { success: false, message: 'type is required' };
    const definition = definitionByType.get(type);
    if (!definition) return { success: false, message: `Unknown node type: ${type}` };
    const rootDataResult = objectInputResult(record, 'data');
    if (!rootDataResult.success) return rootDataResult;
    const rootData = rootDataResult.value;
    const validation = validateNodeDataPatch(definition, rootData);
    if (!validation.success) return validation;
    const scopeNodeResult = resolveScopeNode(draft.current.nodes, record);
    if (!scopeNodeResult.success) return scopeNodeResult;
    const created = createWorkflowNodesForDefinition({
      definitions: ctx.nodeDefinitions,
      type,
      rootLabel: stringInput(record, 'label'),
      position: nextNodePosition(draft.current.nodes, scopeNodeResult.scopeNode),
      rootData,
      scopeNode: scopeNodeResult.scopeNode,
      createNodeId: createWorkflowNodeId,
    });
    if (!created) return { success: false, message: `Failed to create node type: ${type}` };
    return commit({
      ...draft.current,
      nodes: [...draft.current.nodes, ...created.nodes],
      edges: [...draft.current.edges, ...created.edges],
    }, {
      created_node_id: created.rootNode.id,
      created_node_ids: created.nodes.map((node) => node.id),
      created_edge_ids: created.edges.map((edge) => edge.id),
    });
  },
});

const updateNodeTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'update_node',
  description: '更新指定节点的 label 或 data。调用前先用 search_node_usage 确认节点字段；data 会与现有 data 浅合并，必须传实际要写入的节点参数，禁止用 data:{} 或空 args 试探更新；只改显示名时才只传 label。data 应传对象，兼容 JSON 字符串。',
  inputSchema: schema({
    nodeId: { type: 'string', description: '要更新的节点 ID。' },
    node_id: { type: 'string', description: '要更新的节点 ID，兼容蛇形命名。' },
    id: { type: 'string', description: '要更新的节点 ID，兼容旧参数。' },
    label: { type: 'string', description: '可选，节点显示名称。' },
    data: { type: ['object', 'string'], description: '可选；要合并的非空节点参数对象，禁止传空对象 {}；兼容 JSON 字符串。只改显示名时传 label，不要传 data。', properties: {}, minProperties: 1 },
  }, ['nodeId']),
  execute: async (input) => {
    const { draft, definitionByType, commit } = deps;
    const record = asRecord(input);
    const nodeId = stringInputAny(record, ['nodeId', 'node_id', 'id']);
    if (!nodeId) return { success: false, message: 'nodeId is required' };
    const dataResult = objectInputResult(record, 'data');
    if (!dataResult.success) return dataResult;
    const label = stringInput(record, 'label');
    const hasDataInput = Object.prototype.hasOwnProperty.call(record, 'data');
    if (!label && (!hasDataInput || Object.keys(dataResult.value).length === 0)) {
      return {
        success: false,
        message: 'update_node requires a non-empty data object or label. Put actual node changes inside data, for example { "data": { "code": "...", "outputs": [...] } }.',
      };
    }
    const targetNode = draft.current.nodes.find((node) => node.id === nodeId);
    if (!targetNode) return { success: false, message: `Node not found: ${nodeId}` };
    const definition = definitionByType.get(targetNode.type);
    if (definition) {
      const validation = validateNodeDataPatch(definition, dataResult.value);
      if (!validation.success) return validation;
    }
    let found = false;
    const nodes = draft.current.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      found = true;
      return {
        ...node,
        label: label ?? node.label,
        data: { ...node.data, ...dataResult.value },
      };
    });
    return found ? commit({ ...draft.current, nodes }) : { success: false, message: `Node not found: ${nodeId}` };
  },
});

const setNodeIoFieldsTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'set_node_io_fields',
  description: '新增、合并或替换节点的输入/输出字段数组。输入字段写入 data.inputFields；输出字段写入 data.outputs。开始节点运行输入变量引用使用 {{ __data__["节点ID"].字段 }}，普通节点输出变量引用也使用 {{ __data__["节点ID"].字段 }}。结束节点返回结果来自 outputs，每个输出项可设置 value；动态代码节点返回结构变化后要同步更新 outputs。',
  inputSchema: schema({
    nodeId: { type: 'string', description: '要更新的节点 ID。' },
    node_id: { type: 'string', description: '要更新的节点 ID，兼容蛇形命名。' },
    fieldKind: { type: 'string', enum: ['inputFields', 'outputs'], description: '要更新的字段类型：inputFields 或 outputs。' },
    field_kind: { type: 'string', enum: ['inputFields', 'outputs'], description: '要更新的字段类型，兼容蛇形命名。' },
    mode: { type: 'string', enum: ['append', 'merge', 'replace'], description: 'append 追加新字段；merge 按 key 合并/覆盖；replace 替换整个数组。默认 merge。' },
    fields: {
      type: ['array', 'string'],
      description: '字段数组，每项至少包含 key 和 type；兼容 JSON 字符串数组。object 类型可带 children；结束节点 outputs 可带 value。',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '字段 key。' },
          type: { type: 'string', description: '字段类型，例如 string/number/boolean/object/file/any/string[]/number[]/file[]/any[]。' },
          value: { description: '输出字段值，结束节点常用，可为变量引用。' },
          description: { type: 'string', description: '字段说明。' },
          required: { type: 'boolean', description: '是否必填，常用于输入字段。' },
          children: { type: 'array', description: 'object 字段的子字段。' },
        },
        required: ['key', 'type'],
      },
    },
  }, ['fields']),
  execute: async (input) => {
    const { draft, commit } = deps;
    const record = asRecord(input);
    const nodeId = stringInputAny(record, ['nodeId', 'node_id']);
    if (!nodeId) return { success: false, message: 'nodeId is required' };
    const fieldKind = stringInputAny(record, ['fieldKind', 'field_kind']);
    if (fieldKind !== 'inputFields' && fieldKind !== 'outputs') {
      return { success: false, message: 'fieldKind must be inputFields or outputs' };
    }
    const rawMode = stringInput(record, 'mode') ?? 'merge';
    const mode = rawMode === 'append' || rawMode === 'replace' || rawMode === 'merge' ? rawMode : 'merge';
    const fieldsResult = outputFieldsInput(record.fields);
    if (!fieldsResult.success) return fieldsResult;

    let found = false;
    const nodes = draft.current.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      found = true;
      const existing = Array.isArray(node.data?.[fieldKind]) ? node.data[fieldKind] as OutputField[] : [];
      return {
        ...node,
        data: {
          ...node.data,
          [fieldKind]: mergeOutputFields(existing, fieldsResult.fields, mode),
        },
      };
    });
    return found ? commit({ ...draft.current, nodes }) : { success: false, message: `Node not found: ${nodeId}` };
  },
});

const deleteNodeTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'delete_node',
  description: '删除指定节点及其相关连线。',
  inputSchema: schema({
    nodeId: { type: 'string', description: '要删除的节点 ID。' },
    node_id: { type: 'string', description: '要删除的节点 ID，兼容蛇形命名。' },
  }),
  annotations: { destructive: true },
  execute: async (input) => {
    const { draft, commit } = deps;
    const nodeId = stringInputAny(asRecord(input), ['nodeId', 'node_id']);
    if (!nodeId) return { success: false, message: 'nodeId is required' };
    if (!draft.current.nodes.some((node) => node.id === nodeId)) return { success: false, message: `Node not found: ${nodeId}` };
    return commit({
      ...draft.current,
      nodes: draft.current.nodes.filter((node) => node.id !== nodeId),
      edges: draft.current.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    });
  },
});

const createEdgeTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'create_edge',
  description: '创建连线。source/target 是节点 ID；多输出节点应传 sourceHandle。',
  inputSchema: schema({
    source: { type: 'string', description: '起始节点 ID。' },
    target: { type: 'string', description: '目标节点 ID。' },
    sourceHandle: { type: 'string', description: '起始连接点。' },
    source_handle: { type: 'string', description: '起始连接点，兼容蛇形命名。' },
    targetHandle: { type: 'string', description: '目标连接点。' },
    target_handle: { type: 'string', description: '目标连接点，兼容蛇形命名。' },
  }, ['source', 'target']),
  execute: async (input) => {
    const { draft, commit } = deps;
    const record = asRecord(input);
    const source = stringInput(record, 'source');
    const target = stringInput(record, 'target');
    if (!source || !target) return { success: false, message: 'source and target are required' };
    if (!draft.current.nodes.some((node) => node.id === source)) return { success: false, message: `Source node not found: ${source}` };
    if (!draft.current.nodes.some((node) => node.id === target)) return { success: false, message: `Target node not found: ${target}` };
    const edge: WorkflowEdge = {
      id: `e-${source}-${target}-${Date.now().toString(36)}`,
      source,
      target,
      sourceHandle: stringInputAny(record, ['sourceHandle', 'source_handle']) ?? undefined,
      targetHandle: stringInputAny(record, ['targetHandle', 'target_handle']) ?? undefined,
    };
    const replacement = replaceConflictingScopedEdges(draft.current.nodes, draft.current.edges, edge);
    return commit({ ...draft.current, edges: [...replacement.edges, edge] }, {
      removed_edge_ids: replacement.removedEdgeIds,
    });
  },
});

const deleteEdgeTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'delete_edge',
  description: '删除指定连线。',
  inputSchema: schema({
    edgeId: { type: 'string', description: '要删除的连线 ID。' },
    edge_id: { type: 'string', description: '要删除的连线 ID，兼容蛇形命名。' },
  }),
  annotations: { destructive: true },
  execute: async (input) => {
    const { draft, commit } = deps;
    const edgeId = stringInputAny(asRecord(input), ['edgeId', 'edge_id']);
    if (!edgeId) return { success: false, message: 'edgeId is required' };
    if (!draft.current.edges.some((edge) => edge.id === edgeId)) return { success: false, message: `Edge not found: ${edgeId}` };
    return commit({ ...draft.current, edges: draft.current.edges.filter((edge) => edge.id !== edgeId) });
  },
});

const insertNodeTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'insert_node',
  description: '在已有连线中插入节点，替换为 source -> 节点 -> target 两条边。调用前先用 search_node_usage 确认节点字段；data 只能包含该节点真实参数。可传 nodeId/node_id 复用现有节点；不传时会优先复用同作用域内未连线且类型/标签/data 匹配的节点，避免先 create_node 后再 delete_node。',
  inputSchema: schema({
    edgeId: { type: 'string', description: '要插入的边 ID。' },
    edge_id: { type: 'string', description: '要插入的边 ID，兼容蛇形命名。' },
    nodeId: { type: 'string', description: '可选，要复用并插入的现有节点 ID。' },
    node_id: { type: 'string', description: '可选，要复用并插入的现有节点 ID，兼容蛇形命名。' },
    type: { type: 'string', description: '新节点类型。' },
    label: { type: 'string', description: '新节点显示名称。' },
    data: { type: ['object', 'string'], description: '新节点参数。可传对象或 JSON 字符串。', properties: {} },
  }),
  execute: async (input) => {
    const { draft, definitionByType, commit } = deps;
    const record = asRecord(input);
    const edgeId = stringInputAny(record, ['edgeId', 'edge_id']);
    const type = stringInput(record, 'type');
    const reuseNodeId = stringInputAny(record, ['nodeId', 'node_id']);
    const edge = draft.current.edges.find((item) => item.id === edgeId);
    if (!edge) return { success: false, message: `Edge not found: ${edgeId ?? ''}` };
    const sourceNode = draft.current.nodes.find((node) => node.id === edge.source);
    const targetNode = draft.current.nodes.find((node) => node.id === edge.target);
    const scopeNode = getInsertScopeNode(draft.current.nodes, edge.source, edge.sourceHandle);
    const insertPosition = {
      x: ((sourceNode?.position.x ?? 0) + (targetNode?.position.x ?? 260)) / 2,
      y: ((sourceNode?.position.y ?? 0) + (targetNode?.position.y ?? 0)) / 2,
    };
    const dataResult = objectInputResult(record, 'data');
    if (!dataResult.success) return dataResult;
    const data = dataResult.value;
    const reuseNode = reuseNodeId
      ? draft.current.nodes.find((node) => node.id === reuseNodeId)
      : findReusableInsertNode(draft.current.nodes, draft.current.edges, {
          type,
          label: stringInput(record, 'label'),
          data,
          scopeNode,
        });
    if (reuseNodeId && !reuseNode) return { success: false, message: `Node not found: ${reuseNodeId}` };
    const insertType = type ?? reuseNode?.type;
    if (!insertType) return { success: false, message: 'type is required' };
    const definition = definitionByType.get(insertType);
    if (!definition) return { success: false, message: `Unknown node type: ${insertType}` };
    if (reuseNode && reuseNode.type !== insertType) {
      return { success: false, message: `Node type mismatch: ${reuseNode.id} is ${reuseNode.type}, expected ${insertType}` };
    }

    const nodeId = reuseNode?.id ?? `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const node: WorkflowNode = {
      ...(reuseNode ?? {}),
      id: nodeId,
      type: insertType,
      label: stringInput(record, 'label') ?? reuseNode?.label ?? definition.label,
      position: insertPosition,
      data: { ...defaultData(definition), ...(reuseNode?.data ?? {}), ...data },
      composite: scopeNode ? {
        ...(reuseNode?.composite ?? {}),
        rootId: scopeNode.composite?.rootId || scopeNode.id,
        parentId: scopeNode.id,
        generated: false,
        hidden: false,
      } : reuseNode?.composite,
    };
    const nodes = reuseNode
      ? draft.current.nodes.map((item) => item.id === node.id ? node : item)
      : [...draft.current.nodes, node];
    return commit({
      ...draft.current,
      nodes,
      edges: [
        ...draft.current.edges.filter((item) => item.id !== edgeId),
        { id: `e-${edge.source}-${nodeId}`, source: edge.source, target: nodeId, sourceHandle: edge.sourceHandle },
        { id: `e-${nodeId}-${edge.target}`, source: nodeId, target: edge.target, targetHandle: edge.targetHandle },
      ],
    }, {
      inserted_node_id: nodeId,
      reused_node: !!reuseNode,
    });
  },
});

const autoLayoutTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'auto_layout',
  description: '自动整理当前工作流节点位置。direction 可选 LR 或 TB。',
  inputSchema: schema({ direction: { type: 'string', description: '布局方向，LR 或 TB，默认 LR。' } }),
  execute: async (input) => {
    const { draft, ctx, commit } = deps;
    const direction = stringInput(asRecord(input), 'direction') === 'TB' ? 'TB' : 'LR';
    const nodes = layoutNodes(draft.current.nodes, draft.current.edges, ctx.nodeDefinitions, direction);
    const affectedNodeCount = countPositionChanges(draft.current.nodes, nodes);
    return commit({ ...draft.current, nodes }, { affected_node_count: affectedNodeCount });
  },
});

const createWorkflowVersionTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'create_workflow_version',
  description: '为当前工作流草稿创建版本快照，适合复杂或破坏性编辑前备份。',
  inputSchema: schema({ name: { type: 'string', description: '版本名称。' } }),
  execute: async (input) => {
    const { draft, versions } = deps;
    const name = stringInput(asRecord(input), 'name') ?? 'AI 修改前备份';
    const version = workflowService.createVersion(draft.current.id, {
      name,
      nodes: draft.current.nodes,
      edges: draft.current.edges,
    });
    versions.set(version.id, { nodes: clone(version.snapshot.nodes), edges: clone(version.snapshot.edges) });
    return { success: true, version_id: version.id, name: version.name };
  },
});

const restoreWorkflowVersionTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'restore_workflow_version',
  description: '恢复本次会话内 create_workflow_version 创建的版本快照。',
  inputSchema: schema({ version_id: { type: 'string', description: '要恢复的版本 ID。' } }, ['version_id']),
  execute: async (input) => {
    const { draft, versions, commit } = deps;
    const versionId = stringInput(asRecord(input), 'version_id');
    const version = versionId ? versions.get(versionId) : undefined;
    if (!version) return { success: false, message: `Version not found: ${versionId ?? ''}` };
    return commit({ ...draft.current, nodes: clone(version.nodes), edges: clone(version.edges) });
  },
});

const saveWorkflowTool = (deps: ToolDeps): AgentFunctionTool => ({
  name: 'saveworkflow',
  description: '保存当前工作流草稿到后端，触发后端工作流校验，并返回后端文本。通常在 auto_layout 后调用；success=false 时根据 message 修正工作流。',
  inputSchema: schema({}),
  execute: async () => {
    const { draft, workflowPayload } = deps;
    try {
      const saved = workflowService.updateWorkflow(draft.current.id, draft.current);
      draft.current = cloneWorkflow(saved);
      const backendMessage = 'Workflow saved and backend validation passed.';
      return {
        success: true,
        message: backendMessage,
        ...workflowPayload(draft.current, false),
        backend_message: backendMessage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存工作流失败';
      return {
        success: false,
        message,
        backend_message: message,
      };
    }
  },
});

/** 变更草稿状态类工具（节点 / 边 / 版本 / 布局 / 保存）。 */
export function createEditTools(deps: ToolDeps): AgentFunctionTool[] {
  return [
    createNodeTool(deps),
    updateNodeTool(deps),
    setNodeIoFieldsTool(deps),
    deleteNodeTool(deps),
    createEdgeTool(deps),
    deleteEdgeTool(deps),
    insertNodeTool(deps),
    autoLayoutTool(deps),
    createWorkflowVersionTool(deps),
    restoreWorkflowVersionTool(deps),
    saveWorkflowTool(deps),
  ];
}
