import type { OutputField, Workflow, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { createWorkflowNodesForDefinition } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../../adapters/agent-runtime-types.js';
import * as workflowService from '../../workflow.js';
import {
  asRecord,
  booleanInput,
  clone,
  cloneWorkflow,
  createWorkflowNodeId,
  numberInput,
  objectInput,
  objectInputResult,
  schema,
  stringInput,
  stringInputAny,
  workflowSearchSchema,
} from './helpers.js';
import { mergeOutputFields, outputFieldsInput } from './output-fields.js';
import {
  NODE_PROPERTY_TYPE_DEFINITIONS,
  defaultData,
  getPropertyTypeDefinition,
  searchableDefinitionText,
  validateNodeDataPatch,
} from './node-types.js';
import {
  findReusableInsertNode,
  getInsertScopeNode,
  nextNodePosition,
  replaceConflictingScopedEdges,
  resolveScopeNode,
} from './scope.js';
import { countPositionChanges, layoutNodes } from './layout.js';
import { describeNodeUsage, summarizeNodeDefinition, summarizeWorkflow } from './summary.js';
import type { JsonRecord, WorkflowEditorFunctionTools, WorkflowEditorToolContext } from './types.js';

export type { WorkflowEditorFunctionTools, WorkflowEditorToolContext } from './types.js';

function workflowResult(success: boolean, message: string, results?: unknown[], meta?: JsonRecord) {
  return {
    success,
    message,
    ...meta,
    results,
  };
}

export function createWorkflowEditorFunctionTools(ctx: WorkflowEditorToolContext): WorkflowEditorFunctionTools {
  const versions = new Map<string, Pick<Workflow, 'nodes' | 'edges'>>();
  let draft = cloneWorkflow(ctx.workflow);

  const workflowPayload = (workflow: Workflow, summarize: boolean) => ({
    workflow: summarizeWorkflow(workflow, summarize),
    workflow_patch: {
      workflow_id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      updatedAt: workflow.updatedAt,
    },
  });

  const commit = (next: Workflow, meta?: JsonRecord) => {
    draft = {
      ...next,
      nodes: clone(next.nodes),
      edges: clone(next.edges),
      updatedAt: Date.now(),
    };
    return workflowResult(true, 'updated', undefined, {
      ...workflowPayload(draft, false),
      ...meta,
    });
  };

  const definitionByType = new Map(ctx.nodeDefinitions.map((definition) => [definition.type, definition]));
  const searchDefinitions = (input: JsonRecord) => {
    const type = stringInputAny(input, ['type', 'nodeType', 'node_type'])?.toLowerCase();
    const name = stringInput(input, 'name')?.toLowerCase();
    const keyword = stringInput(input, 'keyword')?.toLowerCase();
    const label = stringInput(input, 'label')?.toLowerCase();
    const category = stringInput(input, 'category')?.toLowerCase();
    const description = stringInput(input, 'description')?.toLowerCase();
    return ctx.nodeDefinitions.filter((definition) => {
      const checks = [
        name ? [definition.type, definition.label].join(' ').toLowerCase().includes(name) : true,
        keyword ? searchableDefinitionText(definition).includes(keyword) : true,
        type ? definition.type.toLowerCase().includes(type) : true,
        label ? definition.label.toLowerCase().includes(label) : true,
        category ? definition.category.toLowerCase().includes(category) : true,
        description ? definition.description.toLowerCase().includes(description) : true,
      ];
      return checks.every(Boolean);
    });
  };

  const tools: AgentFunctionTool[] = [
    {
      name: 'get_workflow',
      description: '按 workflow_id 读取指定工作流的最新已保存文件数据。默认返回摘要，summarize=false 返回完整数据。',
      inputSchema: schema({
        workflow_id: { type: 'string', description: '要读取的工作流 ID。' },
        summarize: { type: 'boolean', description: '是否返回摘要，默认 true。' },
      }, ['workflow_id']),
      annotations: { readOnly: true },
      execute: async (input) => {
        const workflowId = stringInput(asRecord(input), 'workflow_id');
        if (!workflowId) return { success: false, message: 'workflow_id is required' };
        const workflow = workflowService.getWorkflow(workflowId);
        if (!workflow) return { success: false, message: `Workflow not found: ${workflowId}` };
        return { success: true, data: summarizeWorkflow(workflow, booleanInput(asRecord(input), 'summarize', true)) };
      },
    },
    {
      name: 'get_current_workflow',
      description: '读取当前编辑器中的工作流草稿，包含尚未保存的编辑状态。默认返回摘要，summarize=false 返回完整 data；字符串 "false" 也按 false 处理。',
      inputSchema: schema({ summarize: { type: 'boolean', description: '是否返回摘要，默认 true。' } }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const summarize = booleanInput(asRecord(input), 'summarize', true);
        return {
          success: true,
          data: summarizeWorkflow(draft, summarize),
          ...workflowPayload(draft, summarize),
        };
      },
    },
    {
      name: 'create_workflow_version',
      description: '为当前工作流草稿创建版本快照，适合复杂或破坏性编辑前备份。',
      inputSchema: schema({ name: { type: 'string', description: '版本名称。' } }),
      execute: async (input) => {
        const name = stringInput(asRecord(input), 'name') ?? 'AI 修改前备份';
        const version = workflowService.createVersion(draft.id, {
          name,
          nodes: draft.nodes,
          edges: draft.edges,
        });
        versions.set(version.id, { nodes: clone(version.snapshot.nodes), edges: clone(version.snapshot.edges) });
        return { success: true, version_id: version.id, name: version.name };
      },
    },
    {
      name: 'restore_workflow_version',
      description: '恢复本次会话内 create_workflow_version 创建的版本快照。',
      inputSchema: schema({ version_id: { type: 'string', description: '要恢复的版本 ID。' } }, ['version_id']),
      execute: async (input) => {
        const versionId = stringInput(asRecord(input), 'version_id');
        const version = versionId ? versions.get(versionId) : undefined;
        if (!version) return { success: false, message: `Version not found: ${versionId ?? ''}` };
        return commit({ ...draft, nodes: clone(version.nodes), edges: clone(version.edges) });
      },
    },
    {
      name: 'search_nodes',
      description: '在当前工作流中搜索节点，支持 keyword/type/label/category/description 模糊匹配。',
      inputSchema: workflowSearchSchema(),
      annotations: { readOnly: true },
      execute: async (input) => {
        const record = asRecord(input);
        const defs = new Map(ctx.nodeDefinitions.map((definition) => [definition.type, definition]));
        const keyword = stringInput(record, 'keyword')?.toLowerCase();
        const type = stringInput(record, 'type')?.toLowerCase();
        const label = stringInput(record, 'label')?.toLowerCase();
        const category = stringInput(record, 'category')?.toLowerCase();
        const description = stringInput(record, 'description')?.toLowerCase();
        const nodes = draft.nodes.filter((node) => {
          const definition = defs.get(node.type);
          const checks = [
            keyword ? [node.id, node.type, node.label, definition?.label, definition?.category, definition?.description].filter(Boolean).join(' ').toLowerCase().includes(keyword) : true,
            type ? node.type.toLowerCase().includes(type) : true,
            label ? node.label.toLowerCase().includes(label) : true,
            category ? (definition?.category ?? '').toLowerCase().includes(category) : true,
            description ? (definition?.description ?? '').toLowerCase().includes(description) : true,
          ];
          return checks.every(Boolean);
        });
        if (nodes.length > 0) {
          return { success: true, nodes: nodes.map((node) => ({ ...node, definition: defs.get(node.type) })) };
        }
        return {
          success: true,
          nodes: searchDefinitions(record).map((definition) => ({
            type: definition.type,
            label: definition.label,
            category: definition.category,
            description: definition.description,
            definition,
          })),
        };
      },
    },
    {
      name: 'list_node_types',
      description: '分页查询当前工作流可用的节点类型列表，返回轻量摘要；支持 keyword/type/label/category/description 筛选。需要字段、输出和示例 data 时继续调用 search_node_usage。',
      inputSchema: schema({
        keyword: { type: 'string', description: '模糊搜索关键词，会同时匹配 type、label、category、description。' },
        type: { type: 'string', description: '按节点类型模糊筛选。' },
        label: { type: 'string', description: '按节点标签模糊筛选。' },
        category: { type: 'string', description: '按分类筛选。' },
        description: { type: 'string', description: '按节点描述模糊筛选。' },
        page: { type: 'number', description: '页码，从 1 开始，默认 1。' },
        pageSize: { type: 'number', description: '每页数量，默认 20，最大 50。' },
        page_size: { type: 'number', description: '每页数量，兼容蛇形命名。' },
      }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const record = asRecord(input);
        const filtered = searchDefinitions(record);
        const page = Math.max(1, numberInput(record, 'page', 1));
        const pageSize = Math.min(50, Math.max(1, numberInput(record, 'pageSize', numberInput(record, 'page_size', 20))));
        const items = filtered.slice((page - 1) * pageSize, page * pageSize);
        return {
          success: true,
          page,
          page_size: pageSize,
          total: filtered.length,
          available_total: ctx.nodeDefinitions.length,
          nodes: items.map(summarizeNodeDefinition),
        };
      },
    },
    {
      name: 'search_node_usage',
      description: '查询当前工作流可用节点类型的具体用法，返回字段说明、句柄、输出和示例 data。准备使用陌生节点前必须调用。',
      inputSchema: workflowSearchSchema(),
      annotations: { readOnly: true },
      execute: async (input) => {
        const nodes = searchDefinitions(asRecord(input));
        return {
          success: true,
          total: nodes.length,
          available_total: ctx.nodeDefinitions.length,
          nodes: nodes.map(describeNodeUsage),
        };
      },
    },
    {
      name: 'get_node_property_type_definition',
      description: '查询节点 properties[].type 对应的 data 值结构。遇到 agent 等非常见属性类型，写入或更新 data 前必须调用。',
      inputSchema: schema({
        type: { type: 'string', description: '属性类型名称，例如 agent。' },
        property_type: { type: 'string', description: '属性类型名称，兼容蛇形命名。' },
      }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const type = stringInputAny(asRecord(input), ['type', 'property_type']);
        if (!type) return { success: false, message: 'type is required' };
        const definition = getPropertyTypeDefinition(type);
        if (!definition) {
          return {
            success: false,
            message: `Unknown property type: ${type}`,
            known_types: Array.from(NODE_PROPERTY_TYPE_DEFINITIONS.keys()),
          };
        }
        return { success: true, type, definition, description: definition.description };
      },
    },
    {
      name: 'create_node',
      description: '在工作流中创建新节点。需要指定有效节点 type，可选 label、data。要创建到 loop_body 等作用域内，传 scopeNodeId/scope_node_id，或传 source/sourceHandle 让工具从 loop-body 句柄推断。',
      inputSchema: schema({
        type: { type: 'string', description: '节点类型标识。' },
        label: { type: 'string', description: '节点显示名称。' },
        data: { type: 'object', description: '节点参数数据。', properties: {} },
        scopeNodeId: { type: 'string', description: '可选，作用域容器节点 ID，例如 loop_body 节点 ID。' },
        scope_node_id: { type: 'string', description: '可选，作用域容器节点 ID，兼容蛇形命名。' },
        parentId: { type: 'string', description: '兼容参数，等同 scopeNodeId。' },
        parent_id: { type: 'string', description: '兼容参数，等同 scope_node_id。' },
        source: { type: 'string', description: '可选，前置节点 ID；当 sourceHandle=loop-body 时自动创建到对应 loop_body。' },
        sourceHandle: { type: 'string', description: '可选，前置节点连接点。' },
        source_handle: { type: 'string', description: '可选，前置节点连接点，兼容蛇形命名。' },
      }, ['type']),
      execute: async (input) => {
        const record = asRecord(input);
        const type = stringInput(record, 'type');
        if (!type) return { success: false, message: 'type is required' };
        const definition = definitionByType.get(type);
        if (!definition) return { success: false, message: `Unknown node type: ${type}` };
        const scopeNodeResult = resolveScopeNode(draft.nodes, record);
        if (!scopeNodeResult.success) return scopeNodeResult;
        const created = createWorkflowNodesForDefinition({
          definitions: ctx.nodeDefinitions,
          type,
          rootLabel: stringInput(record, 'label'),
          position: nextNodePosition(draft.nodes, scopeNodeResult.scopeNode),
          rootData: objectInput(record, 'data'),
          scopeNode: scopeNodeResult.scopeNode,
          createNodeId: createWorkflowNodeId,
        });
        if (!created) return { success: false, message: `Failed to create node type: ${type}` };
        return commit({
          ...draft,
          nodes: [...draft.nodes, ...created.nodes],
          edges: [...draft.edges, ...created.edges],
        }, {
          created_node_id: created.rootNode.id,
          created_node_ids: created.nodes.map((node) => node.id),
          created_edge_ids: created.edges.map((edge) => edge.id),
        });
      },
    },
    {
      name: 'update_node',
      description: '更新指定节点的 label 或 data。data 会与现有 data 浅合并；data 应传对象，兼容 JSON 字符串。',
      inputSchema: schema({
        nodeId: { type: 'string', description: '要更新的节点 ID。' },
        node_id: { type: 'string', description: '要更新的节点 ID，兼容蛇形命名。' },
        id: { type: 'string', description: '要更新的节点 ID，兼容旧参数。' },
        label: { type: 'string', description: '可选，节点显示名称。' },
        data: { type: ['object', 'string'], description: '要合并的节点参数对象；兼容 JSON 字符串。', properties: {} },
      }),
      execute: async (input) => {
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
        const targetNode = draft.nodes.find((node) => node.id === nodeId);
        if (!targetNode) return { success: false, message: `Node not found: ${nodeId}` };
        const definition = definitionByType.get(targetNode.type);
        if (definition) {
          const validation = validateNodeDataPatch(definition, dataResult.value);
          if (!validation.success) return validation;
        }
        let found = false;
        const nodes = draft.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          found = true;
          return {
            ...node,
            label: label ?? node.label,
            data: { ...node.data, ...dataResult.value },
          };
        });
        return found ? commit({ ...draft, nodes }) : { success: false, message: `Node not found: ${nodeId}` };
      },
    },
    {
      name: 'set_node_io_fields',
      description: '新增、合并或替换节点的输入/输出字段数组。输入字段写入 data.inputFields；输出字段写入 data.outputs。开始节点运行输入变量引用使用 {{ __data__["节点ID"].字段 }}，普通节点输出变量引用也使用 {{ __data__["节点ID"].字段 }}。',
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
        const nodes = draft.nodes.map((node) => {
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
        return found ? commit({ ...draft, nodes }) : { success: false, message: `Node not found: ${nodeId}` };
      },
    },
    {
      name: 'delete_node',
      description: '删除指定节点及其相关连线。',
      inputSchema: schema({
        nodeId: { type: 'string', description: '要删除的节点 ID。' },
        node_id: { type: 'string', description: '要删除的节点 ID，兼容蛇形命名。' },
      }),
      annotations: { destructive: true },
      execute: async (input) => {
        const nodeId = stringInputAny(asRecord(input), ['nodeId', 'node_id']);
        if (!nodeId) return { success: false, message: 'nodeId is required' };
        if (!draft.nodes.some((node) => node.id === nodeId)) return { success: false, message: `Node not found: ${nodeId}` };
        return commit({
          ...draft,
          nodes: draft.nodes.filter((node) => node.id !== nodeId),
          edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        });
      },
    },
    {
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
        const record = asRecord(input);
        const source = stringInput(record, 'source');
        const target = stringInput(record, 'target');
        if (!source || !target) return { success: false, message: 'source and target are required' };
        if (!draft.nodes.some((node) => node.id === source)) return { success: false, message: `Source node not found: ${source}` };
        if (!draft.nodes.some((node) => node.id === target)) return { success: false, message: `Target node not found: ${target}` };
        const edge: WorkflowEdge = {
          id: `e-${source}-${target}-${Date.now().toString(36)}`,
          source,
          target,
          sourceHandle: stringInputAny(record, ['sourceHandle', 'source_handle']) ?? undefined,
          targetHandle: stringInputAny(record, ['targetHandle', 'target_handle']) ?? undefined,
        };
        const replacement = replaceConflictingScopedEdges(draft.nodes, draft.edges, edge);
        return commit({ ...draft, edges: [...replacement.edges, edge] }, {
          removed_edge_ids: replacement.removedEdgeIds,
        });
      },
    },
    {
      name: 'delete_edge',
      description: '删除指定连线。',
      inputSchema: schema({
        edgeId: { type: 'string', description: '要删除的连线 ID。' },
        edge_id: { type: 'string', description: '要删除的连线 ID，兼容蛇形命名。' },
      }),
      annotations: { destructive: true },
      execute: async (input) => {
        const edgeId = stringInputAny(asRecord(input), ['edgeId', 'edge_id']);
        if (!edgeId) return { success: false, message: 'edgeId is required' };
        if (!draft.edges.some((edge) => edge.id === edgeId)) return { success: false, message: `Edge not found: ${edgeId}` };
        return commit({ ...draft, edges: draft.edges.filter((edge) => edge.id !== edgeId) });
      },
    },
    {
      name: 'insert_node',
      description: '在已有连线中插入节点，替换为 source -> 节点 -> target 两条边。可传 nodeId/node_id 复用现有节点；不传时会优先复用同作用域内未连线且类型/标签/data 匹配的节点，避免先 create_node 后再 delete_node。',
      inputSchema: schema({
        edgeId: { type: 'string', description: '要插入的边 ID。' },
        edge_id: { type: 'string', description: '要插入的边 ID，兼容蛇形命名。' },
        nodeId: { type: 'string', description: '可选，要复用并插入的现有节点 ID。' },
        node_id: { type: 'string', description: '可选，要复用并插入的现有节点 ID，兼容蛇形命名。' },
        type: { type: 'string', description: '新节点类型。' },
        label: { type: 'string', description: '新节点显示名称。' },
        data: { type: 'object', description: '新节点参数。', properties: {} },
      }),
      execute: async (input) => {
        const record = asRecord(input);
        const edgeId = stringInputAny(record, ['edgeId', 'edge_id']);
        const type = stringInput(record, 'type');
        const reuseNodeId = stringInputAny(record, ['nodeId', 'node_id']);
        const edge = draft.edges.find((item) => item.id === edgeId);
        if (!edge) return { success: false, message: `Edge not found: ${edgeId ?? ''}` };
        const sourceNode = draft.nodes.find((node) => node.id === edge.source);
        const targetNode = draft.nodes.find((node) => node.id === edge.target);
        const scopeNode = getInsertScopeNode(draft.nodes, edge.source, edge.sourceHandle);
        const insertPosition = {
          x: ((sourceNode?.position.x ?? 0) + (targetNode?.position.x ?? 260)) / 2,
          y: ((sourceNode?.position.y ?? 0) + (targetNode?.position.y ?? 0)) / 2,
        };
        const data = objectInput(record, 'data');
        const reuseNode = reuseNodeId
          ? draft.nodes.find((node) => node.id === reuseNodeId)
          : findReusableInsertNode(draft.nodes, draft.edges, {
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
          ? draft.nodes.map((item) => item.id === node.id ? node : item)
          : [...draft.nodes, node];
        return commit({
          ...draft,
          nodes,
          edges: [
            ...draft.edges.filter((item) => item.id !== edgeId),
            { id: `e-${edge.source}-${nodeId}`, source: edge.source, target: nodeId, sourceHandle: edge.sourceHandle },
            { id: `e-${nodeId}-${edge.target}`, source: nodeId, target: edge.target, targetHandle: edge.targetHandle },
          ],
        }, {
          inserted_node_id: nodeId,
          reused_node: !!reuseNode,
        });
      },
    },
    {
      name: 'batch_update',
      description: '批量执行 create_node/update_node/delete_node/create_edge/delete_edge 操作。',
      inputSchema: schema({
        operations: {
          type: 'array',
          description: '每项为 { tool, args }。',
          items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object', properties: {} } } },
        },
      }, ['operations']),
      execute: async (input) => {
        const operationsInput = asRecord(input).operations;
        const operations = Array.isArray(operationsInput) ? operationsInput : [];
        const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
        const results: unknown[] = [];
        for (const operation of operations) {
          const record = asRecord(operation);
          const toolName = stringInput(record, 'tool');
          if (!toolName || toolName === 'batch_update') return { success: false, message: `Invalid batch tool: ${toolName ?? ''}` };
          const tool = toolMap.get(toolName);
          if (!tool) return { success: false, message: `Unknown batch tool: ${toolName}` };
          const result = await tool.execute(record.args);
          results.push(result);
          if (asRecord(result).success === false) return { success: false, results };
        }
        return workflowResult(true, 'batch updated', results);
      },
    },
    {
      name: 'auto_layout',
      description: '自动整理当前工作流节点位置。direction 可选 LR 或 TB。',
      inputSchema: schema({ direction: { type: 'string', description: '布局方向，LR 或 TB，默认 LR。' } }),
      execute: async (input) => {
        const direction = stringInput(asRecord(input), 'direction') === 'TB' ? 'TB' : 'LR';
        const nodes = layoutNodes(draft.nodes, draft.edges, ctx.nodeDefinitions, direction);
        const affectedNodeCount = countPositionChanges(draft.nodes, nodes);
        return commit({ ...draft, nodes }, { affected_node_count: affectedNodeCount });
      },
    },
    {
      name: 'saveworkflow',
      description: '保存当前工作流草稿到后端，触发后端工作流校验，并返回后端文本。通常在 auto_layout 后调用；success=false 时根据 message 修正工作流。',
      inputSchema: schema({}),
      execute: async () => {
        try {
          const saved = workflowService.updateWorkflow(draft.id, draft);
          draft = cloneWorkflow(saved);
          const backendMessage = 'Workflow saved and backend validation passed.';
          return workflowResult(true, backendMessage, undefined, {
            ...workflowPayload(draft, false),
            backend_message: backendMessage,
          });
          return workflowResult(true, '工作流已保存，后端校验通过。', undefined, {
            backend_message: '工作流已保存，后端校验通过。',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '保存工作流失败';
          return {
            success: false,
            message,
            backend_message: message,
          };
        }
      },
    },
  ];

  return Object.assign(tools, {
    getDraftWorkflow: () => cloneWorkflow(draft),
  });
}
