import Dagre from '@dagrejs/dagre';
import type { NodeTypeDefinition, OutputField, Workflow, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import {
  createWorkflowNodesForDefinition,
  findCompositeChildByRole,
  getCompositeParentId,
  isHiddenWorkflowEdge,
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
  LOOP_BODY_NODE_TYPE,
  LOOP_BODY_ROLE,
  LOOP_BODY_SOURCE_HANDLE,
} from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import * as workflowService from '../workflow.js';

export interface WorkflowEditorToolContext {
  workflow: Workflow;
  nodeDefinitions: NodeTypeDefinition[];
}

type JsonRecord = Record<string, unknown>;

const WORKFLOW_AGENT_SYSTEM_PROMPT = `你是 Agent Spaces 的工作流编辑助手。你的职责是帮助用户创建、修改、排查和优化当前可视化工作流。

回复规则：
- 回复使用中文。
- 优先通过工具直接完成工作流编辑，而不是只给口头建议。
- 只有在本轮实际调用了对应编辑工具并看到 success=true 的工具结果后，才能说“已创建”“已连接”“已更新”。
- 不要臆测节点字段结构、变量写法或连线方式。

工作流编辑硬规则：
1. 准备使用、创建、插入或更新某个节点类型前，必须先调用 search_node_usage 查看节点定义。
2. 如果用户只描述用途但没给出节点类型，先用 list_node_types 找候选，再用 search_node_usage 看具体字段、句柄和使用说明。
3. 编辑现有工作流前，优先调用 get_current_workflow；需要完整 data 时用 summarize=false。
4. 节点参数里的字符串值支持变量引用。上游节点输出和开始节点工作流输入都使用 {{ __data__["节点ID"].字段路径 }}；普通节点自身输入字段兼容 {{ __inputs__["节点ID"].字段路径 }}；当前运行上下文使用 {{ context.some.path }}。
5. 开始节点或支持输入字段的节点，输入字段定义来自 data.inputFields。需要新增或替换输入字段时优先调用 set_node_io_fields，field_kind=inputFields。引用开始节点的运行输入时必须使用 {{ __data__["开始节点ID"].字段 }}。
6. 结束节点返回结果来自 data.outputs，设置时优先调用 set_node_io_fields，field_kind=outputs；变量放在每个输出项的 value 里，例如 { key, type, value }。
7. 需要数据整形、字段映射或结构转换时，优先插入 run_code 节点；代码中不要写 {{ }}，也不要从 __data__ 读取数据，必须定义 async function main({ params, context })。
8. run_code 的上游输入必须先写入 data.inputFields，例如 { key: "agentResult", type: "string", value: "{{ __data__[\"上游节点ID\"].result }}" }；代码里始终用 params.agentResult 读取。
9. run_code 返回结构变化后，要同步设置节点的 data.outputs，让下游变量选择器能看到字段。
10. 复杂、多步、批量或破坏性改动前先调用 create_workflow_version。
11. 修改后必须调用 auto_layout 整理画布，然后调用 saveworkflow 保存并读取后端返回文本；如果 saveworkflow 返回 success=false，必须根据返回文本继续修正，不能声称已完成。
12. 在 loop 内创建节点时，必须把节点放进 loop_body：create_node 传 scopeNodeId/scope_node_id 为 loop_body 节点 ID；如果从 loop 的 loop-body 句柄继续创建，也可以传 source 和 sourceHandle=loop-body 让工具自动推断。

约束：
- 只能使用本次 Agent Spaces runtime 暴露的工作流编辑工具。
- 不要编造节点类型、参数或执行结果；工具结果不足时明确说明需要补充信息。`;

const SCOPE_CONTAINER_PADDING = { top: 80, right: 100, bottom: 80, left: 80 };
const MIN_SCOPE_CONTAINER_SIZE = { width: 220, height: 160 };
const LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE = { width: 150, height: 260 };

export function buildWorkflowEditorSystemPrompt(workflow: Workflow, selectedNodes?: WorkflowNode[]): string {
  const summary = summarizeWorkflow(workflow, true);
  const selected = selectedNodes?.length
    ? `\n\n## 当前选中节点\n\n\`\`\`json\n${JSON.stringify(selectedNodes, null, 2)}\n\`\`\``
    : '';

  return `${WORKFLOW_AGENT_SYSTEM_PROMPT}

---

## 当前工作流

当前 workflow_id: ${workflow.id}

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`${selected}`;
}

export function createWorkflowEditorFunctionTools(ctx: WorkflowEditorToolContext): AgentFunctionTool[] {
  const versions = new Map<string, Pick<Workflow, 'nodes' | 'edges'>>();
  let draft = cloneWorkflow(ctx.workflow);

  const commit = (next: Workflow, meta?: JsonRecord) => {
    draft = {
      ...next,
      nodes: clone(next.nodes),
      edges: clone(next.edges),
      updatedAt: Date.now(),
    };
    return workflowResult(true, 'updated', draft, undefined, meta);
  };

  const commitCompact = (next: Workflow, meta?: JsonRecord) => {
    draft = {
      ...next,
      nodes: clone(next.nodes),
      edges: clone(next.edges),
      updatedAt: Date.now(),
    };
    return workflowPatchResult(true, 'updated', draft, meta);
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
        return { success: true, workflow: summarizeWorkflow(workflow, booleanInput(asRecord(input), 'summarize', true)) };
      },
    },
    {
      name: 'get_current_workflow',
      description: '读取当前编辑器中的工作流草稿，包含尚未保存的编辑状态。默认返回摘要，summarize=false 返回完整 data；字符串 "false" 也按 false 处理。',
      inputSchema: schema({ summarize: { type: 'boolean', description: '是否返回摘要，默认 true。' } }),
      annotations: { readOnly: true },
      execute: async (input) => ({
        success: true,
        workflow: summarizeWorkflow(draft, booleanInput(asRecord(input), 'summarize', true)),
      }),
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
        return { success: true, nodes: nodes.map((node) => ({ ...node, definition: defs.get(node.type) })) };
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
        let found = false;
        const nodes = draft.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          found = true;
          return {
            ...node,
            label: stringInput(record, 'label') ?? node.label,
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
        return workflowResult(true, 'batch updated', draft, results);
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
        return commitCompact({ ...draft, nodes }, { affected_node_count: affectedNodeCount });
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
          return workflowResult(true, '工作流已保存，后端校验通过。', draft, undefined, {
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

  return tools;
}

function workflowResult(success: boolean, message: string, workflow: Workflow, results?: unknown[], meta?: JsonRecord) {
  return {
    success,
    message,
    ...meta,
    workflow,
    workflow_patch: {
      workflow_id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      updatedAt: workflow.updatedAt,
    },
    results,
  };
}

function workflowPatchResult(success: boolean, message: string, workflow: Workflow, meta?: JsonRecord) {
  return {
    success,
    message,
    ...meta,
    workflow_patch: {
      workflow_id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      updatedAt: workflow.updatedAt,
    },
  };
}

function summarizeWorkflow(workflow: Workflow, summarize: boolean): unknown {
  if (!summarize) return workflow;
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      dataKeys: Object.keys(node.data ?? {}),
      inputFields: summarizeOutputFields(node.data?.inputFields),
      outputs: summarizeOutputFields(node.data?.outputs),
    })),
    edges: workflow.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })),
  };
}

function summarizeNodeDefinition(definition: NodeTypeDefinition) {
  return {
    type: definition.type,
    label: definition.label,
    category: definition.category,
    description: definition.description,
    handles: definition.handles,
  };
}

function describeNodeUsage(definition: NodeTypeDefinition) {
  const runCodeUsage = definition.type === 'run_code'
    ? {
        runCode: 'run_code 支持 data.inputFields 作为代码输入参数。把上游变量引用配置到 inputFields[].value，例如 { key: "agentResult", type: "string", value: "{{ __data__[\\"上游节点ID\\"].result }}" }；JS 代码必须使用 async function main({ params, context })，并通过 params.agentResult 读取。不要在代码签名或代码体里使用 __data__，代码里也不要写 {{ }}。',
      }
    : {};
  return {
    ...definition,
    exampleData: defaultData(definition),
    usage: {
      variables: '字符串字段支持 {{ __data__["节点ID"].字段路径 }} 和 {{ context.some.path }}。开始节点的工作流输入也通过 {{ __data__["开始节点ID"].字段 }} 引用；{{ __inputs__["节点ID"].字段路径 }} 仅作为普通节点输入字段的兼容语法。',
      handles: definition.handles ?? {},
      ...runCodeUsage,
    },
  };
}

function defaultData(definition: NodeTypeDefinition): JsonRecord {
  const data: JsonRecord = {};
  for (const property of definition.properties ?? []) {
    if (property.default !== undefined) data[property.key] = clone(property.default);
  }
  return data;
}

function nextNodePosition(nodes: WorkflowNode[], scopeNode?: WorkflowNode | null): WorkflowNode['position'] {
  if (!scopeNode) {
    if (!nodes.length) return { x: 120, y: 120 };
    const maxX = Math.max(...nodes.map((node) => node.position.x));
    const avgY = nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length;
    return { x: maxX + 260, y: Math.round(avgY) };
  }

  const children = nodes.filter((node) => getCompositeParentId(node) === scopeNode.id && !isHiddenWorkflowNode(node));
  if (!children.length) return { x: scopeNode.position.x + 80, y: scopeNode.position.y + 80 };
  const maxX = Math.max(...children.map((node) => node.position.x));
  const avgY = children.reduce((sum, node) => sum + node.position.y, 0) / children.length;
  return { x: maxX + 260, y: Math.round(avgY) };
}

function resolveScopeNode(
  nodes: WorkflowNode[],
  input: JsonRecord,
): { success: true; scopeNode: WorkflowNode | null } | { success: false; message: string } {
  const scopeNodeId = stringInputAny(input, ['scopeNodeId', 'scope_node_id', 'parentId', 'parent_id']);
  if (scopeNodeId) {
    const scopeNode = nodes.find((node) => node.id === scopeNodeId);
    if (!scopeNode) return { success: false, message: `Scope node not found: ${scopeNodeId}` };
    if (!isScopeBoundaryWorkflowNode(scopeNode)) return { success: false, message: `Scope node is not a scope boundary: ${scopeNodeId}` };
    return { success: true, scopeNode };
  }

  return {
    success: true,
    scopeNode: getInsertScopeNode(
      nodes,
      stringInput(input, 'source'),
      stringInputAny(input, ['sourceHandle', 'source_handle']),
    ),
  };
}

function getInsertScopeNode(
  nodes: WorkflowNode[],
  sourceNodeId?: string | null,
  sourceHandle?: string | null,
): WorkflowNode | null {
  if (!sourceNodeId) return null;
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  if (sourceNode?.type === LOOP_BODY_NODE_TYPE) return sourceNode;
  if (sourceHandle === LOOP_BODY_SOURCE_HANDLE) {
    return findCompositeChildByRole(nodes, sourceNodeId, LOOP_BODY_ROLE) ?? null;
  }

  let current = sourceNode;
  while (current) {
    const parentId = getCompositeParentId(current);
    if (!parentId) return null;
    const parent = nodes.find((node) => node.id === parentId);
    if (!parent) return null;
    if (isScopeBoundaryWorkflowNode(parent)) return parent;
    current = parent;
  }
  return null;
}

function replaceConflictingScopedEdges(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  edge: WorkflowEdge,
): { edges: WorkflowEdge[]; removedEdgeIds: string[] } {
  const sourceScopeId = getNodeScopeId(nodes, edge.source);
  const targetScopeId = getNodeScopeId(nodes, edge.target);
  if (!sourceScopeId || sourceScopeId !== targetScopeId) return { edges, removedEdgeIds: [] };

  const removedEdgeIds: string[] = [];
  const nextEdges = edges.filter((existing) => {
    if (existing.source === edge.source && existing.target === edge.target
      && normalizedHandle(existing.sourceHandle) === normalizedHandle(edge.sourceHandle)
      && normalizedHandle(existing.targetHandle) === normalizedHandle(edge.targetHandle)) {
      removedEdgeIds.push(existing.id);
      return false;
    }
    if (existing.composite?.locked) return true;
    if (getNodeScopeId(nodes, existing.source) !== sourceScopeId || getNodeScopeId(nodes, existing.target) !== sourceScopeId) {
      return true;
    }

    const conflictsWithSource = existing.source === edge.source
      && normalizedHandle(existing.sourceHandle) === normalizedHandle(edge.sourceHandle);
    const conflictsWithTarget = existing.target === edge.target
      && normalizedHandle(existing.targetHandle) === normalizedHandle(edge.targetHandle);
    if (!conflictsWithSource && !conflictsWithTarget) return true;

    removedEdgeIds.push(existing.id);
    return false;
  });

  return { edges: nextEdges, removedEdgeIds };
}

function findReusableInsertNode(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options: { type?: string; label?: string; data: JsonRecord; scopeNode: WorkflowNode | null },
): WorkflowNode | undefined {
  if (!options.type) return undefined;
  const scopeId = options.scopeNode?.id ?? null;
  return nodes.find((node) => {
    if (node.type !== options.type) return false;
    if (getCompositeParentId(node) !== scopeId) return false;
    if (isGeneratedWorkflowNodeLike(node)) return false;
    if (options.label && node.label !== options.label) return false;
    if (!objectContains(node.data ?? {}, options.data)) return false;
    return !edges.some((edge) => edge.source === node.id || edge.target === node.id);
  });
}

function isGeneratedWorkflowNodeLike(node: WorkflowNode): boolean {
  return !!node.composite?.generated;
}

function objectContains(actual: JsonRecord, expected: JsonRecord): boolean {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

function getNodeScopeId(nodes: WorkflowNode[], nodeId: string): string | null {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  return getCompositeParentId(node);
}

function normalizedHandle(value: string | null | undefined): string | null {
  return value ?? null;
}

function layoutNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  definitions: NodeTypeDefinition[],
  direction: 'LR' | 'TB',
): WorkflowNode[] {
  let nextNodes = nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } }));
  nextNodes = layoutScopeNodes(nextNodes, edges, definitions, direction, null);

  const scopeNodeIds = nextNodes
    .filter((node) => !isHiddenWorkflowNode(node) && isScopeBoundaryWorkflowNode(node))
    .map((node) => node.id);

  for (const scopeNodeId of scopeNodeIds) {
    nextNodes = layoutScopeNodes(nextNodes, edges, definitions, direction, scopeNodeId);
    syncScopeBoundaryLayout(nextNodes, definitions, scopeNodeId);
  }

  return nextNodes;
}

function layoutScopeNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  definitions: NodeTypeDefinition[],
  direction: 'LR' | 'TB',
  scopeNodeId: string | null,
): WorkflowNode[] {
  const graph = new Dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  const definitionByType = new Map(definitions.map((definition) => [definition.type, definition]));
  const layoutNodes = nodes.filter((node) => !isHiddenWorkflowNode(node) && getCompositeParentId(node) === scopeNodeId);
  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  const nodeSizes = new Map<string, { width: number; height: number }>();
  const scopeNode = scopeNodeId ? nodes.find((node) => node.id === scopeNodeId) : null;

  for (const node of layoutNodes) {
    const definition = definitionByType.get(node.type);
    const size = {
      width: typeof node.data?.nodeWidth === 'number' ? node.data.nodeWidth : definition?.customViewMinSize?.width || 220,
      height: typeof node.data?.nodeHeight === 'number' ? node.data.nodeHeight : definition?.customViewMinSize?.height || 120,
    };
    nodeSizes.set(node.id, size);
    graph.setNode(node.id, size);
  }

  for (const edge of edges.filter((edge) =>
    !isHiddenWorkflowEdge(edge)
    && layoutNodeIds.has(edge.source)
    && layoutNodeIds.has(edge.target)
  )) {
    graph.setEdge(edge.source, edge.target);
  }

  Dagre.layout(graph);

  const nextNodes = nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } }));
  const nodeById = new Map(nextNodes.map((node) => [node.id, node]));
  const bounds = getLayoutGraphBounds(layoutNodes, graph, nodeSizes);
  const scopeOffset = scopeNode && bounds ? {
    x: scopeNode.position.x + SCOPE_CONTAINER_PADDING.left - bounds.minX,
    y: scopeNode.position.y + SCOPE_CONTAINER_PADDING.top - bounds.minY,
  } : { x: 0, y: 0 };

  for (const node of layoutNodes) {
    const nextNode = nodeById.get(node.id);
    const layoutPosition = graph.node(node.id);
    const size = nodeSizes.get(node.id);
    if (!nextNode || !layoutPosition) continue;

    const nextPosition = {
      x: layoutPosition.x - (size?.width ?? 220) / 2 + scopeOffset.x,
      y: layoutPosition.y - (size?.height ?? 120) / 2 + scopeOffset.y,
    };

    if (isScopeBoundaryWorkflowNode(nextNode)) {
      const dx = nextPosition.x - nextNode.position.x;
      const dy = nextPosition.y - nextNode.position.y;
      for (const child of nextNodes.filter((item) => getCompositeParentId(item) === nextNode.id)) {
        child.position = {
          x: child.position.x + dx,
          y: child.position.y + dy,
        };
      }
    }

    nextNode.position = nextPosition;
  }

  return nextNodes;
}

function getLayoutGraphBounds(
  layoutNodes: WorkflowNode[],
  graph: InstanceType<typeof Dagre.graphlib.Graph>,
  nodeSizes: Map<string, { width: number; height: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!layoutNodes.length) return null;

  const bounds = layoutNodes
    .map((node) => {
      const layoutPosition = graph.node(node.id) as { x?: number; y?: number } | undefined;
      const size = nodeSizes.get(node.id);
      if (typeof layoutPosition?.x !== 'number' || typeof layoutPosition.y !== 'number' || !size) return null;
      return {
        minX: layoutPosition.x - size.width / 2,
        minY: layoutPosition.y - size.height / 2,
        maxX: layoutPosition.x + size.width / 2,
        maxY: layoutPosition.y + size.height / 2,
      };
    })
    .filter((item): item is { minX: number; minY: number; maxX: number; maxY: number } => !!item);

  if (!bounds.length) return null;
  return {
    minX: Math.min(...bounds.map((item) => item.minX)),
    minY: Math.min(...bounds.map((item) => item.minY)),
    maxX: Math.max(...bounds.map((item) => item.maxX)),
    maxY: Math.max(...bounds.map((item) => item.maxY)),
  };
}

function syncScopeBoundaryLayout(
  nodes: WorkflowNode[],
  definitions: NodeTypeDefinition[],
  scopeNodeId: string,
): void {
  const scopeNode = nodes.find((node) => node.id === scopeNodeId);
  if (!scopeNode || !isScopeBoundaryWorkflowNode(scopeNode)) return;

  const children = nodes.filter((node) => getCompositeParentId(node) === scopeNodeId && !isHiddenWorkflowNode(node));
  if (!children.length) return;

  const minX = Math.min(...children.map((node) => node.position.x));
  const minY = Math.min(...children.map((node) => node.position.y));
  const maxX = Math.max(...children.map((node) => {
    const size = getWorkflowNodeSize(node, definitions);
    return node.position.x + size.width;
  }));
  const maxY = Math.max(...children.map((node) => {
    const size = getWorkflowNodeSize(node, definitions);
    return node.position.y + size.height;
  }));
  const minSize = scopeNode.type === LOOP_BODY_NODE_TYPE ? LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE : MIN_SCOPE_CONTAINER_SIZE;

  scopeNode.position = {
    x: minX - SCOPE_CONTAINER_PADDING.left,
    y: minY - SCOPE_CONTAINER_PADDING.top,
  };
  scopeNode.data = {
    ...scopeNode.data,
    nodeWidth: Math.max(minSize.width, maxX - minX + SCOPE_CONTAINER_PADDING.left + SCOPE_CONTAINER_PADDING.right),
    nodeHeight: Math.max(minSize.height, maxY - minY + SCOPE_CONTAINER_PADDING.top + SCOPE_CONTAINER_PADDING.bottom),
  };
}

function getWorkflowNodeSize(
  node: WorkflowNode,
  definitions: NodeTypeDefinition[],
): { width: number; height: number } {
  const definition = definitions.find((item) => item.type === node.type);
  return {
    width: typeof node.data?.nodeWidth === 'number'
      ? node.data.nodeWidth
      : typeof node.data?.width === 'number' ? node.data.width : definition?.customViewMinSize?.width || 220,
    height: typeof node.data?.nodeHeight === 'number'
      ? node.data.nodeHeight
      : typeof node.data?.height === 'number' ? node.data.height : definition?.customViewMinSize?.height || 120,
  };
}

function countPositionChanges(before: WorkflowNode[], after: WorkflowNode[]): number {
  const beforeById = new Map(before.map((node) => [node.id, node.position]));
  return after.filter((node) => {
    const previous = beforeById.get(node.id);
    return previous && (previous.x !== node.position.x || previous.y !== node.position.y);
  }).length;
}

function searchableDefinitionText(definition: NodeTypeDefinition): string {
  return [
    definition.type,
    definition.label,
    definition.category,
    definition.description,
    ...definition.properties.map((property) => `${property.key} ${property.label} ${property.tooltip ?? ''}`),
    ...(definition.outputs ?? []).map((output) => `${output.key} ${output.type} ${output.description ?? ''}`),
  ].join(' ').toLowerCase();
}

function workflowSearchSchema(): Record<string, unknown> {
  return schema({
    keyword: { type: 'string', description: '模糊搜索关键词。' },
    name: { type: 'string', description: '兼容参数，按节点 type 或 label 搜索。' },
    nodeType: { type: 'string', description: '兼容参数，按节点 type 搜索。' },
    node_type: { type: 'string', description: '兼容参数，按节点 type 搜索。' },
    type: { type: 'string', description: '按节点类型筛选。' },
    label: { type: 'string', description: '按节点标签筛选。' },
    category: { type: 'string', description: '按分类筛选。' },
    description: { type: 'string', description: '按描述筛选。' },
  });
}

function schema(properties: Record<string, unknown>, required?: string[]): Record<string, unknown> {
  return { type: 'object', properties, ...(required?.length ? { required } : {}) };
}

function asRecord(input: unknown): JsonRecord {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {};
}

function stringInput(input: JsonRecord, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringInputAny(input: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringInput(input, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function numberInput(input: JsonRecord, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanInput(input: JsonRecord, key: string, fallback: boolean): boolean {
  const value = input[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function booleanInputAny(input: JsonRecord, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'boolean') return value;
  }
  return fallback;
}

function objectInput(input: JsonRecord, key: string): JsonRecord {
  const result = objectInputResult(input, key);
  return result.success ? result.value : {};
}

function objectInputResult(input: JsonRecord, key: string): { success: true; value: JsonRecord } | { success: false; message: string } {
  const value = input[key];
  if (value === undefined) return { success: true, value: {} };
  if (value && typeof value === 'object' && !Array.isArray(value)) return { success: true, value: value as JsonRecord };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { success: true, value: parsed as JsonRecord };
      return { success: false, message: `${key} JSON must be an object` };
    } catch {
      return { success: false, message: `${key} must be an object or JSON object string` };
    }
  }
  return { success: false, message: `${key} must be an object` };
}

function summarizeOutputFields(value: unknown): Array<Pick<OutputField, 'key' | 'type' | 'description' | 'required'>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((field): field is OutputField => field && typeof field === 'object' && !Array.isArray(field))
    .map((field) => ({
      key: String(field.key ?? ''),
      type: String(field.type ?? 'any') as OutputField['type'],
      description: typeof field.description === 'string' ? field.description : undefined,
      required: typeof field.required === 'boolean' ? field.required : undefined,
    }))
    .filter((field) => field.key);
}

function outputFieldsInput(value: unknown): { success: true; fields: OutputField[] } | { success: false; message: string } {
  const normalized = arrayInput(value, 'fields');
  if (!normalized.success) return normalized;
  const fields: OutputField[] = [];
  for (const item of normalized.value) {
    const field = normalizeOutputField(item);
    if (!field) return { success: false, message: 'each field must include non-empty string key and type' };
    fields.push(field);
  }
  return { success: true, fields };
}

function arrayInput(value: unknown, key: string): { success: true; value: unknown[] } | { success: false; message: string } {
  if (Array.isArray(value)) return { success: true, value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return { success: true, value: parsed };
      return { success: false, message: `${key} JSON must be an array` };
    } catch {
      return { success: false, message: `${key} must be an array or JSON array string` };
    }
  }
  return { success: false, message: `${key} must be an array` };
}

function normalizeOutputField(value: unknown): OutputField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  const key = typeof record.key === 'string' ? record.key.trim() : '';
  const type = typeof record.type === 'string' ? record.type.trim() : '';
  if (!key || !type) return null;
  const field: OutputField = { key, type: type as OutputField['type'] };
  if ('value' in record) field.value = clone(record.value);
  if (typeof record.fileNameFilter === 'string') field.fileNameFilter = record.fileNameFilter;
  if (typeof record.description === 'string') field.description = record.description;
  if (typeof record.required === 'boolean') field.required = record.required;
  if (Array.isArray(record.children)) {
    const children = record.children.map(normalizeOutputField);
    if (children.some((child) => !child)) return null;
    field.children = children as OutputField[];
  }
  return field;
}

function mergeOutputFields(existing: OutputField[], incoming: OutputField[], mode: 'append' | 'merge' | 'replace'): OutputField[] {
  if (mode === 'replace') return clone(incoming);
  if (mode === 'append') return [...clone(existing), ...clone(incoming)];

  const merged = clone(existing);
  const indexByKey = new Map(merged.map((field, index) => [field.key, index]));
  for (const field of incoming) {
    const index = indexByKey.get(field.key);
    if (index === undefined) {
      indexByKey.set(field.key, merged.length);
      merged.push(clone(field));
    } else {
      merged[index] = { ...merged[index], ...clone(field) };
    }
  }
  return merged;
}

function createWorkflowNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneWorkflow(workflow: Workflow): Workflow {
  return clone(workflow);
}
